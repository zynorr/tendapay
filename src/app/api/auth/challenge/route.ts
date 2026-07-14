import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";

import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_SECONDS,
  createWalletChallenge,
  sessionCookieOptions,
} from "@/lib/server/auth";

const challengeSchema = z.object({
  address: z.string().refine(isAddress),
});

export async function POST(request: Request) {
  const parsed = challengeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "A wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const challenge = createWalletChallenge(parsed.data.address, request.url);
    const response = NextResponse.json({
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      CHALLENGE_COOKIE,
      challenge.token,
      sessionCookieOptions(CHALLENGE_TTL_SECONDS),
    );
    return response;
  } catch (error) {
    console.error("Unable to create wallet challenge", error);
    return NextResponse.json(
      { error: "Unable to start wallet sign-in." },
      { status: 500 },
    );
  }
}
