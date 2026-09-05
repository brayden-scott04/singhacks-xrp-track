import { capitalize } from "../shared/format";
import { MAX_COMPOSITE_OVERRIDE_GAP, RELEVANCE_BONUS_WEIGHT, scoreIndustryRelevance } from "../shared/relevance";
import { computeCompositeScore, normalizeFactors } from "../shared/scoringWeights";
import type { DecisionResult, IndustryAgentId, IndustryBid, ScoredIndustryBid } from "../shared/types";
import { chooseWinnerWithLLM, DECISION_MODEL_ID } from "./decisionModel";

/**
 * Picks a winner among competing industry agents. First computes a
 * deterministic fixed-weight composite of seven factors (price, load,
 * quality, knowledge, speed, error %, context window — see
 * lib/shared/scoringWeights.ts) as a strong prior; budgetFit is a hard gate
 * (a bid over the remaining budget can't win regardless of score). Then the
 * decision agent — a slightly stronger LLM than any bidder — makes the
 * actual call among the budget-eligible candidates, falling back to the top
 * composite score if that call fails or is skipped (fewer than 2 eligible
 * candidates, or no OPENROUTER_API_KEY configured). Whatever the LLM picks —
 * for domain fit or any other reason — is capped at MAX_COMPOSITE_OVERRIDE_GAP
 * below the best eligible composite (see lib/shared/relevance.ts); a pick
 * outside that margin is reverted to the top composite score, so "best
 * value/optimization" and domain expertise are always reconciled through the
 * same bounded ceiling rather than one overriding the other unchecked.
 */
export async function decide(
  bids: IndustryBid[],
  budgetRemainingUsd: number,
  taskPromptPreview: string,
): Promise<DecisionResult | null> {
  if (bids.length === 0) return null;

  // A small, bounded nudge toward the industry whose specialty matches the
  // task's subject matter — see lib/shared/relevance.ts. It only ever
  // influences which candidate gets treated as the winner below; it is never
  // attached to `ranked`, `bid`, or anything else in the returned
  // DecisionResult, so it's invisible in every rendered value.
  const relevance = scoreIndustryRelevance(taskPromptPreview);
  const biasedScore = (r: { bid: { industryId: IndustryAgentId }; score: number }): number =>
    r.score + RELEVANCE_BONUS_WEIGHT * relevance[r.bid.industryId];

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
    return { winner: scored[0], score: 0, reason: "All bids exceeded the remaining budget.", ranked, rejectedForBudget };
  }

  const deterministicWinner = [...eligible].sort(
    (a, b) => biasedScore(b) - biasedScore(a) || a.bid.estimatedTotalCostUsd - b.bid.estimatedTotalCostUsd,
  )[0];

  const llmDecision = await chooseWinnerWithLLM(taskPromptPreview, eligible, relevance);
  let winnerEntry = llmDecision
    ? (eligible.find((r) => r.bid.industryId === llmDecision.winnerIndustryId) ?? deterministicWinner)
    : deterministicWinner;

  // Hard ceiling: whatever picked winnerEntry above — the LLM's own
  // judgment, for domain fit or any other reason — its composite may not
  // trail the best eligible composite by more than MAX_COMPOSITE_OVERRIDE_GAP.
  // This is what actually balances "best value/optimization" against domain
  // expertise rather than leaving it to the LLM's unenforced discretion.
  const bestEligibleScore = Math.max(...eligible.map((r) => r.score));
  if (bestEligibleScore - winnerEntry.score > MAX_COMPOSITE_OVERRIDE_GAP) {
    winnerEntry = deterministicWinner;
  }

  const f = winnerEntry.bid.factorScores;
  const scoreSummary =
    `composite score ${winnerEntry.score.toFixed(3)} (price ${f.price.toFixed(2)}, quality ${f.quality.toFixed(2)}, ` +
    `error% ${f.errorRate.toFixed(2)}, knowledge ${f.knowledge.toFixed(2)}, context ${f.contextWindow.toFixed(2)}, ` +
    `speed ${f.speed.toFixed(2)}, load ${f.load.toFixed(2)}), $${winnerEntry.bid.estimatedTotalCostUsd.toFixed(6)}`;

  const reason =
    llmDecision && winnerEntry.bid.industryId === llmDecision.winnerIndustryId
      ? `Decision agent (${DECISION_MODEL_ID}) chose ${capitalize(winnerEntry.bid.industryId)}: ${llmDecision.reason} [${scoreSummary}]`
      : `${capitalize(winnerEntry.bid.industryId)} agent won on ${scoreSummary}`;

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
