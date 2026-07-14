import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createInvoiceSchema } from "@/domain/invoice";
import { invoiceRepository } from "@/lib/server/invoice-repository";

export async function GET() {
  const invoices = await invoiceRepository.list();
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  try {
    const input = createInvoiceSchema.parse(await request.json());
    const invoice = await invoiceRepository.create(input);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Please check the invoice details.", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("Unable to create invoice", error);
    return NextResponse.json(
      { error: "The invoice could not be created." },
      { status: 500 },
    );
  }
}
