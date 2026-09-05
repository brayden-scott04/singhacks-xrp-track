import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeHistoryStats, createHistoryStore, type HistoryStore } from "./historyStore";
import type { HistoryBidSnapshot, TaskHistoryInput } from "../shared/historyTypes";
import type { FactorScores, IndustryAgentId, IndustryBid, ProviderId } from "../shared/types";

/** Runs `fn` against a fresh, isolated SQLite file and always cleans it up after — the "temp DB file" the acceptance criteria call for. */
function withTempStore(fn: (store: HistoryStore, dbPath: string) => void): void {
  const dbPath = path.join(os.tmpdir(), `bidstream-history-test-${randomUUID()}.db`);
  const store = createHistoryStore(dbPath);
  try {
    fn(store, dbPath);
  } finally {
    store.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
  }
}

/**
 * Convenience factory: takes the handful of fields tests actually vary
 * (flat, as the old HistoryBidSnapshot shape used to be) and builds a real
 * nested { bid: IndustryBid, ... } snapshot — HistoryBidSnapshot now wraps
 * the full raw bid so history can hand a round to the same BidFeed/RoundCard
 * components the live dashboard uses.
 */
function makeBid(
  overrides: Partial<{
    industryId: IndustryAgentId;
    providerId: ProviderId;
    modelId: string;
    estimatedTotalCostUsd: number;
    compositeScore: number | null;
    factorScores: FactorScores | null;
    budgetFit: boolean | null;
    isWinner: boolean;
  }> = {},
): HistoryBidSnapshot {
  const bid: IndustryBid = {
    industryId: overrides.industryId ?? "healthcare",
    providerId: overrides.providerId ?? "openai",
    modelId: overrides.modelId ?? "openai/gpt-4o-mini",
    quoteId: "test-quote",
    pricePerInputTokenUsd: 1.5e-7,
    pricePerOutputTokenUsd: 6e-7,
    estimatedInputTokens: 100,
    estimatedOutputTokens: 100,
    estimatedTotalCostUsd: overrides.estimatedTotalCostUsd ?? 0.0002,
    qualityScore: 0.6,
    qualityJustification: "test",
    loadScore: 0.4,
    knowledgeScore: 0.6,
    speedScore: 0.7,
    contextWindowTokens: 128_000,
    errorRatePct: 2,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
  return {
    bid,
    factorScores: overrides.factorScores ?? null,
    compositeScore: overrides.compositeScore ?? null,
    budgetFit: overrides.budgetFit ?? true,
    isWinner: overrides.isWinner ?? false,
  };
}

function makeInput(overrides: Partial<TaskHistoryInput> = {}): TaskHistoryInput {
  return {
    taskId: randomUUID(),
    sessionId: "session-1",
    createdAt: new Date().toISOString(),
    prompt: "Summarize this quarter's earnings call.",
    complexityHint: "standard",
    budgetUsd: 0.5,
    status: "completed",
    failureReason: null,
    complexityScore: 0.4,
    winnerIndustryId: null,
    winnerProviderId: null,
    winnerModelId: null,
    decisionReason: null,
    decidedByLlm: null,
    bids: [],
    excludedBids: [],
    estimatedCostUsd: null,
    actualCostUsd: null,
    actualInputTokens: null,
    actualOutputTokens: null,
    settlementMode: null,
    txHash: null,
    amountDrops: null,
    amountUsd: null,
    explorerUrl: null,
    fallbackReason: null,
    output: null,
    ...overrides,
  };
}

describe("historyStore: write/read roundtrip", () => {
  it("stores and retrieves a completed task with every field intact", () => {
    withTempStore((store) => {
      const winnerBid = makeBid({
        industryId: "finance",
        providerId: "gemini",
        modelId: "google/gemini-2.5-flash-lite",
        estimatedTotalCostUsd: 0.00015,
        factorScores: { price: 1, load: 0.7, quality: 0.6, knowledge: 0.55, speed: 0.9, errorRate: 1, contextWindow: 1 },
        compositeScore: 0.81,
        isWinner: true,
      });
      const loserBid = makeBid({ industryId: "healthcare", estimatedTotalCostUsd: 0.0003, compositeScore: 0.5 });

      const input = makeInput({
        winnerIndustryId: "finance",
        winnerProviderId: "gemini",
        winnerModelId: "google/gemini-2.5-flash-lite",
        decisionReason: "finance agent won on composite score 0.810",
        decidedByLlm: false,
        bids: [winnerBid, loserBid],
        estimatedCostUsd: 0.00015,
        actualCostUsd: 0.00014,
        actualInputTokens: 20,
        actualOutputTokens: 300,
        settlementMode: "channel",
        txHash: "ABCDEF1234",
        amountDrops: "300",
        amountUsd: 0.00015,
        explorerUrl: "https://testnet.xrpl.org/transactions/ABCDEF1234",
        output: "Revenue grew 12% year over year.",
      });

      store.recordTaskHistory(input);
      const stored = store.getHistoryEntry(input.taskId);

      expect(stored).not.toBeNull();
      expect(stored?.status).toBe("completed");
      expect(stored?.winnerIndustryId).toBe("finance");
      expect(stored?.bids).toHaveLength(2);
      expect(stored?.bids[0].factorScores?.speed).toBeCloseTo(0.9, 5);
      expect(stored?.decidedByLlm).toBe(false);
      expect(stored?.txHash).toBe("ABCDEF1234");
      expect(stored?.output).toBe("Revenue grew 12% year over year.");
    });
  });

  it("records a task that failed before any provider bid, with no bids and a failure reason", () => {
    withTempStore((store) => {
      const input = makeInput({
        status: "failed",
        failureReason: "no provider responded to the bid round",
        bids: [],
      });
      store.recordTaskHistory(input);

      const stored = store.getHistoryEntry(input.taskId);
      expect(stored?.status).toBe("failed");
      expect(stored?.failureReason).toBe("no provider responded to the bid round");
      expect(stored?.winnerIndustryId).toBeNull();
      expect(stored?.txHash).toBeNull();
    });
  });

  it("records a task that got a decision but failed during settlement, keeping the bids and decision reason", () => {
    withTempStore((store) => {
      const bid = makeBid({ industryId: "legal", providerId: "anthropic", isWinner: true, compositeScore: 0.7 });
      const input = makeInput({
        status: "failed",
        failureReason: "WebSocket is not open: readyState 0 (CONNECTING)",
        winnerIndustryId: "legal",
        winnerProviderId: "anthropic",
        decisionReason: "legal agent won on composite score 0.700",
        bids: [bid],
        actualCostUsd: 0.0018,
        actualInputTokens: 40,
        actualOutputTokens: 200,
        fallbackReason: "channel failed, falling back to Payment (websocket was closed, )",
      });
      store.recordTaskHistory(input);

      const stored = store.getHistoryEntry(input.taskId);
      expect(stored?.status).toBe("failed");
      expect(stored?.bids).toHaveLength(1);
      expect(stored?.decisionReason).toContain("legal agent won");
      expect(stored?.fallbackReason).toContain("channel failed");
      expect(stored?.txHash).toBeNull();
    });
  });

  it("survives being closed and reopened against the same file", () => {
    const dbPath = path.join(os.tmpdir(), `bidstream-history-test-${randomUUID()}.db`);
    try {
      const store1 = createHistoryStore(dbPath);
      const input = makeInput();
      store1.recordTaskHistory(input);
      store1.close();

      const store2 = createHistoryStore(dbPath);
      const stored = store2.getHistoryEntry(input.taskId);
      expect(stored?.taskId).toBe(input.taskId);
      store2.close();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
    }
  });
});

describe("historyStore: listHistory", () => {
  it("filters by status, industry, and prompt substring, and reports the total independent of the page size", () => {
    withTempStore((store) => {
      store.recordTaskHistory(makeInput({ status: "completed", winnerIndustryId: "legal", prompt: "Review the NDA" }));
      store.recordTaskHistory(makeInput({ status: "completed", winnerIndustryId: "finance", prompt: "Summarize the 10-K" }));
      store.recordTaskHistory(makeInput({ status: "failed", winnerIndustryId: null, prompt: "Review the lease" }));

      expect(store.listHistory({}).total).toBe(3);
      expect(store.listHistory({ status: "completed" }).total).toBe(2);
      expect(store.listHistory({ industryId: "legal" }).total).toBe(1);
      expect(store.listHistory({ q: "Review" }).total).toBe(2);
      expect(store.listHistory({ status: "completed", q: "Review" }).total).toBe(1);
    });
  });

  it("paginates with limit/offset while total reflects the whole filtered set", () => {
    withTempStore((store) => {
      for (let i = 0; i < 5; i++) {
        store.recordTaskHistory(makeInput({ createdAt: new Date(2026, 0, i + 1).toISOString() }));
      }
      const page1 = store.listHistory({ limit: 2, offset: 0 });
      const page2 = store.listHistory({ limit: 2, offset: 2 });

      expect(page1.total).toBe(5);
      expect(page1.rows).toHaveLength(2);
      expect(page2.rows).toHaveLength(2);
      // newest first
      expect(page1.rows[0].createdAt > page1.rows[1].createdAt).toBe(true);
    });
  });

  it("omits bids and output from list rows but reports a bid count", () => {
    withTempStore((store) => {
      const input = makeInput({ bids: [makeBid(), makeBid({ industryId: "legal" })], output: "some long output" });
      store.recordTaskHistory(input);

      const { rows } = store.listHistory({});
      expect(rows[0]).not.toHaveProperty("bids");
      expect(rows[0]).not.toHaveProperty("output");
      expect(rows[0].bidCount).toBe(2);
    });
  });
});

describe("computeHistoryStats", () => {
  it("computes cumulativeSavingsUsd as the sum of (most expensive bid − amount paid) per completed task", () => {
    withTempStore((store) => {
      // Round A: three bids at 0.01/0.02/0.03, won and paid at 0.01 -> saved 0.02
      store.recordTaskHistory(
        makeInput({
          status: "completed",
          winnerIndustryId: "finance",
          amountUsd: 0.01,
          bids: [
            makeBid({ industryId: "finance", estimatedTotalCostUsd: 0.01, isWinner: true }),
            makeBid({ industryId: "healthcare", estimatedTotalCostUsd: 0.02 }),
            makeBid({ industryId: "legal", estimatedTotalCostUsd: 0.03 }),
          ],
        }),
      );
      // Round B: single bidder at 0.05, won and paid at 0.05 -> saved 0 (nothing to shop against)
      store.recordTaskHistory(
        makeInput({
          status: "completed",
          winnerIndustryId: "technology",
          amountUsd: 0.05,
          bids: [makeBid({ industryId: "technology", estimatedTotalCostUsd: 0.05, isWinner: true })],
        }),
      );
      // A failed task must not contribute savings even though it has bids.
      store.recordTaskHistory(
        makeInput({
          status: "failed",
          bids: [makeBid({ industryId: "finance", estimatedTotalCostUsd: 0.1, isWinner: true })],
        }),
      );

      const stats = store.getHistoryStats();
      expect(stats.cumulativeSavingsUsd).toBeCloseTo(0.02, 10);
      expect(stats.totalSettledUsd).toBeCloseTo(0.06, 10);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBeCloseTo(2 / 3, 10);
    });
  });

  it("computes per-industry win counts and win rate as a share of completed tasks", () => {
    withTempStore((store) => {
      store.recordTaskHistory(makeInput({ status: "completed", winnerIndustryId: "legal", amountUsd: 0.01, bids: [makeBid({ industryId: "legal", isWinner: true })] }));
      store.recordTaskHistory(makeInput({ status: "completed", winnerIndustryId: "legal", amountUsd: 0.02, bids: [makeBid({ industryId: "legal", isWinner: true })] }));
      store.recordTaskHistory(makeInput({ status: "completed", winnerIndustryId: "finance", amountUsd: 0.03, bids: [makeBid({ industryId: "finance", isWinner: true })] }));

      const stats = store.getHistoryStats();
      const legal = stats.perIndustry.find((i) => i.industryId === "legal");
      const finance = stats.perIndustry.find((i) => i.industryId === "finance");
      const healthcare = stats.perIndustry.find((i) => i.industryId === "healthcare");

      expect(legal?.wins).toBe(2);
      expect(legal?.winRate).toBeCloseTo(2 / 3, 10);
      expect(legal?.totalPaidUsd).toBeCloseTo(0.03, 10);
      expect(legal?.avgCostUsd).toBeCloseTo(0.015, 10);
      expect(finance?.wins).toBe(1);
      expect(healthcare?.wins).toBe(0);
    });
  });

  it("returns all-zero stats for an empty store without dividing by zero", () => {
    withTempStore((store) => {
      const stats = store.getHistoryStats();
      expect(stats.totalTasks).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgCostPerTaskUsd).toBe(0);
      expect(stats.cumulativeSavingsUsd).toBe(0);
    });
  });

  it("is a pure function of already-parsed rows, independent of SQLite", () => {
    const rows = [
      { ...makeInput({ status: "completed", amountUsd: 0.01, bids: [makeBid({ estimatedTotalCostUsd: 0.03 })] }), completedAt: new Date().toISOString() },
    ];
    expect(computeHistoryStats(rows).cumulativeSavingsUsd).toBeCloseTo(0.02, 10);
  });
});
