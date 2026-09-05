import { describe, expect, it } from "vitest";
import { MAX_COMPOSITE_OVERRIDE_GAP, RELEVANCE_BONUS_WEIGHT, scoreIndustryRelevance } from "./relevance";
import { DEFAULT_FACTOR_WEIGHTS } from "./scoringWeights";

describe("scoreIndustryRelevance", () => {
  it("scores general highest for a prompt that matches no specialist domain", () => {
    const relevance = scoreIndustryRelevance("why is the sky blue");

    expect(relevance.legal).toBe(0);
    expect(relevance.healthcare).toBe(0);
    expect(relevance.finance).toBe(0);
    expect(relevance.technology).toBe(0);
    expect(relevance.general).toBe(1);
  });

  it("scores technology highest for a programming prompt", () => {
    const relevance = scoreIndustryRelevance("write a python program to calculate the square of a number");

    expect(relevance.technology).toBeGreaterThan(relevance.legal);
    expect(relevance.technology).toBeGreaterThan(relevance.healthcare);
    expect(relevance.technology).toBeGreaterThan(relevance.finance);
    expect(relevance.technology).toBeGreaterThan(relevance.general);
  });

  it("scores legal highest for a contract review prompt", () => {
    const relevance = scoreIndustryRelevance("review this employment contract for compliance and liability issues");

    expect(relevance.legal).toBeGreaterThan(relevance.technology);
    expect(relevance.legal).toBeGreaterThan(relevance.healthcare);
    expect(relevance.legal).toBeGreaterThan(relevance.finance);
    expect(relevance.legal).toBeGreaterThan(relevance.general);
  });

  it("scores healthcare highest for a clinical prompt", () => {
    const relevance = scoreIndustryRelevance("patient reports chest pain, what treatment and dosage is indicated");

    expect(relevance.healthcare).toBeGreaterThan(relevance.legal);
    expect(relevance.healthcare).toBeGreaterThan(relevance.finance);
    expect(relevance.healthcare).toBeGreaterThan(relevance.technology);
    expect(relevance.healthcare).toBeGreaterThan(relevance.general);
  });

  it("scores finance highest for a budgeting prompt", () => {
    const relevance = scoreIndustryRelevance("prepare a quarterly budget and cash flow forecast for the investment portfolio");

    expect(relevance.finance).toBeGreaterThan(relevance.legal);
    expect(relevance.finance).toBeGreaterThan(relevance.healthcare);
    expect(relevance.finance).toBeGreaterThan(relevance.technology);
    expect(relevance.finance).toBeGreaterThan(relevance.general);
  });

  it("keeps every score within 0..1", () => {
    const relevance = scoreIndustryRelevance(
      "patient contract budget python legal medical invoice code diagnosis liability revenue debug",
    );

    for (const value of Object.values(relevance)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("RELEVANCE_BONUS_WEIGHT", () => {
  it("is never larger than the smallest official factor weight, so it can only tip a close call", () => {
    expect(RELEVANCE_BONUS_WEIGHT).toBeLessThanOrEqual(Math.min(...Object.values(DEFAULT_FACTOR_WEIGHTS)));
  });
});

describe("MAX_COMPOSITE_OVERRIDE_GAP", () => {
  it("is never smaller than the relevance bonus itself, so a full-strength nudge can't be self-defeating", () => {
    expect(MAX_COMPOSITE_OVERRIDE_GAP).toBeGreaterThanOrEqual(RELEVANCE_BONUS_WEIGHT);
  });
});
