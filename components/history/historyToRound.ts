import type { HistoryBidSnapshot, StoredTaskHistory } from "@/lib/shared/historyTypes";
import type { MemoPayload, SettlementRecord } from "@/lib/shared/types";
import type { BidOutcome, Round, RoundBid, RoundDecision, RoundNote } from "../roundsReducer";

function phaseFor(status: StoredTaskHistory["status"]): Round["phase"] {
  if (status === "completed") return "settled";
  if (status === "failed") return "failed";
  return "rejected";
}

function outcomeForBid(entry: HistoryBidSnapshot): BidOutcome {
  if (entry.isWinner) return "won";
  if (entry.budgetFit === false) return "rejected-budget";
  return "considered";
}

/**
 * A full MemoPayload isn't stored as one object — its fields are spread
 * across discrete history columns, plus the winner's own bid — so it's
 * rebuilt here from the winning HistoryBidSnapshot. This is exactly the
 * memo that was actually written on-chain: same factor scores, same
 * composite, same reason.
 */
function reconstructMemo(row: StoredTaskHistory): MemoPayload | null {
  const winner = row.bids.find((b) => b.isWinner);
  if (!winner || row.decisionReason === null || row.complexityScore === null) return null;
  if (winner.factorScores === null || winner.compositeScore === null) return null;

  return {
    providerId: winner.bid.providerId,
    industryId: winner.bid.industryId,
    bidPricePerInputTokenUsd: winner.bid.pricePerInputTokenUsd,
    bidPricePerOutputTokenUsd: winner.bid.pricePerOutputTokenUsd,
    bidTotalCostUsd: winner.bid.estimatedTotalCostUsd,
    qualityScore: winner.bid.qualityScore,
    factorScores: winner.factorScores,
    compositeScore: winner.compositeScore,
    taskComplexityScore: row.complexityScore,
    taskId: row.taskId,
    winningReason: row.decisionReason,
  };
}

function reconstructSettlement(row: StoredTaskHistory, memo: MemoPayload | null): SettlementRecord | null {
  if (
    row.status !== "completed" ||
    !row.txHash ||
    !row.settlementMode ||
    row.amountUsd === null ||
    row.amountDrops === null ||
    !row.explorerUrl ||
    !row.winnerProviderId ||
    !row.winnerIndustryId ||
    !memo
  ) {
    return null;
  }
  return {
    taskId: row.taskId,
    providerId: row.winnerProviderId,
    industryId: row.winnerIndustryId,
    mode: row.settlementMode,
    txHash: row.txHash,
    amountDrops: row.amountDrops,
    amountUsd: row.amountUsd,
    memo,
    explorerUrl: row.explorerUrl,
    fallbackReason: row.fallbackReason ?? undefined,
  };
}

function reconstructDecision(row: StoredTaskHistory): RoundDecision | undefined {
  if (row.decisionReason === null || row.winnerIndustryId === null) return undefined;

  // row.bids preserves decisionEngine's `ranked` order (snapshotRankedBids
  // maps over it directly in lib/agent/orchestrator.ts), so bids[0] IS the
  // deterministic prior's top pick, same as the live dashboard's priorTop.
  const priorTop = row.bids[0]?.bid.industryId ?? row.winnerIndustryId;
  const winnerEntry = row.bids.find((b) => b.isWinner);
  const winnerScore = winnerEntry ? (winnerEntry.budgetFit ? (winnerEntry.compositeScore ?? 0) : 0) : 0;

  return {
    winnerIndustryId: row.winnerIndustryId,
    reason: row.decisionReason,
    score: winnerScore,
    priorTopIndustryId: priorTop,
    overrodePrior: priorTop !== row.winnerIndustryId,
    rejectedForBudget: row.bids.filter((b) => b.budgetFit === false).map((b) => b.bid.industryId),
    decidedAt: new Date(row.createdAt).getTime(),
  };
}

/**
 * Converts one persisted history row into the exact Round shape the live
 * dashboard's RoundCard/BidFeed/DecisionPanel/AnswerPanel/MemoView already
 * render — so a historical task looks and behaves identically to a live
 * one, rather than a hand-rolled lookalike table.
 */
export function historyRowToRound(row: StoredTaskHistory): { round: Round; memo: MemoPayload | null; settlement: SettlementRecord | null } {
  const submittedAt = new Date(row.createdAt).getTime();
  const completedAt = new Date(row.completedAt).getTime();

  const bids: RoundBid[] = row.bids.map((entry, index) => ({
    industryId: entry.bid.industryId,
    outcome: outcomeForBid(entry),
    bid: entry.bid,
    scored:
      entry.factorScores !== null && entry.compositeScore !== null
        ? {
            factorScores: entry.factorScores,
            compositeScore: entry.compositeScore,
            score: entry.budgetFit ? entry.compositeScore : 0,
            budgetFit: entry.budgetFit ?? false,
            rank: index + 1,
          }
        : undefined,
  }));

  // An industry that never bid at all (timed out, errored) has no entry in
  // row.bids — only in excludedBids. Add it so the feed still shows all
  // five agents, matching what a live round looked like.
  for (const excluded of row.excludedBids) {
    bids.push({ industryId: excluded.industryId, outcome: "excluded", bid: null, excludedReason: excluded.reason });
  }

  const memo = reconstructMemo(row);
  const settlement = reconstructSettlement(row, memo);
  const decision = reconstructDecision(row);

  const notes: RoundNote[] = row.failureReason
    ? [{ kind: row.status === "failed" ? "error" : "warn", text: row.failureReason, at: completedAt }]
    : [];

  const round: Round = {
    taskId: row.taskId,
    prompt: row.prompt,
    complexityHint: row.complexityHint,
    budgetUsd: row.budgetUsd,
    submittedAt,
    phase: phaseFor(row.status),
    bids,
    decision,
    settlement: settlement ?? undefined,
    fallbackReason: row.fallbackReason ?? undefined,
    output: row.output ?? undefined,
    completedAt,
    notes,
  };

  return { round, memo, settlement };
}
