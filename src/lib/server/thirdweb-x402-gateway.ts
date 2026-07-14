import { isAddress } from "viem";

import type {
  X402Gateway,
  X402SettlementRequest,
  X402SettlementResult,
} from "@/lib/server/x402-gateway";

function facilitatorBaseUrl(): string {
  const configured = process.env.X402_FACILITATOR_URL?.trim();

  if (!configured) {
    return "https://x402.celo.org";
  }

  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("X402_FACILITATOR_URL must use HTTP or HTTPS.");
  }

  return url.toString().replace(/\/$/, "");
}

export async function createThirdwebX402Gateway(): Promise<X402Gateway | null> {
  const secretKey = process.env.THIRDWEB_SECRET_KEY?.trim();
  const serverWalletAddress = process.env.THIRDWEB_SERVER_WALLET_ADDRESS?.trim();

  if (!secretKey || !serverWalletAddress) {
    return null;
  }

  if (!isAddress(serverWalletAddress)) {
    throw new Error("THIRDWEB_SERVER_WALLET_ADDRESS is not a valid EVM address.");
  }

  const [{ createThirdwebClient }, { celo }, { facilitator, settlePayment }] =
    await Promise.all([
      import("thirdweb"),
      import("thirdweb/chains"),
      import("thirdweb/x402"),
    ]);
  const paymentFacilitator = facilitator({
    client: createThirdwebClient({ secretKey }),
    serverWalletAddress,
    waitUntil: "confirmed",
    baseUrl: facilitatorBaseUrl(),
  });

  return {
    async settle(
      request: X402SettlementRequest,
    ): Promise<X402SettlementResult> {
      const result = await settlePayment({
        resourceUrl: request.resourceUrl,
        method: "GET",
        paymentData: request.paymentData,
        payTo: request.payTo,
        network: celo,
        scheme: "exact",
        price: `$${(request.priceCents / 100).toFixed(2)}`,
        facilitator: paymentFacilitator,
        waitUntil: "confirmed",
        routeConfig: {
          description: request.description,
          mimeType: request.mimeType,
          maxTimeoutSeconds: 15 * 60,
        },
        extraMetadata: {
          invoiceId: request.invoiceId,
          milestoneId: request.milestoneId,
        },
      });

      if (result.status !== 200) {
        return {
          settled: false,
          status: result.status,
          responseBody: result.responseBody,
          responseHeaders: result.responseHeaders,
        };
      }

      return {
        settled: true,
        transactionHash: result.paymentReceipt.transaction,
        payerAddress: result.paymentReceipt.payer,
        responseHeaders: result.responseHeaders,
      };
    },
  };
}
