import { describe, expect, it } from "vitest";
import { computeCompositeScore, DEFAULT_FACTOR_WEIGHTS, normalizeFactors } from "./scoringWeights";
import type { IndustryBid } from "./types";

function makeBid(overrides: Partial<IndustryBid>): IndustryBid {
  return {
    providerId: "openai",
    quoteId: "q1",
    modelId: "test-model",
    pricePerInputTokenUsd: 1e-6,
    pricePerOutputTokenUsd: 1e-6,
    estimatedInputTokens: 100,
    estimatedOutputTokens: 100,
    estimatedTotalCostUsd: 0.0002,
    qualityScore: 0.6,
    qualityJustification: "test",
    loadScore: 0.5,
    knowledgeScore: 0.6,
    speedScore: 0.7,
    contextWindowTokens: 128_000,
    expiresAt: new Date().toISOString(),
    industryId: "healthcare",
    errorRatePct: 2,
    ...overrides,
  };
}

describe("normalizeFactors", () => {
  it("scores price relative to the round's most expensive bid (1 - cost/maxCost)", () => {
    const cheap = makeBid({ industryId: "healthcare", estimatedTotalCostUsd: 0.0001 });
    const expensive = makeBid({ industryId: "legal", estimatedTotalCostUsd: 0.0004 });

    const cheapFactors = normalizeFactors(cheap, [cheap, expensive]);
    const expensiveFactors = normalizeFactors(expensive, [cheap, expensive]);

    expect(cheapFactors.price).toBeCloseTo(0.75, 5);
    expect(expensiveFactors.price).toBe(0);
  });

  it("gives the largest context window in the round a perfect contextWindow score", () => {
    const small = makeBid({ industryId: "healthcare", contextWindowTokens: 100_000 });
    const large = makeBid({ industryId: "finance", contextWindowTokens: 1_000_000 });

    const smallFactors = normalizeFactors(small, [small, large]);
    const largeFactors = normalizeFactors(large, [small, large]);

    expect(largeFactors.contextWindow).toBe(1);
    expect(smallFactors.contextWindow).toBeCloseTo(0.1, 5);
  });

  it("inverts load and error rate so lower raw values score higher", () => {
    const busy = makeBid({ loadScore: 0.9, errorRatePct: 40 });
    const idle = makeBid({ loadScore: 0.1, errorRatePct: 0 });

    const busyFactors = normalizeFactors(busy, [busy]);
    const idleFactors = normalizeFactors(idle, [idle]);

    expect(busyFactors.load).toBeCloseTo(0.1, 5);
    expect(idleFactors.load).toBeCloseTo(0.9, 5);
    expect(busyFactors.errorRate).toBeCloseTo(0.6, 5);
    expect(idleFactors.errorRate).toBe(1);
  });

  it("passes quality/knowledge/speed through unchanged (already 0..1, higher is better)", () => {
    const bid = makeBid({ qualityScore: 0.42, knowledgeScore: 0.77, speedScore: 0.13 });
    const factors = normalizeFactors(bid, [bid]);

    expect(factors.quality).toBeCloseTo(0.42, 5);
    expect(factors.knowledge).toBeCloseTo(0.77, 5);
    expect(factors.speed).toBeCloseTo(0.13, 5);
  });
});

describe("computeCompositeScore", () => {
  it("returns 1 when every factor is a perfect 1 (weights sum to 1)", () => {
    const perfect = {
      price: 1,
      load: 1,
      quality: 1,
      knowledge: 1,
      speed: 1,
      errorRate: 1,
      contextWindow: 1,
    };
    expect(computeCompositeScore(perfect)).toBeCloseTo(1, 10);
  });

  it("returns 0 when every factor is 0", () => {
    const worst = {
      price: 0,
      load: 0,
      quality: 0,
      knowledge: 0,
      speed: 0,
      errorRate: 0,
      contextWindow: 0,
    };
    expect(computeCompositeScore(worst)).toBe(0);
  });

  it("weights quality higher than load by default", () => {
    expect(DEFAULT_FACTOR_WEIGHTS.quality).toBeGreaterThan(DEFAULT_FACTOR_WEIGHTS.load);
  });
});
