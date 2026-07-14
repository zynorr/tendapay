import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hex,
  type Transaction,
  type TransactionReceipt,
} from "viem";

import {
  CELO_PUBLIC_CHAIN,
  CELO_RPC_URL,
  CELO_USDC_ADDRESS,
} from "@/lib/celo-config";

const publicClient = createPublicClient({
  chain: CELO_PUBLIC_CHAIN,
  transport: http(CELO_RPC_URL),
});

export type PaymentVerificationFailureCode =
  | "invalid_reference"
  | "pending"
  | "reverted"
  | "wrong_token"
  | "invalid_transfer"
  | "wrong_recipient"
  | "wrong_amount"
  | "provider_unavailable";

export type PaymentVerification =
  | { valid: true; payerAddress: Address }
  | {
      valid: false;
      code: PaymentVerificationFailureCode;
      reason: string;
      retryable: boolean;
    };

export type PaymentVerificationClient = {
  waitForTransactionReceipt(input: {
    hash: Hex;
    confirmations: number;
    timeout: number;
  }): Promise<TransactionReceipt>;
  getTransaction(input: { hash: Hex }): Promise<Transaction>;
};

function failure(
  code: PaymentVerificationFailureCode,
  reason: string,
  retryable = false,
): PaymentVerification {
  return { valid: false, code, reason, retryable };
}

function isReceiptTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "WaitForTransactionReceiptTimeoutError" ||
    error.message.toLowerCase().includes("timed out")
  );
}

export async function verifyMilestonePayment(
  input: {
    hash: string;
    recipient: string;
    amountCents: number;
  },
  client: PaymentVerificationClient = publicClient,
): Promise<PaymentVerification> {
  if (input.hash.startsWith("demo_")) {
    return process.env.NODE_ENV === "production"
      ? failure(
          "invalid_reference",
          "Demo settlements are disabled in production.",
        )
      : { valid: true, payerAddress: "0x0000000000000000000000000000000000000001" };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(input.hash)) {
    return failure("invalid_reference", "The transaction hash is not valid.");
  }

  if (!isAddress(input.recipient)) {
    return failure("invalid_reference", "The invoice recipient is not valid.");
  }

  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return failure("invalid_reference", "The milestone amount is not valid.");
  }

  try {
    const hash = input.hash as Hex;
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 120_000,
    });

    if (receipt.status !== "success") {
      return failure("reverted", "The transaction reverted on Celo.");
    }

    const transaction = await client.getTransaction({ hash });

    if (!transaction.to || getAddress(transaction.to) !== CELO_USDC_ADDRESS) {
      return failure(
        "wrong_token",
        "The transaction did not transfer Celo USDC.",
      );
    }

    let transferRecipient: Address;
    let transferAmount: bigint;

    try {
      const decoded = decodeFunctionData({
        abi: erc20Abi,
        data: transaction.input,
      });

      if (decoded.functionName !== "transfer") {
        return failure(
          "invalid_transfer",
          "The transaction is not a USDC transfer.",
        );
      }

      const args = decoded.args;

      if (
        !Array.isArray(args) ||
        args.length !== 2 ||
        typeof args[0] !== "string" ||
        !isAddress(args[0]) ||
        typeof args[1] !== "bigint"
      ) {
        return failure(
          "invalid_transfer",
          "The transaction is not a USDC transfer.",
        );
      }

      transferRecipient = getAddress(args[0]);
      transferAmount = args[1];
    } catch {
      return failure("invalid_transfer", "The transaction is not a USDC transfer.");
    }

    const expectedAmount = BigInt(input.amountCents) * 10_000n;

    if (transferRecipient !== getAddress(input.recipient)) {
      return failure(
        "wrong_recipient",
        "The payment was sent to a different wallet.",
      );
    }

    if (transferAmount !== expectedAmount) {
      return failure(
        "wrong_amount",
        "The payment amount does not match the milestone.",
      );
    }

    return { valid: true, payerAddress: transaction.from };
  } catch (error) {
    if (isReceiptTimeout(error)) {
      return failure(
        "pending",
        "The transaction is still waiting for confirmation on Celo.",
        true,
      );
    }

    console.error("Unable to verify Celo payment", error);
    return failure(
      "provider_unavailable",
      "Celo verification is temporarily unavailable. Retry this transaction shortly.",
      true,
    );
  }
}
