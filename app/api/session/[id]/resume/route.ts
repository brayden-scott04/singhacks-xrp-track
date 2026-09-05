import { NextResponse } from "next/server";
import { resumeSession } from "@/lib/agent/safeguards/spendCap";
import { publish } from "@/lib/store/eventBus";
import { requireSession, saveSession } from "@/lib/store/sessionStore";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireSession(id);
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const newCapUsd = typeof body?.capUsd === "number" && body.capUsd > 0 ? body.capUsd : undefined;
    resumeSession(session, newCapUsd);
    await saveSession(session);
    await publish({ type: "session.resumed", sessionId: session.sessionId, session });
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
