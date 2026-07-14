import assert from "node:assert/strict";
import test from "node:test";

import { privateKeyToAccount } from "viem/accounts";

import {
  createWalletChallenge,
  createWorkspaceSession,
  readSessionToken,
  verifyWalletChallenge,
} from "@/lib/server/auth";

process.env.AUTH_SECRET = "test-only-auth-secret-with-at-least-32-bytes";

const account = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

test("wallet challenge creates a verified workspace session", async () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const challenge = createWalletChallenge(
    account.address,
    "https://tendapay.example/api/auth/challenge",
    now,
  );
  const signature = await account.signMessage({ message: challenge.message });
  const verified = await verifyWalletChallenge({
    token: challenge.token,
    message: challenge.message,
    signature,
    now: now + 1_000,
  });

  assert.ok(verified);
  assert.equal(verified.session.address, account.address);
  assert.equal(
    verified.session.workspaceId,
    `ws_${account.address.slice(2).toLowerCase()}`,
  );
  assert.deepEqual(
    readSessionToken(verified.token, now + 2_000),
    verified.session,
  );
});

test("wallet challenge rejects an expired signature", async () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const challenge = createWalletChallenge(
    account.address,
    "https://tendapay.example/api/auth/challenge",
    now,
  );
  const signature = await account.signMessage({ message: challenge.message });
  const verified = await verifyWalletChallenge({
    token: challenge.token,
    message: challenge.message,
    signature,
    now: Date.parse(challenge.expiresAt) + 1,
  });

  assert.equal(verified, null);
});

test("wallet challenge rejects a malformed signature", async () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const challenge = createWalletChallenge(
    account.address,
    "https://tendapay.example/api/auth/challenge",
    now,
  );
  const verified = await verifyWalletChallenge({
    token: challenge.token,
    message: challenge.message,
    signature: "0xdeadbeef",
    now: now + 1_000,
  });

  assert.equal(verified, null);
});

test("session token rejects tampering and expiration", () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const authenticated = createWorkspaceSession(account.address, now);
  const tampered = `${authenticated.token.slice(0, -1)}x`;

  assert.equal(readSessionToken(tampered, now), null);
  assert.equal(
    readSessionToken(authenticated.token, Date.parse(authenticated.session.expiresAt)),
    null,
  );
});
