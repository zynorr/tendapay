import { codeFromHostname, toDataSuffix } from "@celo/attribution-tags";
import {
  concat,
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
} from "viem";
import { celo } from "viem/chains";

import {
  CELO_USDC_ADDRESS,
  CELO_USDC_FEE_ADAPTER,
} from "@/lib/celo-config";

export class WalletUnavailableError extends Error {
  constructor() {
    super(
      "No compatible wallet was found. Open this invoice in MiniPay or a browser wallet.",
    );
    this.name = "WalletUnavailableError";
  }
}

export class WalletAccountUnavailableError extends Error {
  constructor() {
    super("Connect a wallet account before continuing.");
    this.name = "WalletAccountUnavailableError";
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

function providerErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("code" in error && typeof error.code === "number") {
    return error.code;
  }

  return "cause" in error ? providerErrorCode(error.cause) : undefined;
}

export async function submitUsdcMilestone(input: {
  recipient: string;
  amountCents: number;
}): Promise<{ hash: `0x${string}`; payerAddress: `0x${string}` }> {
  if (!window.ethereum) {
    throw new WalletUnavailableError();
  }

  if (!isAddress(input.recipient)) {
    throw new InvalidRecipientError();
  }

  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("The milestone amount is not valid.");
  }

  const walletClient = createWalletClient({
    chain: celo,
    transport: custom(window.ethereum),
  });
  const [payerAddress] = await walletClient.requestAddresses();

  if (!payerAddress) {
    throw new WalletAccountUnavailableError();
  }

  const currentChainId = await walletClient.getChainId();

  if (currentChainId !== celo.id) {
    try {
      await walletClient.switchChain({ id: celo.id });
    } catch (error) {
      if (providerErrorCode(error) !== 4902) {
        throw error;
      }

      await walletClient.addChain({ chain: celo });
      await walletClient.switchChain({ id: celo.id });
    }
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

  return { hash, payerAddress };
}
