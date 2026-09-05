import type { Bid, DecisionResult, ProviderId } from "../shared/types";

/**
 * Picks a winner on price-vs-quality-vs-budget, not just cheapest.
 * qualityWeight rises with task complexity (0.3..0.8) — a simple task leans
 * on price, a complex one leans on quality. budgetFit is a hard gate: a bid
 * over the customer's remaining budget cannot win regardless of score.
 */
export function decide(bids: Bid[], complexityScore: number, budgetRemainingUsd: number): DecisionResult | null {
  if (bids.length === 0) return null;

  const maxCostThisRound = Math.max(...bids.map((b) => b.estimatedTotalCostUsd));
  const qualityWeight = 0.3 + 0.5 * complexityScore;
  const priceWeight = 1 - qualityWeight;

  const ranked = bids.map((bid) => {
    const budgetFit = bid.estimatedTotalCostUsd <= budgetRemainingUsd;
    const normalizedPrice = maxCostThisRound > 0 ? 1 - bid.estimatedTotalCostUsd / maxCostThisRound : 1;
    const rawScore = priceWeight * normalizedPrice + qualityWeight * bid.qualityScore;
    const score = budgetFit ? rawScore : 0;
    return { bid, score, budgetFit };
  });

  const rejectedForBudget: ProviderId[] = ranked.filter((r) => !r.budgetFit).map((r) => r.bid.providerId);
  const eligible = ranked.filter((r) => r.budgetFit);

  ranked.sort((a, b) => b.score - a.score || a.bid.estimatedTotalCostUsd - b.bid.estimatedTotalCostUsd);

  if (eligible.length === 0) {
    return { winner: bids[0], score: 0, reason: "all bids exceeded remaining budget", ranked, rejectedForBudget };
  }

  const winnerEntry = [...eligible].sort(
    (a, b) => b.score - a.score || a.bid.estimatedTotalCostUsd - b.bid.estimatedTotalCostUsd,
  )[0];

  const reason =
    `won on ${(priceWeight * 100).toFixed(0)}% price / ${(qualityWeight * 100).toFixed(0)}% quality weighting ` +
    `(complexity ${complexityScore.toFixed(2)}) — $${winnerEntry.bid.estimatedTotalCostUsd.toFixed(6)} at quality ${winnerEntry.bid.qualityScore.toFixed(2)}`;

  return {
    winner: winnerEntry.bid,
    score: winnerEntry.score,
    reason,
    ranked,
    rejectedForBudget,
  };
}

export function allBidsRejectedForBudget(decision: DecisionResult, totalBids: number): boolean {
  return decision.rejectedForBudget.length === totalBids;
}
