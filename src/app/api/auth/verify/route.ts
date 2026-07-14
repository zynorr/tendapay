import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CHALLENGE_COOKIE,
  readCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyWalletChallenge,
} from "@/lib/server/auth";

const verificationSchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = verificationSchema.safeParse(await request.json());
  const challengeToken = readCookie(request, CHALLENGE_COOKIE);

  if (!parsed.success || !challengeToken) {
    return NextResponse.json(
      { error: "The sign-in request is missing or expired." },
      { status: 400 },
    );
  }

  const verified = await verifyWalletChallenge({
    token: challengeToken,
    message: parsed.data.message,
    signature: parsed.data.signature,
  });

  if (!verified) {
    return NextResponse.json(
      { error: "The wallet signature could not be verified." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ session: verified.session });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(
    SESSION_COOKIE,
    verified.token,
    sessionCookieOptions(),
  );
  response.cookies.delete(CHALLENGE_COOKIE);
  return response;
}
