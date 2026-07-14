import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createInvoiceSchema } from "@/domain/invoice";
import { getRequestSession } from "@/lib/server/auth";
import { invoiceRepository } from "@/lib/server/invoice-repository";

export async function GET(request: Request) {
  const session = getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const invoices = await invoiceRepository.list(session.workspaceId);
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  try {
    const session = getRequestSession(request);

    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const input = createInvoiceSchema.parse(await request.json());
    const invoice = await invoiceRepository.create(session.workspaceId, input);
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
