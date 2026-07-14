import { NextResponse } from "next/server";

import { invoiceRepository } from "@/lib/server/invoice-repository";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { invoiceId } = await context.params;
  const invoice = await invoiceRepository.findById(invoiceId);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}
