import { getAddress, isAddress, type Address } from "viem";

export const DEMO_OWNER_ADDRESS = getAddress(
  "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
);

export function workspaceIdForAddress(address: string): string {
  if (!isAddress(address)) {
    throw new Error("A valid wallet address is required.");
  }

  return `ws_${getAddress(address).slice(2).toLowerCase()}`;
}

export const DEMO_WORKSPACE_ID = workspaceIdForAddress(DEMO_OWNER_ADDRESS);

export type WorkspaceSession = {
  address: Address;
  workspaceId: string;
  expiresAt: string;
};
