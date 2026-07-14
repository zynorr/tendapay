import assert from "node:assert/strict";
import test from "node:test";

import {
  createInvoiceSchema,
  deriveInvoiceStatus,
  invoiceSchema,
  paidInvoiceCents,
  totalInvoiceCents,
} from "../src/domain/invoice.ts";

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
    title: "Launch campaign",
    clientName: "Nia Coffee",
    clientEmail: "hello@nia.example",
    freelancerName: "Amina Studio",
    freelancerWallet: "not-a-wallet",
    note: "",
    convertPercent: 0,
    milestones: [
      {
        title: "Creative direction",
        description: "",
        amountCents: 15_000,
        dueDate: "2099-01-01",
      },
    ],
  });

  assert.equal(result.success, false);
});
