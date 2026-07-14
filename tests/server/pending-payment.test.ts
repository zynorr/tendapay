import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingPayment,
  readPendingPayment,
  savePendingPayment,
} from "@/lib/pending-payment";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const payment = {
  invoiceId: "inv_test",
  milestoneId: "mil_test",
  transactionHash: `0x${"1".repeat(64)}`,
  payerAddress: "0x1111111111111111111111111111111111111111",
  submittedAt: "2026-07-15T12:00:00.000Z",
};

test("pending payments survive a page reload until confirmation", () => {
  const storage = new MemoryStorage();

  savePendingPayment(storage, payment);
  assert.deepEqual(
    readPendingPayment(storage, payment.invoiceId, payment.milestoneId),
    payment,
  );

  clearPendingPayment(storage, payment.invoiceId, payment.milestoneId);
  assert.equal(
    readPendingPayment(storage, payment.invoiceId, payment.milestoneId),
    null,
  );
});

test("invalid pending payment data is discarded", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    `tendapay:pending:${payment.invoiceId}:${payment.milestoneId}`,
    "not-json",
  );

  assert.equal(
    readPendingPayment(storage, payment.invoiceId, payment.milestoneId),
    null,
  );
});
