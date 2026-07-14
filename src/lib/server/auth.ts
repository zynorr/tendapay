import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  getAddress,
  isAddress,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";

import {
  workspaceIdForAddress,
  type WorkspaceSession,
} from "@/domain/workspace";

export const CHALLENGE_COOKIE = "tendapay_challenge";
export const SESSION_COOKIE = "tendapay_session";
export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type ChallengeToken = {
  type: "challenge";
  address: Address;
  domain: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

type SessionToken = WorkspaceSession & { type: "session" };

const authGlobals = globalThis as typeof globalThis & {
  tendapayAuthSecret?: string;
};

function authSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();

  if (configured) {
    if (configured.length < 32) {
      throw new Error("AUTH_SECRET must contain at least 32 characters.");
    }

    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }

  authGlobals.tendapayAuthSecret ??= randomBytes(32).toString("base64url");
  return authGlobals.tendapayAuthSecret;
}

function signature(value: string): string {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function createToken(payload: ChallengeToken | SessionToken): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function readToken(token: string): ChallengeToken | SessionToken | null {
  const [encoded, suppliedSignature, extra] = token.split(".");

  if (!encoded || !suppliedSignature || extra) {
    return null;
  }

  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);

  if (
    expected.byteLength !== supplied.byteLength ||
    !timingSafeEqual(expected, supplied)
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function challengeMessage(challenge: ChallengeToken): string {
  return `${challenge.domain} wants you to sign in with your Ethereum account:
${challenge.address}

Sign in to TendaPay.

URI: ${challenge.uri}
Version: 1
Chain ID: 42220
Nonce: ${challenge.nonce}
Issued At: ${challenge.issuedAt}
Expiration Time: ${challenge.expiresAt}`;
}

export function createWalletChallenge(
  address: string,
  requestUrl: string,
  now = Date.now(),
): { message: string; token: string; expiresAt: string } {
  if (!isAddress(address)) {
    throw new Error("A valid wallet address is required.");
  }

  const url = new URL(requestUrl);
  const challenge: ChallengeToken = {
    type: "challenge",
    address: getAddress(address),
    domain: url.host,
    uri: url.origin,
    nonce: randomBytes(12).toString("hex"),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CHALLENGE_TTL_SECONDS * 1_000).toISOString(),
  };

  return {
    message: challengeMessage(challenge),
    token: createToken(challenge),
    expiresAt: challenge.expiresAt,
  };
}

export function createWorkspaceSession(
  address: string,
  now = Date.now(),
): { session: WorkspaceSession; token: string } {
  if (!isAddress(address)) {
    throw new Error("A valid wallet address is required.");
  }

  const session: WorkspaceSession = {
    address: getAddress(address),
    workspaceId: workspaceIdForAddress(address),
    expiresAt: new Date(now + SESSION_TTL_SECONDS * 1_000).toISOString(),
  };

  return {
    session,
    token: createToken({ type: "session", ...session }),
  };
}

export async function verifyWalletChallenge(input: {
  token: string;
  message: string;
  signature: string;
  now?: number;
}): Promise<{ session: WorkspaceSession; token: string } | null> {
  const challenge = readToken(input.token);
  const now = input.now ?? Date.now();

  if (
    !challenge ||
    challenge.type !== "challenge" ||
    Date.parse(challenge.expiresAt) <= now ||
    input.message !== challengeMessage(challenge) ||
    !/^0x[0-9a-fA-F]+$/.test(input.signature)
  ) {
    return null;
  }

  let verified = false;

  try {
    verified = await verifyMessage({
      address: challenge.address,
      message: input.message,
      signature: input.signature as Hex,
    });
  } catch {
    return null;
  }

  return verified ? createWorkspaceSession(challenge.address, now) : null;
}

export function readSessionToken(
  token: string | undefined,
  now = Date.now(),
): WorkspaceSession | null {
  if (!token) {
    return null;
  }

  const payload = readToken(token);

  if (
    !payload ||
    payload.type !== "session" ||
    !isAddress(payload.address) ||
    payload.workspaceId !== workspaceIdForAddress(payload.address) ||
    Date.parse(payload.expiresAt) <= now
  ) {
    return null;
  }

  return {
    address: getAddress(payload.address),
    workspaceId: payload.workspaceId,
    expiresAt: payload.expiresAt,
  };
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const value of cookieHeader.split(";")) {
    const [cookieName, ...cookieValue] = value.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(cookieValue.join("="));
    }
  }

  return undefined;
}

export function getRequestSession(request: Request): WorkspaceSession | null {
  return readSessionToken(readCookie(request, SESSION_COOKIE));
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
