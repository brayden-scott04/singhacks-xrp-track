import type { ComplexityHint, FactorScores, IndustryAgentId, IndustryBid, ProviderId, SettlementMode } from "./types";

export type TaskHistoryStatus = "completed" | "failed" | "rejected";

/**
 * One bidder's snapshot for a single auction round, as stored in history.
 * Wraps the full raw IndustryBid (not a flattened subset) so the history
 * detail view can hand a stored round to the exact same RoundCard/BidFeed
 * components the live dashboard uses — same quote details, same price-per-
 * token, same quote-expiry rendering — rather than a lookalike table.
 * factorScores/compositeScore/budgetFit are only populated when the round
 * reached the decision agent (i.e. at least one bid came back) — a round
 * that failed before any provider responded stores bare bids with these
 * left null.
 */
export interface HistoryBidSnapshot {
  bid: IndustryBid;
  factorScores: FactorScores | null;
  compositeScore: number | null;
  budgetFit: boolean | null;
  isWinner: boolean;
}

export interface HistoryExcludedBid {
  industryId: IndustryAgentId;
  reason: string;
}

/**
 * One row per task attempt, capturing the full lifecycle whether it ended in
 * settlement, a hard failure, or a soft rejection (budget/spend cap). This is
 * the input shape passed to historyStore.recordTaskHistory — every field
 * past `taskId`/`sessionId`/`createdAt`/`prompt`/`complexityHint`/`budgetUsd`
 * is nullable because how far a task got before it stopped determines what's
 * knowable about it.
 */
export interface TaskHistoryInput {
  taskId: string;
  sessionId: string;
  createdAt: string;
  prompt: string;
  complexityHint: ComplexityHint;
  budgetUsd: number;
  status: TaskHistoryStatus;
  failureReason: string | null;
  complexityScore: number | null;
  winnerIndustryId: IndustryAgentId | null;
  winnerProviderId: ProviderId | null;
  winnerModelId: string | null;
  decisionReason: string | null;
  decidedByLlm: boolean | null;
  bids: HistoryBidSnapshot[];
  excludedBids: HistoryExcludedBid[];
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  settlementMode: SettlementMode | null;
  txHash: string | null;
  amountDrops: string | null;
  amountUsd: number | null;
  explorerUrl: string | null;
  fallbackReason: string | null;
  output: string | null;
}

/** A stored row read back, with completedAt (set at write time) added. */
export interface StoredTaskHistory extends TaskHistoryInput {
  completedAt: string;
}

/** Slimmer projection for the list view — omits the two fields that can get large. */
export type TaskHistoryListItem = Omit<StoredTaskHistory, "bids" | "output"> & { bidCount: number };

export interface ListHistoryOptions {
  limit?: number;
  offset?: number;
  status?: TaskHistoryStatus;
  industryId?: IndustryAgentId;
  sessionId?: string;
  q?: string;
}

export interface ListHistoryResult {
  rows: TaskHistoryListItem[];
  total: number;
}

export interface IndustryAgentStats {
  industryId: IndustryAgentId;
  wins: number;
  winRate: number;
  totalPaidUsd: number;
  avgCostUsd: number;
}

export interface HistoryStats {
  totalTasks: number;
  completed: number;
  failed: number;
  rejected: number;
  successRate: number;
  totalSpentUsd: number;
  totalSettledUsd: number;
  avgCostPerTaskUsd: number;
  cumulativeSavingsUsd: number;
  channelSettlements: number;
  paymentSettlements: number;
  perIndustry: IndustryAgentStats[];
}
