import { NextResponse } from "next/server";

import { invoiceRepository } from "@/lib/server/invoice-repository";
import {
  MAX_DELIVERABLE_BYTES,
  readDeliverable,
  storeDeliverable,
} from "@/lib/server/deliverable-storage";

type RouteContext = {
  params: Promise<{ invoiceId: string; milestoneId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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

    if (milestone.status !== "pending") {
      return NextResponse.json(
        { error: "A settled milestone cannot replace its deliverable." },
        { status: 409 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A deliverable file is required." }, { status: 400 });
    }

    if (file.size > MAX_DELIVERABLE_BYTES) {
      return NextResponse.json(
        { error: "Deliverables cannot be larger than 10 MB." },
        { status: 413 },
      );
    }

    const storedFile = await storeDeliverable({ invoiceId, milestoneId, file });
    const updatedInvoice = await invoiceRepository.attachDeliverable(
      invoiceId,
      milestoneId,
      storedFile,
    );

    return NextResponse.json({ invoice: updatedInvoice }, { status: 201 });
  } catch (error) {
    console.error("Unable to store deliverable", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 },
    );
  }
}

export async function GET(_request: Request, context: RouteContext) {
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

    if (milestone.status !== "released") {
      return NextResponse.json(
        { error: "This deliverable is still locked." },
        { status: 403 },
      );
    }

    if (!milestone.deliverableStorageKey || !milestone.deliverableName) {
      return NextResponse.json(
        { error: "No file was attached to this milestone." },
        { status: 404 },
      );
    }

    const contents = await readDeliverable(milestone.deliverableStorageKey);
    const encodedName = encodeURIComponent(milestone.deliverableName);
    const responseBody = new Uint8Array(contents.byteLength);
    responseBody.set(contents);

    return new Response(responseBody.buffer, {
      headers: {
        "Content-Type": milestone.deliverableMimeType || "application/octet-stream",
        "Content-Length": String(contents.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Unable to read deliverable", error);
    return NextResponse.json(
      { error: "The deliverable could not be opened." },
      { status: 500 },
    );
  }
}
