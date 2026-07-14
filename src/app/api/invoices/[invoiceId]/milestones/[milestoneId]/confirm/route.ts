import { NextResponse } from "next/server";
import { z } from "zod";

import { invoiceRepository } from "@/lib/server/invoice-repository";
import { verifyMilestonePayment } from "@/lib/server/payment-verifier";

const paymentSchema = z.object({
  transactionHash: z.string().min(4),
});

const verificationStatus = {
  invalid_reference: 400,
  pending: 425,
  reverted: 422,
  wrong_token: 422,
  invalid_transfer: 422,
  wrong_recipient: 422,
  wrong_amount: 422,
  provider_unavailable: 503,
} as const;

type RouteContext = {
  params: Promise<{ invoiceId: string; milestoneId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { invoiceId, milestoneId } = await context.params;
    const parsedPayment = paymentSchema.safeParse(await request.json());

    if (!parsedPayment.success) {
      return NextResponse.json(
        { error: "A transaction reference is required." },
        { status: 400 },
      );
    }

    const currentInvoice = await invoiceRepository.findById(invoiceId);
    const milestone = currentInvoice?.milestones.find(
      (candidate) => candidate.id === milestoneId,
    );

    if (!currentInvoice || !milestone) {
      return NextResponse.json(
        { error: "Invoice or milestone not found." },
        { status: 404 },
      );
    }

    if (["paid", "released"].includes(milestone.status)) {
      return NextResponse.json({ invoice: currentInvoice });
    }

    const verification = await verifyMilestonePayment({
      hash: parsedPayment.data.transactionHash,
      recipient: currentInvoice.freelancerWallet,
      amountCents: milestone.amountCents,
    });

    if (!verification.valid) {
      return NextResponse.json(
        {
          error: verification.reason,
          code: verification.code,
          retryable: verification.retryable,
        },
        { status: verificationStatus[verification.code] },
      );
    }

    const invoice = await invoiceRepository.confirmPayment(invoiceId, milestoneId, {
      transactionHash: parsedPayment.data.transactionHash,
      payerAddress: verification.payerAddress,
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice or milestone not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("Unable to confirm milestone payment", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The payment could not be confirmed.",
      },
      { status: 409 },
    );
  }
}
