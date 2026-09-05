import { NextResponse } from "next/server";
import { historyStore } from "@/lib/store/historyStore";
import { INDUSTRY_AGENT_IDS, type IndustryAgentId } from "@/lib/shared/types";
import type { TaskHistoryStatus } from "@/lib/shared/historyTypes";

const STATUSES: TaskHistoryStatus[] = ["completed", "failed", "rejected"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const statusParam = url.searchParams.get("status");
  const industryParam = url.searchParams.get("industryId");
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const status = STATUSES.includes(statusParam as TaskHistoryStatus) ? (statusParam as TaskHistoryStatus) : undefined;
  const industryId = INDUSTRY_AGENT_IDS.includes(industryParam as IndustryAgentId) ? (industryParam as IndustryAgentId) : undefined;
  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;

  const result = historyStore.listHistory({
    limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
    offset: offset !== undefined && Number.isFinite(offset) ? offset : undefined,
    status,
    industryId,
    sessionId,
    q,
  });

  return NextResponse.json(result);
}
