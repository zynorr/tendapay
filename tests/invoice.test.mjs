import assert from "node:assert/strict";
import test from "node:test";

import {
  attachDeliverableRecord,
  confirmPaymentRecord,
  createInvoiceRecord,
  createInvoiceSchema,
  deriveInvoiceStatus,
  invoiceSchema,
  paidInvoiceCents,
  totalInvoiceCents,
} from "../src/domain/invoice.ts";

const validInvoiceInput = {
  title: "Launch campaign",
  clientName: "Nia Coffee",
  clientEmail: "hello@nia.example",
  freelancerName: "Amina Studio",
  freelancerWallet: "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
  note: "",
  convertPercent: 0,
  milestones: [
    {
      title: "Creative direction",
      description: "Moodboard and visual routes.",
      amountCents: 15_000,
      dueDate: "2099-01-01",
    },
    {
      title: "Final handoff",
      description: "Production-ready files.",
      amountCents: 35_000,
      dueDate: "2099-01-08",
    },
  ],
};

function invoiceWithMilestones(milestones) {
  const now = "2026-07-14T12:00:00.000Z";

  return invoiceSchema.parse({
    id: "inv_test",
    number: "TD-TEST",
    title: "Launch campaign",
    clientName: "Nia Coffee",
    clientEmail: "hello@nia.example",
    freelancerName: "Amina Studio",
    freelancerWallet: "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
    currency: "USDC",
    status: "sent",
    createdAt: now,
    updatedAt: now,
    note: "",
    convertPercent: 0,
    milestones: milestones.map((milestone, index) => ({
      id: `mil_${index + 1}`,
      title: milestone.title ?? `Milestone ${index + 1}`,
      description: "",
      amountCents: milestone.amountCents,
      dueDate: milestone.dueDate ?? "2099-01-01",
      status: milestone.status,
    })),
    activity: [],
  });
}

test("totals count only settled milestones as paid", () => {
  const invoice = invoiceWithMilestones([
    { amountCents: 10_000, status: "released" },
    { amountCents: 20_000, status: "paid" },
    { amountCents: 30_000, status: "pending" },
  ]);

  assert.equal(totalInvoiceCents(invoice), 60_000);
  assert.equal(paidInvoiceCents(invoice), 30_000);
});

test("invoice status follows milestone settlement progress", () => {
  const sent = invoiceWithMilestones([
    { amountCents: 10_000, status: "pending" },
    { amountCents: 20_000, status: "pending" },
  ]);
  const partiallyPaid = invoiceWithMilestones([
    { amountCents: 10_000, status: "released" },
    { amountCents: 20_000, status: "pending" },
  ]);
  const paid = invoiceWithMilestones([
    { amountCents: 10_000, status: "released" },
    { amountCents: 20_000, status: "paid" },
  ]);

  assert.equal(deriveInvoiceStatus(sent), "sent");
  assert.equal(deriveInvoiceStatus(partiallyPaid), "partially_paid");
  assert.equal(deriveInvoiceStatus(paid), "paid");
});

test("an unpaid invoice becomes overdue after its earliest due date", () => {
  const invoice = invoiceWithMilestones([
    { amountCents: 10_000, dueDate: "2020-01-01", status: "pending" },
    { amountCents: 20_000, dueDate: "2099-01-01", status: "pending" },
  ]);

  assert.equal(deriveInvoiceStatus(invoice), "overdue");
});

test("invoice input rejects malformed recipient wallets", () => {
  const result = createInvoiceSchema.safeParse({
    ...validInvoiceInput,
    freelancerWallet: "not-a-wallet",
  });

  assert.equal(result.success, false);
});

test("new invoice records receive stable public numbers and internal ids", () => {
  const invoice = createInvoiceRecord(validInvoiceInput, "TD-042");

  assert.equal(invoice.number, "TD-042");
  assert.match(invoice.id, /^inv_/);
  assert.equal(invoice.milestones.length, 2);
  assert.ok(invoice.milestones.every((milestone) => milestone.id.startsWith("mil_")));
  assert.equal(invoice.activity[0].type, "invoice_created");
});

test("attaching a deliverable updates only the selected milestone", () => {
  const invoice = createInvoiceRecord(validInvoiceInput, "TD-043");
  const selectedMilestone = invoice.milestones[1];
  const updated = attachDeliverableRecord(invoice, selectedMilestone.id, {
    storageKey: `${invoice.id}/${selectedMilestone.id}/handoff.zip`,
    name: "handoff.zip",
    mimeType: "application/zip",
    size: 128,
  });

  assert.ok(updated);
  assert.equal(updated.milestones[0].deliverableStorageKey, undefined);
  assert.equal(updated.milestones[1].deliverableName, "handoff.zip");
  assert.equal(updated.milestones[1].deliverableSize, 128);
});

test("payment confirmation releases one milestone and updates invoice progress", () => {
  const invoice = createInvoiceRecord(validInvoiceInput, "TD-044");
  const selectedMilestone = invoice.milestones[0];
  const updated = confirmPaymentRecord(invoice, selectedMilestone.id, {
    transactionHash: "demo_test_settlement",
    payerAddress: "0xDemoClientWallet",
  });

  assert.ok(updated);
  assert.equal(updated.status, "partially_paid");
  assert.equal(updated.milestones[0].status, "released");
  assert.equal(updated.milestones[1].status, "pending");
  assert.equal(updated.activity[0].type, "payment_confirmed");
  assert.equal(updated.activity[1].type, "deliverable_released");
});
