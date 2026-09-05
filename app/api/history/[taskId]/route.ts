import { NextResponse } from "next/server";
import { historyStore } from "@/lib/store/historyStore";

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const entry = historyStore.getHistoryEntry(taskId);
  if (!entry) {
    return NextResponse.json({ error: "unknown task" }, { status: 404 });
  }
  return NextResponse.json(entry);
}
