import assert from "node:assert/strict";
import test from "node:test";

import {
  concat,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
  type Transaction,
  type TransactionReceipt,
} from "viem";

import { CELO_USDC_ADDRESS } from "@/lib/celo-config";
import {
  verifyMilestonePayment,
  type PaymentVerificationClient,
} from "@/lib/server/payment-verifier";

const hash = `0x${"1".repeat(64)}` as Hex;
const payer = "0x1111111111111111111111111111111111111111" as Address;
const recipient = "0x2222222222222222222222222222222222222222" as Address;

function transferInput(amountCents: number): Hex {
  const transfer = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, BigInt(amountCents) * 10_000n],
  });

  return concat([transfer, "0x1234"]);
}

function successfulClient(input = transferInput(1_500)): PaymentVerificationClient {
  return {
    async waitForTransactionReceipt() {
      return { status: "success" } as TransactionReceipt;
    },
    async getTransaction() {
      return {
        from: payer,
        input,
        to: CELO_USDC_ADDRESS,
      } as Transaction;
    },
  };
}

test("verifier accepts an attributed Celo USDC transfer", async () => {
  const result = await verifyMilestonePayment(
    { hash, recipient, amountCents: 1_500 },
    successfulClient(),
  );

  assert.deepEqual(result, { valid: true, payerAddress: payer });
});

test("verifier rejects a transfer with the wrong amount", async () => {
  const result = await verifyMilestonePayment(
    { hash, recipient, amountCents: 2_000 },
    successfulClient(),
  );

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.code, "wrong_amount");
    assert.equal(result.retryable, false);
  }
});

test("verifier marks a receipt timeout as retryable", async () => {
  const client: PaymentVerificationClient = {
    async waitForTransactionReceipt() {
      const error = new Error("Timed out while waiting for a receipt");
      error.name = "WaitForTransactionReceiptTimeoutError";
      throw error;
    },
    async getTransaction() {
      throw new Error("should not be called");
    },
  };
  const result = await verifyMilestonePayment(
    { hash, recipient, amountCents: 1_500 },
    client,
  );

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.code, "pending");
    assert.equal(result.retryable, true);
  }
});

test("verifier rejects a reverted receipt", async () => {
  const client = successfulClient();
  client.waitForTransactionReceipt = async () =>
    ({ status: "reverted" }) as TransactionReceipt;
  const result = await verifyMilestonePayment(
    { hash, recipient, amountCents: 1_500 },
    client,
  );

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.code, "reverted");
  }
});
