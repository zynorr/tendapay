import { NextResponse } from "next/server";
import { createThirdwebClient } from "thirdweb";
import { celo } from "thirdweb/chains";
import { facilitator, settlePayment } from "thirdweb/x402";

import { readDeliverable } from "@/lib/server/deliverable-storage";
import { invoiceRepository } from "@/lib/server/invoice-repository";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string; milestoneId: string }>;
};

function x402Facilitator() {
  const secretKey = process.env.THIRDWEB_SECRET_KEY?.trim();
  const serverWalletAddress = process.env.THIRDWEB_SERVER_WALLET_ADDRESS?.trim();

  if (!secretKey || !serverWalletAddress) {
    return null;
  }

  return facilitator({
    client: createThirdwebClient({ secretKey }),
    serverWalletAddress,
    waitUntil: "confirmed",
    baseUrl: process.env.X402_FACILITATOR_URL?.trim() || "https://x402.celo.org",
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { invoiceId, milestoneId } = await context.params;
    const invoice = await invoiceRepository.findById(invoiceId);
    const milestone = invoice?.milestones.find(
      (candidate) => candidate.id === milestoneId,
    );

    if (!invoice || !milestone) {
      return NextResponse.json(
        { error: "Invoice or milestone not found." },
        { status: 404 },
      );
    }

    if (!milestone.deliverableStorageKey || !milestone.deliverableName) {
      return NextResponse.json(
        { error: "This milestone has no attached deliverable." },
        { status: 404 },
      );
    }

    if (milestone.status === "released") {
      return NextResponse.json(
        {
          error: "This milestone is already settled.",
          deliverableUrl: `/api/invoices/${invoiceId}/milestones/${milestoneId}/deliverable`,
        },
        { status: 409 },
      );
    }

    const paymentFacilitator = x402Facilitator();
    if (!paymentFacilitator) {
      return NextResponse.json(
        { error: "The x402 facilitator is not configured." },
        { status: 503 },
      );
    }

    const paymentData =
      request.headers.get("PAYMENT-SIGNATURE") || request.headers.get("X-PAYMENT");
    const paymentResult = await settlePayment({
      resourceUrl: request.url,
      method: "GET",
      paymentData,
      payTo: invoice.freelancerWallet,
      network: celo,
      price: `$${(milestone.amountCents / 100).toFixed(2)}`,
      facilitator: paymentFacilitator,
      waitUntil: "confirmed",
      routeConfig: {
        description: `${invoice.number}: ${milestone.title}`,
        mimeType: milestone.deliverableMimeType || "application/octet-stream",
      },
      extraMetadata: {
        invoiceId,
        milestoneId,
      },
    });

    if (paymentResult.status === 402) {
      return NextResponse.json(paymentResult.responseBody, {
        status: 402,
        headers: paymentResult.responseHeaders,
      });
    }

    await invoiceRepository.confirmPayment(invoiceId, milestoneId, {
      transactionHash: paymentResult.paymentReceipt.transaction,
      payerAddress: paymentResult.paymentReceipt.payer,
    });

    const contents = await readDeliverable(milestone.deliverableStorageKey);
    const responseBody = new Uint8Array(contents.byteLength);
    responseBody.set(contents);

    return new Response(responseBody.buffer, {
      headers: {
        ...paymentResult.responseHeaders,
        "Content-Type": milestone.deliverableMimeType || "application/octet-stream",
        "Content-Length": String(contents.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(milestone.deliverableName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Unable to settle x402 milestone", error);
    return NextResponse.json(
      { error: "The x402 payment could not be settled." },
      { status: 500 },
    );
  }
}
