import { NextResponse } from "next/server";

import { CHALLENGE_COOKIE, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CHALLENGE_COOKIE);
  return response;
}
