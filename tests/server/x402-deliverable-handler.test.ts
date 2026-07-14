import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDeliverableRecord,
  confirmPaymentRecord,
  createInvoiceRecord,
  type ConfirmedPayment,
  type CreateInvoiceInput,
  type Invoice,
} from "@/domain/invoice";
import type { InvoiceRepository } from "@/lib/server/invoice-repository";
import {
  handleX402Deliverable,
} from "@/lib/server/x402-deliverable-handler";
import type {
  X402Gateway,
  X402SettlementRequest,
} from "@/lib/server/x402-gateway";

const invoiceInput: CreateInvoiceInput = {
  title: "Agent research handoff",
  clientName: "Nia Coffee",
  clientEmail: "hello@nia.example",
  freelancerName: "Amina Studio",
  freelancerWallet: "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
  note: "",
  convertPercent: 0,
  milestones: [
    {
      title: "Research report",
      description: "A protected market report.",
      amountCents: 2_500,
      dueDate: "2099-01-01",
    },
  ],
};

function invoiceWithFile(): Invoice {
  const invoice = createInvoiceRecord(invoiceInput, "TD-100");
  const milestone = invoice.milestones[0];
  const updated = attachDeliverableRecord(invoice, milestone.id, {
    storageKey: `${invoice.id}/${milestone.id}/report.pdf`,
    name: "report.pdf",
    mimeType: "application/pdf",
    size: 24,
  });

  assert.ok(updated);
  return updated;
}

class MemoryInvoiceRepository implements InvoiceRepository {
  constructor(public invoice: Invoice) {}

  async list(): Promise<Invoice[]> {
    return [this.invoice];
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.invoice.id === id ? this.invoice : null;
  }

  async findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<Invoice | null> {
    return this.invoice.id === id && this.invoice.workspaceId === workspaceId
      ? this.invoice
      : null;
  }

  async create(): Promise<Invoice> {
    throw new Error("Not implemented in test repository.");
  }

  async attachDeliverable(): Promise<Invoice | null> {
    throw new Error("Not implemented in test repository.");
  }

  async confirmPayment(
    invoiceId: string,
    milestoneId: string,
    payment: ConfirmedPayment,
  ): Promise<Invoice | null> {
    if (invoiceId !== this.invoice.id) {
      return null;
    }

    const updated = confirmPaymentRecord(this.invoice, milestoneId, payment);
    if (updated) {
      this.invoice = updated;
    }
    return updated;
  }
}

function requestFor(invoice: Invoice, paymentData?: string): Request {
  const milestone = invoice.milestones[0];
  return new Request(
    `https://tendapay.example/api/x402/invoices/${invoice.id}/milestones/${milestone.id}/deliverable`,
    { headers: paymentData ? { "PAYMENT-SIGNATURE": paymentData } : undefined },
  );
}

test("x402 returns the facilitator payment challenge unchanged", async () => {
  const invoice = invoiceWithFile();
  const repository = new MemoryInvoiceRepository(invoice);
  let settlementRequest: X402SettlementRequest | undefined;
  const gateway: X402Gateway = {
    async settle(request) {
      settlementRequest = request;
      return {
        settled: false,
        status: 402,
        responseBody: { accepts: [{ scheme: "exact" }] },
        responseHeaders: { "PAYMENT-REQUIRED": "challenge" },
      };
    },
  };
  const response = await handleX402Deliverable(
    requestFor(invoice),
    { invoiceId: invoice.id, milestoneId: invoice.milestones[0].id },
    {
      repository,
      readDeliverable: async () => Buffer.from("report"),
      getGateway: async () => gateway,
    },
  );

  assert.equal(response.status, 402);
  assert.equal(response.headers.get("PAYMENT-REQUIRED"), "challenge");
  assert.equal(settlementRequest?.payTo, invoice.freelancerWallet);
  assert.equal(settlementRequest?.priceCents, 2_500);
  assert.equal(settlementRequest?.paymentData, null);
});

test("x402 records settlement and returns the protected file", async () => {
  const invoice = invoiceWithFile();
  const repository = new MemoryInvoiceRepository(invoice);
  const gateway: X402Gateway = {
    async settle(request) {
      assert.equal(request.paymentData, "signed-payment");
      return {
        settled: true,
        transactionHash: "0xagentsettlement",
        payerAddress: "0x1111111111111111111111111111111111111111",
        responseHeaders: { "PAYMENT-RESPONSE": "receipt" },
      };
    },
  };
  const response = await handleX402Deliverable(
    requestFor(invoice, "signed-payment"),
    { invoiceId: invoice.id, milestoneId: invoice.milestones[0].id },
    {
      repository,
      readDeliverable: async () => Buffer.from("protected report"),
      getGateway: async () => gateway,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("PAYMENT-RESPONSE"), "receipt");
  assert.equal(response.headers.get("X-TendaPay-Settlement"), "confirmed");
  assert.equal(await response.text(), "protected report");
  assert.equal(repository.invoice.milestones[0].status, "released");
  assert.equal(
    repository.invoice.milestones[0].transactionHash,
    "0xagentsettlement",
  );
});

test("x402 retry returns an already released file without charging again", async () => {
  const invoice = invoiceWithFile();
  const milestone = invoice.milestones[0];
  const settled = confirmPaymentRecord(invoice, milestone.id, {
    transactionHash: "0xprevioussettlement",
  });
  assert.ok(settled);
  const repository = new MemoryInvoiceRepository(settled);
  const response = await handleX402Deliverable(
    requestFor(settled),
    { invoiceId: settled.id, milestoneId: milestone.id },
    {
      repository,
      readDeliverable: async () => Buffer.from("recovered report"),
      getGateway: async () => {
        throw new Error("Gateway must not be called for a released milestone.");
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("X-TendaPay-Settlement"),
    "previously-confirmed",
  );
  assert.equal(await response.text(), "recovered report");
});

test("x402 reports missing facilitator configuration", async () => {
  const invoice = invoiceWithFile();
  const repository = new MemoryInvoiceRepository(invoice);
  const response = await handleX402Deliverable(
    requestFor(invoice),
    { invoiceId: invoice.id, milestoneId: invoice.milestones[0].id },
    {
      repository,
      readDeliverable: async () => Buffer.from("report"),
      getGateway: async () => null,
    },
  );

  assert.equal(response.status, 503);
});
