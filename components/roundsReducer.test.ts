import { describe, expect, it } from "vitest";
import {
  initialRoundsState,
  roundsReducer,
  selectContributions,
  selectRanked,
  selectWinner,
  type RoundsAction,
  type RoundsState,
} from "./roundsReducer";
import type { DecisionResult, FactorScores, IndustryAgentId, IndustryBid, ScoredIndustryBid } from "@/lib/shared/types";

const FACTORS: FactorScores = {
  price: 0.9,
  load: 0.7,
  quality: 0.58,
  knowledge: 0.55,
  speed: 0.9,
  errorRate: 0.98,
  contextWindow: 1,
};

function bid(industryId: IndustryAgentId, cost = 0.0002): IndustryBid {
  return {
    industryId,
    errorRatePct: 2,
    providerId: "gemini",
    quoteId: `q-${industryId}`,
    modelId: "google/gemini-2.5-flash-lite",
    pricePerInputTokenUsd: 1e-7,
    pricePerOutputTokenUsd: 4e-7,
    estimatedInputTokens: 20,
    estimatedOutputTokens: 200,
    estimatedTotalCostUsd: cost,
    qualityScore: 0.58,
    qualityJustification: "test",
    loadScore: 0.3,
    knowledgeScore: 0.55,
    speedScore: 0.9,
    contextWindowTokens: 1_048_576,
    expiresAt: new Date().toISOString(),
  };
}

function scored(industryId: IndustryAgentId, compositeScore: number): ScoredIndustryBid {
  return { ...bid(industryId), factorScores: FACTORS, compositeScore };
}

function decision(winner: IndustryAgentId, rankedIds: IndustryAgentId[]): DecisionResult {
  const ranked = rankedIds.map((id, i) => ({
    bid: scored(id, 1 - i * 0.1),
    score: 1 - i * 0.1,
    budgetFit: true,
  }));
  return {
    winner: ranked.find((r) => r.bid.industryId === winner)!.bid,
    score: 0.9,
    reason: "test reason",
    ranked,
    rejectedForBudget: [],
  };
}

function run(actions: RoundsAction[]): RoundsState {
  return actions.reduce(roundsReducer, initialRoundsState);
}

const submitted: RoundsAction = {
  type: "task.submitted",
  taskId: "t1",
  prompt: "Review this NDA clause",
  complexityHint: "complex",
  budgetUsd: 0.5,
  at: 1000,
};

describe("roundsReducer", () => {
  it("seeds every industry agent as pending so the auction fills in live", () => {
    const state = run([submitted]);
    const round = state.byId.t1;
    expect(round.bids).toHaveLength(4);
    expect(round.bids.every((b) => b.outcome === "pending")).toBe(true);
    expect(round.phase).toBe("bidding");
  });

  it("stores the whole bid object and its latency, not a formatted string", () => {
    const state = run([submitted, { type: "bid.received", taskId: "t1", bid: bid("finance"), at: 1600 }]);
    const entry = state.byId.t1.bids.find((b) => b.industryId === "finance")!;
    expect(entry.outcome).toBe("bid");
    expect(entry.bid?.quoteId).toBe("q-finance");
    expect(entry.latencyMs).toBe(600);
  });

  it("preserves industry ordering when a bid lands", () => {
    const before = run([submitted]).byId.t1.bids.map((b) => b.industryId);
    const after = run([submitted, { type: "bid.received", taskId: "t1", bid: bid("technology"), at: 1100 }]).byId.t1.bids.map(
      (b) => b.industryId,
    );
    expect(after).toEqual(before);
  });

  it("records an exclusion with its reason", () => {
    const state = run([
      submitted,
      { type: "bid.excluded", taskId: "t1", excluded: { industryId: "legal", reason: "timeout" }, at: 1200 },
    ]);
    const entry = state.byId.t1.bids.find((b) => b.industryId === "legal")!;
    expect(entry.outcome).toBe("excluded");
    expect(entry.excludedReason).toBe("timeout");
  });

  it("detects an LLM override structurally when the winner is not ranked[0]", () => {
    const state = run([
      submitted,
      { type: "decision.made", taskId: "t1", decision: decision("legal", ["finance", "technology", "legal"]), at: 2000 },
    ]);
    const d = state.byId.t1.decision!;
    expect(d.priorTopIndustryId).toBe("finance");
    expect(d.winnerIndustryId).toBe("legal");
    expect(d.overrodePrior).toBe(true);
  });

  it("reports no override when the winner is ranked[0]", () => {
    const state = run([
      submitted,
      { type: "decision.made", taskId: "t1", decision: decision("finance", ["finance", "legal"]), at: 2000 },
    ]);
    expect(state.byId.t1.decision!.overrodePrior).toBe(false);
  });

  it("attaches factor scores and ranks from decision.ranked", () => {
    const state = run([
      submitted,
      { type: "decision.made", taskId: "t1", decision: decision("finance", ["finance", "legal"]), at: 2000 },
    ]);
    const ranked = selectRanked(state.byId.t1).filter((b) => b.scored);
    expect(ranked.map((b) => b.industryId)).toEqual(["finance", "legal"]);
    expect(ranked[0].scored!.rank).toBe(1);
    expect(ranked[0].scored!.factorScores.contextWindow).toBe(1);
    expect(selectWinner(state.byId.t1)!.industryId).toBe("finance");
  });

  it("keeps an excluded agent excluded even when the decision ranks it", () => {
    const state = run([
      submitted,
      { type: "bid.excluded", taskId: "t1", excluded: { industryId: "legal", reason: "timeout" }, at: 1200 },
      { type: "decision.made", taskId: "t1", decision: decision("finance", ["finance", "legal"]), at: 2000 },
    ]);
    expect(state.byId.t1.bids.find((b) => b.industryId === "legal")!.outcome).toBe("excluded");
  });

  it("captures the settlement and the task output that the old UI discarded", () => {
    const settlement = {
      taskId: "t1",
      providerId: "gemini" as const,
      industryId: "finance" as const,
      mode: "channel" as const,
      txHash: "ABC123",
      amountDrops: "1311",
      amountUsd: 0.00065,
      memo: {} as never,
      explorerUrl: "https://testnet.xrpl.org/transactions/ABC123",
    };
    const state = run([
      submitted,
      { type: "settlement.started", taskId: "t1", providerId: "gemini", industryId: "finance", at: 2100 },
      { type: "settlement.confirmed", taskId: "t1", settlement, at: 2500 },
      { type: "task.completed", taskId: "t1", output: "The clause is acceptable.", at: 2600 },
    ]);
    const round = state.byId.t1;
    expect(round.settlementStartedAt).toBe(2100);
    expect(round.settlement?.txHash).toBe("ABC123");
    expect(round.output).toBe("The clause is acceptable.");
    expect(round.phase).toBe("settled");
  });

  it("keeps the fallback reason instead of only the word 'fallback'", () => {
    const state = run([
      submitted,
      { type: "settlement.fallback", taskId: "t1", reason: "tecUNFUNDED", at: 2200 },
    ]);
    expect(state.byId.t1.fallbackReason).toBe("tecUNFUNDED");
    expect(state.byId.t1.notes[0].kind).toBe("warn");
  });

  it("does not let a late task.completed overwrite a terminal failure", () => {
    const state = run([
      submitted,
      { type: "task.failed", taskId: "t1", reason: "execute failed", at: 2000 },
      { type: "task.completed", taskId: "t1", output: "late", at: 2100 },
    ]);
    expect(state.byId.t1.phase).toBe("failed");
  });

  it("creates a round for an event whose submission it never saw", () => {
    const state = run([{ type: "bid.received", taskId: "other", bid: bid("finance"), at: 500 }]);
    expect(state.order).toEqual(["other"]);
    expect(state.byId.other.prompt).toBe("");
  });

  it("caps retained rounds", () => {
    const actions: RoundsAction[] = Array.from({ length: 25 }, (_, i) => ({
      type: "task.submitted",
      taskId: `t${i}`,
      prompt: `task ${i}`,
      complexityHint: "simple",
      budgetUsd: 0.1,
      at: 1000 + i,
    }));
    const state = run(actions);
    expect(state.order).toHaveLength(20);
    expect(Object.keys(state.byId)).toHaveLength(20);
    expect(state.order[0]).toBe("t24");
  });

  it("orders contributions by weight x score, descending", () => {
    const contributions = selectContributions(FACTORS);
    for (let i = 1; i < contributions.length; i++) {
      expect(contributions[i - 1].contribution).toBeGreaterThanOrEqual(contributions[i].contribution);
    }
    const total = contributions.reduce((sum, c) => sum + c.contribution, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(1);
  });
});
