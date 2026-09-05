import { NextResponse } from "next/server";
import { env } from "@/lib/shared/env";
import { createSession } from "@/lib/store/sessionStore";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const capUsd = typeof body?.capUsd === "number" && body.capUsd > 0 ? body.capUsd : env.SESSION_SPEND_CAP_USD;
  const session = await createSession(capUsd);
  return NextResponse.json(session, { status: 201 });
}
