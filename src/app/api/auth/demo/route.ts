import { NextResponse } from "next/server";

import { DEMO_OWNER_ADDRESS } from "@/domain/workspace";
import {
  createWorkspaceSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/server/auth";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const authenticated = createWorkspaceSession(DEMO_OWNER_ADDRESS);
  const response = NextResponse.json({ session: authenticated.session });
  response.cookies.set(
    SESSION_COOKIE,
    authenticated.token,
    sessionCookieOptions(),
  );
  return response;
}
