import { describe, expect, it } from "vitest";
import { getErrorRatePct, recordOutcome } from "./agentStatsStore";
import type { IndustryAgentId } from "../shared/types";

// Casting arbitrary strings keeps each test isolated in the module-level
// store without the 3 real IndustryAgentId values leaking state between
// tests.
function freshId(name: string): IndustryAgentId {
  return name as unknown as IndustryAgentId;
}

describe("agentStatsStore", () => {
  it("returns the seeded baseline before any outcomes are recorded", () => {
    expect(getErrorRatePct(freshId("unused-agent"))).toBe(2);
  });

  it("keeps returning the seeded baseline below the minimum sample threshold", () => {
    const id = freshId("agent-few-samples");
    recordOutcome(id, false);
    recordOutcome(id, false);
    recordOutcome(id, true);
    // 3 samples < MIN_SAMPLES_BEFORE_TRUSTING (5) — real 2/3 failure rate should not surface yet.
    expect(getErrorRatePct(id)).toBe(2);
  });

  it("reports the real rolling error rate once enough samples exist", () => {
    const id = freshId("agent-enough-samples");
    recordOutcome(id, true);
    recordOutcome(id, true);
    recordOutcome(id, true);
    recordOutcome(id, false);
    recordOutcome(id, false);
    // 5 samples, 2 failures -> 40%
    expect(getErrorRatePct(id)).toBeCloseTo(40, 5);
  });

  it("tracks each industry agent independently", () => {
    const good = freshId("agent-good");
    const bad = freshId("agent-bad");
    for (let i = 0; i < 5; i++) recordOutcome(good, true);
    for (let i = 0; i < 5; i++) recordOutcome(bad, false);

    expect(getErrorRatePct(good)).toBe(0);
    expect(getErrorRatePct(bad)).toBe(100);
  });
});
