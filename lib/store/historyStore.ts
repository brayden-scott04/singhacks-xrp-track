import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  HistoryBidSnapshot,
  HistoryStats,
  IndustryAgentStats,
  ListHistoryOptions,
  ListHistoryResult,
  StoredTaskHistory,
  TaskHistoryInput,
  TaskHistoryListItem,
} from "../shared/historyTypes";
import type { IndustryAgentId } from "../shared/types";
import { allIndustryIds } from "../agent/industryRegistry";
import { globalSingleton } from "./globalSingleton";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS task_history (
    task_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    prompt TEXT NOT NULL,
    complexity_hint TEXT NOT NULL,
    complexity_score REAL,
    budget_usd REAL NOT NULL,
    status TEXT NOT NULL,
    failure_reason TEXT,
    winner_industry_id TEXT,
    winner_provider_id TEXT,
    winner_model_id TEXT,
    decision_reason TEXT,
    decided_by_llm INTEGER,
    bids_json TEXT NOT NULL,
    excluded_bids_json TEXT NOT NULL,
    estimated_cost_usd REAL,
    actual_cost_usd REAL,
    actual_input_tokens INTEGER,
    actual_output_tokens INTEGER,
    settlement_mode TEXT,
    tx_hash TEXT,
    amount_drops TEXT,
    amount_usd REAL,
    explorer_url TEXT,
    fallback_reason TEXT,
    output TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_task_history_session ON task_history(session_id);
  CREATE INDEX IF NOT EXISTS idx_task_history_created ON task_history(created_at);
  CREATE INDEX IF NOT EXISTS idx_task_history_status ON task_history(status);
`;

/** SQLite row shape exactly as columns come back — snake_case, JSON still strings, booleans still 0/1/null. */
interface RawRow {
  task_id: string;
  session_id: string;
  created_at: string;
  completed_at: string;
  prompt: string;
  complexity_hint: string;
  complexity_score: number | null;
  budget_usd: number;
  status: string;
  failure_reason: string | null;
  winner_industry_id: string | null;
  winner_provider_id: string | null;
  winner_model_id: string | null;
  decision_reason: string | null;
  decided_by_llm: number | null;
  bids_json: string;
  excluded_bids_json: string;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  actual_input_tokens: number | null;
  actual_output_tokens: number | null;
  settlement_mode: string | null;
  tx_hash: string | null;
  amount_drops: string | null;
  amount_usd: number | null;
  explorer_url: string | null;
  fallback_reason: string | null;
  output: string | null;
}

function parseRow(row: RawRow): StoredTaskHistory {
  return {
    taskId: row.task_id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    prompt: row.prompt,
    complexityHint: row.complexity_hint as TaskHistoryInput["complexityHint"],
    complexityScore: row.complexity_score,
    budgetUsd: row.budget_usd,
    status: row.status as StoredTaskHistory["status"],
    failureReason: row.failure_reason,
    winnerIndustryId: row.winner_industry_id as IndustryAgentId | null,
    winnerProviderId: row.winner_provider_id as StoredTaskHistory["winnerProviderId"],
    winnerModelId: row.winner_model_id,
    decisionReason: row.decision_reason,
    decidedByLlm: row.decided_by_llm === null ? null : row.decided_by_llm === 1,
    bids: JSON.parse(row.bids_json) as HistoryBidSnapshot[],
    excludedBids: JSON.parse(row.excluded_bids_json) as StoredTaskHistory["excludedBids"],
    estimatedCostUsd: row.estimated_cost_usd,
    actualCostUsd: row.actual_cost_usd,
    actualInputTokens: row.actual_input_tokens,
    actualOutputTokens: row.actual_output_tokens,
    settlementMode: row.settlement_mode as StoredTaskHistory["settlementMode"],
    txHash: row.tx_hash,
    amountDrops: row.amount_drops,
    amountUsd: row.amount_usd,
    explorerUrl: row.explorer_url,
    fallbackReason: row.fallback_reason,
    output: row.output,
  };
}

function toListItem(row: StoredTaskHistory): TaskHistoryListItem {
  const { bids, output, ...rest } = row;
  return { ...rest, bidCount: bids.length };
}

/**
 * cumulativeSavingsUsd for one row: the gap between what the most expensive
 * bid in that round would have cost and what was actually paid. Only
 * meaningful for a settled (completed) task — a round with a single bidder
 * scores 0 savings, correctly, since there was no alternative to shop against.
 */
function rowSavingsUsd(row: StoredTaskHistory): number {
  if (row.status !== "completed" || row.amountUsd === null || row.bids.length === 0) return 0;
  const maxBidUsd = Math.max(...row.bids.map((b) => b.bid.estimatedTotalCostUsd));
  return Math.max(0, maxBidUsd - row.amountUsd);
}

/** Pure aggregate math over already-parsed rows — kept separate from SQL so it's trivially unit-testable. */
export function computeHistoryStats(rows: StoredTaskHistory[]): HistoryStats {
  const completedRows = rows.filter((r) => r.status === "completed");
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const rejectedCount = rows.filter((r) => r.status === "rejected").length;

  const totalSpentUsd = rows.reduce((sum, r) => sum + (r.actualCostUsd ?? 0), 0);
  const totalSettledUsd = completedRows.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0);
  const cumulativeSavingsUsd = rows.reduce((sum, r) => sum + rowSavingsUsd(r), 0);

  const channelSettlements = completedRows.filter((r) => r.settlementMode === "channel").length;
  const paymentSettlements = completedRows.filter((r) => r.settlementMode === "payment").length;

  const perIndustry: IndustryAgentStats[] = allIndustryIds().map((industryId) => {
    const won = completedRows.filter((r) => r.winnerIndustryId === industryId);
    const totalPaidUsd = won.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0);
    return {
      industryId,
      wins: won.length,
      winRate: completedRows.length > 0 ? won.length / completedRows.length : 0,
      totalPaidUsd,
      avgCostUsd: won.length > 0 ? totalPaidUsd / won.length : 0,
    };
  });

  return {
    totalTasks: rows.length,
    completed: completedRows.length,
    failed: failedCount,
    rejected: rejectedCount,
    successRate: rows.length > 0 ? completedRows.length / rows.length : 0,
    totalSpentUsd,
    totalSettledUsd,
    avgCostPerTaskUsd: completedRows.length > 0 ? totalSettledUsd / completedRows.length : 0,
    cumulativeSavingsUsd,
    channelSettlements,
    paymentSettlements,
    perIndustry,
  };
}

/**
 * Repository over one SQLite file. Exported as a factory (rather than only a
 * module singleton) so tests can point it at an isolated temp file instead
 * of sharing the app's real database.
 */
export function createHistoryStore(dbPath: string) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO task_history (
      task_id, session_id, created_at, completed_at, prompt, complexity_hint, complexity_score, budget_usd,
      status, failure_reason, winner_industry_id, winner_provider_id, winner_model_id, decision_reason,
      decided_by_llm, bids_json, excluded_bids_json, estimated_cost_usd, actual_cost_usd, actual_input_tokens,
      actual_output_tokens, settlement_mode, tx_hash, amount_drops, amount_usd, explorer_url, fallback_reason, output
    ) VALUES (
      @taskId, @sessionId, @createdAt, @completedAt, @prompt, @complexityHint, @complexityScore, @budgetUsd,
      @status, @failureReason, @winnerIndustryId, @winnerProviderId, @winnerModelId, @decisionReason,
      @decidedByLlm, @bidsJson, @excludedBidsJson, @estimatedCostUsd, @actualCostUsd, @actualInputTokens,
      @actualOutputTokens, @settlementMode, @txHash, @amountDrops, @amountUsd, @explorerUrl, @fallbackReason, @output
    )
  `);

  /**
   * Writes exactly one row per task attempt. Never throws into the caller —
   * a history-recording failure must not take down the task it's recording,
   * so errors are logged and swallowed.
   */
  function recordTaskHistory(input: TaskHistoryInput): void {
    try {
      insertStmt.run({
        taskId: input.taskId,
        sessionId: input.sessionId,
        createdAt: input.createdAt,
        completedAt: new Date().toISOString(),
        prompt: input.prompt,
        complexityHint: input.complexityHint,
        complexityScore: input.complexityScore,
        budgetUsd: input.budgetUsd,
        status: input.status,
        failureReason: input.failureReason,
        winnerIndustryId: input.winnerIndustryId,
        winnerProviderId: input.winnerProviderId,
        winnerModelId: input.winnerModelId,
        decisionReason: input.decisionReason,
        decidedByLlm: input.decidedByLlm === null ? null : input.decidedByLlm ? 1 : 0,
        bidsJson: JSON.stringify(input.bids),
        excludedBidsJson: JSON.stringify(input.excludedBids),
        estimatedCostUsd: input.estimatedCostUsd,
        actualCostUsd: input.actualCostUsd,
        actualInputTokens: input.actualInputTokens,
        actualOutputTokens: input.actualOutputTokens,
        settlementMode: input.settlementMode,
        txHash: input.txHash,
        amountDrops: input.amountDrops,
        amountUsd: input.amountUsd,
        explorerUrl: input.explorerUrl,
        fallbackReason: input.fallbackReason,
        output: input.output,
      });
    } catch (err) {
      console.error("[historyStore] failed to record task history for", input.taskId, err);
    }
  }

  function getHistoryEntry(taskId: string): StoredTaskHistory | null {
    const row = db.prepare("SELECT * FROM task_history WHERE task_id = ?").get(taskId) as RawRow | undefined;
    return row ? parseRow(row) : null;
  }

  function readAllRows(): StoredTaskHistory[] {
    const rows = db.prepare("SELECT * FROM task_history").all() as RawRow[];
    return rows.map(parseRow);
  }

  function listHistory(options: ListHistoryOptions = {}): ListHistoryResult {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (options.status) {
      clauses.push("status = @status");
      params.status = options.status;
    }
    if (options.industryId) {
      clauses.push("winner_industry_id = @industryId");
      params.industryId = options.industryId;
    }
    if (options.sessionId) {
      clauses.push("session_id = @sessionId");
      params.sessionId = options.sessionId;
    }
    if (options.q) {
      clauses.push("prompt LIKE @q");
      params.q = `%${options.q}%`;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM task_history ${where}`).get(params) as { n: number }).n;
    const rows = db
      .prepare(`SELECT * FROM task_history ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset }) as RawRow[];

    return { rows: rows.map(parseRow).map(toListItem), total };
  }

  function getHistoryStats(): HistoryStats {
    return computeHistoryStats(readAllRows());
  }

  function close(): void {
    db.close();
  }

  return { recordTaskHistory, getHistoryEntry, listHistory, getHistoryStats, close };
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "history.db");

/** App-wide singleton, pinned to globalThis — see globalSingleton.ts for why. */
export const historyStore = globalSingleton("historyStore", () => createHistoryStore(DEFAULT_DB_PATH));
