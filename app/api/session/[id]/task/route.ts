import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runTask } from "@/lib/agent/orchestrator";
import type { ComplexityHint } from "@/lib/shared/types";
import { publish } from "@/lib/store/eventBus";
import { getSession } from "@/lib/store/sessionStore";

const COMPLEXITY_HINTS: ComplexityHint[] = ["simple", "standard", "complex"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const complexityHint: ComplexityHint = COMPLEXITY_HINTS.includes(body?.complexityHint as ComplexityHint)
    ? (body.complexityHint as ComplexityHint)
    : "standard";
  const budgetUsd =
    typeof body?.budgetUsd === "number" && body.budgetUsd > 0 ? body.budgetUsd : session.capUsd - session.spentUsd;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const taskId = randomUUID();

  // The HTTP response goes out immediately (202); runTask() keeps going in
  // the background (this is a persistent Node process, not a serverless
  // function, so it isn't at risk of being frozen once the response is
  // sent) and reports its outcome over SSE.
  runTask({ taskId, sessionId, prompt, complexityHint, budgetUsd, createdAt: new Date().toISOString() }).catch((err) => {
    publish({
      type: "task.failed",
      sessionId,
      taskId,
      reason: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ taskId, sessionId, status: "accepted" }, { status: 202 });
}
