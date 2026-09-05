import { computeCompositeScore, normalizeFactors } from "../shared/scoringWeights";
import type { DecisionResult, IndustryAgentId, IndustryBid, ScoredIndustryBid } from "../shared/types";

/**
 * Picks a winner among competing industry agents on a fixed-weight composite
 * of seven factors (price, load, quality, knowledge, speed, error %, context
 * window — see lib/shared/scoringWeights.ts). budgetFit is a hard gate: a
 * bid over the customer's remaining budget cannot win regardless of score.
 */
export function decide(bids: IndustryBid[], budgetRemainingUsd: number): DecisionResult | null {
  if (bids.length === 0) return null;

  const scored: ScoredIndustryBid[] = bids.map((bid) => {
    const factorScores = normalizeFactors(bid, bids);
    const compositeScore = computeCompositeScore(factorScores);
    return { ...bid, factorScores, compositeScore };
  });

  const ranked = scored.map((bid) => {
    const budgetFit = bid.estimatedTotalCostUsd <= budgetRemainingUsd;
    const score = budgetFit ? bid.compositeScore : 0;
    return { bid, score, budgetFit };
  });

  const rejectedForBudget: IndustryAgentId[] = ranked.filter((r) => !r.budgetFit).map((r) => r.bid.industryId);
  const eligible = ranked.filter((r) => r.budgetFit);

  ranked.sort((a, b) => b.score - a.score || a.bid.estimatedTotalCostUsd - b.bid.estimatedTotalCostUsd);

  if (eligible.length === 0) {
    return { winner: scored[0], score: 0, reason: "all bids exceeded remaining budget", ranked, rejectedForBudget };
  }

  const winnerEntry = [...eligible].sort(
    (a, b) => b.score - a.score || a.bid.estimatedTotalCostUsd - b.bid.estimatedTotalCostUsd,
  )[0];

  const f = winnerEntry.bid.factorScores;
  const reason =
    `${winnerEntry.bid.industryId} agent won with composite score ${winnerEntry.score.toFixed(3)} ` +
    `(price ${f.price.toFixed(2)}, quality ${f.quality.toFixed(2)}, error% ${f.errorRate.toFixed(2)}, ` +
    `knowledge ${f.knowledge.toFixed(2)}, context ${f.contextWindow.toFixed(2)}, speed ${f.speed.toFixed(2)}, ` +
    `load ${f.load.toFixed(2)}) — $${winnerEntry.bid.estimatedTotalCostUsd.toFixed(6)}`;

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
