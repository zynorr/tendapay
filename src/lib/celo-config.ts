import { defineChain, getAddress } from "viem";

export const CELO_RPC_URL =
  process.env.NEXT_PUBLIC_CELO_RPC_URL?.trim() || "https://forno.celo.org";

export const CELO_USDC_ADDRESS = getAddress(
  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
);

export const CELO_USDC_FEE_ADAPTER = getAddress(
  "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
);

export const CELO_EXPLORER_URL = "https://celoscan.io";

export const CELO_PUBLIC_CHAIN = defineChain({
  id: 42_220,
  name: "Celo",
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [CELO_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "CeloScan", url: CELO_EXPLORER_URL },
  },
});
