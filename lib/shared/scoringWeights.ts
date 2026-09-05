import type { FactorScores, IndustryBid } from "./types";

/** Fixed default weights for the decision agent's composite score. Sums to 1.00. */
export const DEFAULT_FACTOR_WEIGHTS: FactorScores = {
  quality: 0.25,
  errorRate: 0.2,
  price: 0.2,
  knowledge: 0.15,
  contextWindow: 0.1,
  speed: 0.06,
  load: 0.04,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Normalizes one bid's raw factors against the round it competed in, always
 * producing 0..1 values where higher is better. Price/contextWindow are
 * relative to the best-in-round raw value; load/errorRate are inverted
 * (lower raw value -> higher score); quality/knowledge/speed already arrive
 * as 0..1 "higher is better" self-reports and pass through clamped.
 */
export function normalizeFactors(bid: IndustryBid, allBidsInRound: IndustryBid[]): FactorScores {
  const maxCost = Math.max(...allBidsInRound.map((b) => b.estimatedTotalCostUsd));
  const maxContext = Math.max(...allBidsInRound.map((b) => b.contextWindowTokens));

  return {
    price: maxCost > 0 ? clamp01(1 - bid.estimatedTotalCostUsd / maxCost) : 1,
    contextWindow: maxContext > 0 ? clamp01(bid.contextWindowTokens / maxContext) : 1,
    load: clamp01(1 - bid.loadScore),
    errorRate: clamp01(1 - bid.errorRatePct / 100),
    quality: clamp01(bid.qualityScore),
    knowledge: clamp01(bid.knowledgeScore),
    speed: clamp01(bid.speedScore),
  };
}

export function computeCompositeScore(factors: FactorScores, weights: FactorScores = DEFAULT_FACTOR_WEIGHTS): number {
  return (Object.keys(weights) as Array<keyof FactorScores>).reduce((sum, key) => sum + factors[key] * weights[key], 0);
}
