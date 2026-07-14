import { codeFromHostname, toDataSuffix } from "@celo/attribution-tags";
import {
  concat,
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
} from "viem";
import { celo } from "viem/chains";

import {
  CELO_RPC_URL,
  CELO_USDC_ADDRESS,
  CELO_USDC_FEE_ADAPTER,
} from "@/lib/celo-config";

export class WalletUnavailableError extends Error {
  constructor() {
    super("No compatible wallet was found. Open this invoice in MiniPay or a browser wallet.");
    this.name = "WalletUnavailableError";
  }
}

export class InvalidRecipientError extends Error {
  constructor() {
    super("The receiving wallet is not a valid Celo address.");
    this.name = "InvalidRecipientError";
  }
}

function attributionCode(): string {
  const registeredCode = process.env.NEXT_PUBLIC_CELO_ATTRIBUTION_CODE?.trim();
  return registeredCode || codeFromHostname(window.location.hostname);
}

export async function payUsdcMilestone(input: {
  recipient: string;
  amountCents: number;
}): Promise<{ hash: `0x${string}`; payerAddress: `0x${string}` }> {
  if (!window.ethereum) {
    throw new WalletUnavailableError();
  }

  if (!isAddress(input.recipient)) {
    throw new InvalidRecipientError();
  }

  const walletClient = createWalletClient({
    chain: celo,
    transport: custom(window.ethereum),
  });
  const publicClient = createPublicClient({
    chain: celo,
    transport: http(CELO_RPC_URL),
  });

  const [payerAddress] = await walletClient.requestAddresses();
  const currentChainId = await walletClient.getChainId();

  if (currentChainId !== celo.id) {
    await walletClient.switchChain({ id: celo.id });
  }

  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [getAddress(input.recipient), BigInt(input.amountCents) * 10_000n],
  });
  const taggedData = concat([transferData, toDataSuffix(attributionCode())]);

  const hash = await walletClient.sendTransaction({
    account: payerAddress,
    chain: celo,
    to: CELO_USDC_ADDRESS,
    data: taggedData,
    feeCurrency: CELO_USDC_FEE_ADAPTER,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("The transaction was submitted but did not settle successfully.");
  }

  return { hash, payerAddress };
}
