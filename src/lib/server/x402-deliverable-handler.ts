import type { Invoice } from "@/domain/invoice";
import type { InvoiceRepository } from "@/lib/server/invoice-repository";
import type { X402Gateway } from "@/lib/server/x402-gateway";

type HandlerDependencies = {
  repository: InvoiceRepository;
  readDeliverable(storageKey: string): Promise<Buffer>;
  getGateway(): Promise<X402Gateway | null>;
};

type HandlerParams = {
  invoiceId: string;
  milestoneId: string;
};

function jsonResponse(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): Response {
  return Response.json(body, { status, headers });
}

function deliverableResponse(input: {
  contents: Buffer;
  name: string;
  mimeType?: string;
  settlement: "confirmed" | "previously-confirmed";
  paymentHeaders?: Record<string, string>;
}): Response {
  const headers = new Headers(input.paymentHeaders);
  headers.set("Content-Type", input.mimeType || "application/octet-stream");
  headers.set("Content-Length", String(input.contents.byteLength));
  headers.set(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(input.name)}`,
  );
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-TendaPay-Settlement", input.settlement);

  const body = new Uint8Array(input.contents.byteLength);
  body.set(input.contents);
  return new Response(body.buffer, { status: 200, headers });
}

export async function handleX402Deliverable(
  request: Request,
  params: HandlerParams,
  dependencies: HandlerDependencies,
): Promise<Response> {
  const invoice = await dependencies.repository.findById(params.invoiceId);
  const milestone = invoice?.milestones.find(
    (candidate) => candidate.id === params.milestoneId,
  );

  if (!invoice || !milestone) {
    return jsonResponse({ error: "Invoice or milestone not found." }, 404);
  }

  if (!milestone.deliverableStorageKey || !milestone.deliverableName) {
    return jsonResponse(
      { error: "This milestone has no attached deliverable." },
      404,
    );
  }

  if (["paid", "released"].includes(milestone.status)) {
    const contents = await dependencies.readDeliverable(
      milestone.deliverableStorageKey,
    );
    return deliverableResponse({
      contents,
      name: milestone.deliverableName,
      mimeType: milestone.deliverableMimeType,
      settlement: "previously-confirmed",
    });
  }

  const gateway = await dependencies.getGateway();

  if (!gateway) {
    return jsonResponse(
      { error: "The x402 facilitator is not configured." },
      503,
    );
  }

  const paymentData =
    request.headers.get("PAYMENT-SIGNATURE") || request.headers.get("X-PAYMENT");
  const settlement = await gateway.settle({
    resourceUrl: request.url,
    paymentData,
    payTo: invoice.freelancerWallet,
    priceCents: milestone.amountCents,
    description: `${invoice.number}: ${milestone.title}`,
    mimeType: milestone.deliverableMimeType || "application/octet-stream",
    invoiceId: invoice.id,
    milestoneId: milestone.id,
  });

  if (!settlement.settled) {
    return jsonResponse(
      settlement.responseBody,
      settlement.status,
      settlement.responseHeaders,
    );
  }

  let updatedInvoice: Invoice | null;

  try {
    updatedInvoice = await dependencies.repository.confirmPayment(
      invoice.id,
      milestone.id,
      {
        transactionHash: settlement.transactionHash,
        payerAddress: settlement.payerAddress,
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "This transaction has already settled another milestone."
    ) {
      return jsonResponse({ error: error.message }, 409);
    }

    throw error;
  }

  if (!updatedInvoice) {
    return jsonResponse({ error: "Invoice or milestone not found." }, 404);
  }

  const contents = await dependencies.readDeliverable(
    milestone.deliverableStorageKey,
  );
  return deliverableResponse({
    contents,
    name: milestone.deliverableName,
    mimeType: milestone.deliverableMimeType,
    settlement: "confirmed",
    paymentHeaders: settlement.responseHeaders,
  });
}
