import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  type Hex,
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

export type PaymentVerification =
  | { valid: true; payerAddress: string }
  | { valid: false; reason: string };

export async function verifyMilestonePayment(input: {
  hash: string;
  recipient: string;
  amountCents: number;
}): Promise<PaymentVerification> {
  if (input.hash.startsWith("demo_")) {
    return process.env.NODE_ENV === "production"
      ? { valid: false, reason: "Demo settlements are disabled in production." }
      : { valid: true, payerAddress: "0xDemoClientWallet" };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(input.hash)) {
    return { valid: false, reason: "The transaction hash is not valid." };
  }

  if (!isAddress(input.recipient)) {
    return { valid: false, reason: "The invoice recipient is not valid." };
  }

  try {
    const hash = input.hash as Hex;
    const [transaction, receipt] = await Promise.all([
      publicClient.getTransaction({ hash }),
      publicClient.getTransactionReceipt({ hash }),
    ]);

    if (receipt.status !== "success") {
      return { valid: false, reason: "The transaction did not settle successfully." };
    }

    if (!transaction.to || getAddress(transaction.to) !== CELO_USDC_ADDRESS) {
      return { valid: false, reason: "The transaction did not transfer Celo USDC." };
    }

    const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input });
    if (decoded.functionName !== "transfer") {
      return { valid: false, reason: "The transaction is not a USDC transfer." };
    }

    const [recipient, amount] = decoded.args;
    const expectedAmount = BigInt(input.amountCents) * 10_000n;

    if (getAddress(recipient) !== getAddress(input.recipient)) {
      return { valid: false, reason: "The payment was sent to a different wallet." };
    }

    if (amount !== expectedAmount) {
      return { valid: false, reason: "The payment amount does not match the milestone." };
    }

    return { valid: true, payerAddress: transaction.from };
  } catch (error) {
    console.error("Unable to verify Celo payment", error);
    return {
      valid: false,
      reason: "The payment could not be verified on Celo.",
    };
  }
}
