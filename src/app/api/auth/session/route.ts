import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/server/auth";

export async function GET(request: Request) {
  const session = getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json(
    { session },
    { headers: { "Cache-Control": "no-store" } },
  );
}
