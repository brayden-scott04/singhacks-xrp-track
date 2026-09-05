"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useSSE } from "@/hooks/useSSE";
import type { MemoPayload, SessionState, SettlementRecord } from "@/lib/shared/types";
import type { BidStreamEvent } from "@/lib/store/eventBus";
import { BidFeed, type BidRow, type Round } from "./BidFeed";
import { MemoView } from "./MemoView";
import { SessionBar } from "./SessionBar";
import { SettlementFeed } from "./SettlementFeed";
import { TaskForm } from "./TaskForm";

interface RoundsState {
  order: string[]; // taskId, newest first
  byId: Record<string, Round>;
}

type RoundsAction =
  | { type: "task.submitted"; taskId: string; prompt: string; budgetUsd: number }
  | { type: "bid.received"; taskId: string; row: Omit<BidRow, "status"> }
  | { type: "bid.excluded"; taskId: string; industryId: string; reason: string }
  | { type: "decision.made"; taskId: string; winnerIndustryId: string; rejectedForBudget: string[]; suffix: string }
  | { type: "note"; taskId: string; suffix: string };

function ensureRound(state: RoundsState, taskId: string): RoundsState {
  if (state.byId[taskId]) return state;
  return {
    order: [taskId, ...state.order],
    byId: { ...state.byId, [taskId]: { taskId, title: "", rows: [] } },
  };
}

function roundsReducer(state: RoundsState, action: RoundsAction): RoundsState {
  const withRound = ensureRound(state, action.taskId);
  const round = withRound.byId[action.taskId];

  switch (action.type) {
    case "task.submitted": {
      const title = `"${action.prompt.slice(0, 70)}" — budget $${action.budgetUsd.toFixed(2)}`;
      return { ...withRound, byId: { ...withRound.byId, [action.taskId]: { ...round, title } } };
    }
    case "bid.received":
      return {
        ...withRound,
        byId: {
          ...withRound.byId,
          [action.taskId]: { ...round, rows: [...round.rows, { ...action.row, status: "pending" }] },
        },
      };
    case "bid.excluded":
      return {
        ...withRound,
        byId: {
          ...withRound.byId,
          [action.taskId]: {
            ...round,
            rows: [...round.rows, { industryId: action.industryId, status: "excluded", excludedReason: action.reason }],
          },
        },
      };
    case "decision.made": {
      const rows = round.rows.map((row) => {
        if (row.industryId === action.winnerIndustryId) return { ...row, status: "winner" as const };
        if (action.rejectedForBudget.includes(row.industryId)) return { ...row, status: "rejected" as const };
        return row;
      });
      return {
        ...withRound,
        byId: { ...withRound.byId, [action.taskId]: { ...round, title: round.title + action.suffix, rows } },
      };
    }
    case "note":
      return {
        ...withRound,
        byId: { ...withRound.byId, [action.taskId]: { ...round, title: round.title + action.suffix } },
      };
    default:
      return state;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : `request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function Dashboard() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [memo, setMemo] = useState<MemoPayload | null>(null);
  const [rounds, dispatch] = useReducer(roundsReducer, { order: [], byId: {} });

  useEffect(() => {
    fetch("/api/session", { method: "POST" })
      .then((res) => parseJsonOrThrow<SessionState>(res))
      .then((s) => {
        setSession(s);
        setSessionError(null);
      })
      .catch((err) => setSessionError(err instanceof Error ? err.message : String(err)));
  }, []);

  const handleEvent = useCallback((evt: BidStreamEvent) => {
    switch (evt.type) {
      case "bid.received": {
        const b = evt.bid;
        dispatch({
          type: "bid.received",
          taskId: evt.taskId,
          row: {
            industryId: b.industryId,
            providerId: b.providerId,
            modelId: b.modelId,
            estimatedTotalCostUsd: b.estimatedTotalCostUsd,
            qualityScore: b.qualityScore,
            knowledgeScore: b.knowledgeScore,
            speedScore: b.speedScore,
            loadScore: b.loadScore,
            errorRatePct: b.errorRatePct,
            contextWindowTokens: b.contextWindowTokens,
          },
        });
        break;
      }
      case "bid.excluded": {
        dispatch({
          type: "bid.excluded",
          taskId: evt.taskId,
          industryId: evt.excluded.industryId,
          reason: evt.excluded.reason,
        });
        break;
      }
      case "decision.made": {
        dispatch({
          type: "decision.made",
          taskId: evt.taskId,
          winnerIndustryId: evt.decision.winner.industryId,
          rejectedForBudget: evt.decision.rejectedForBudget,
          suffix: ` — winner: ${evt.decision.winner.industryId} (${evt.decision.reason})`,
        });
        break;
      }
      case "settlement.confirmed": {
        setSettlements((prev) => [evt.settlement, ...prev]);
        setMemo(evt.settlement.memo);
        setSession((prev) => (prev ? { ...prev, spentUsd: prev.spentUsd + evt.settlement.amountUsd } : prev));
        break;
      }
      case "settlement.fallback": {
        dispatch({ type: "note", taskId: evt.taskId, suffix: ` — channel failed, falling back to Payment (${evt.reason})` });
        break;
      }
      case "session.warning":
      case "session.paused":
      case "session.resumed": {
        setSession(evt.session);
        break;
      }
      case "task.rejected":
      case "task.failed": {
        dispatch({ type: "note", taskId: evt.taskId, suffix: ` — ${evt.type}: ${evt.reason}` });
        break;
      }
    }
  }, []);

  useSSE("/api/events", (evt) => {
    if (session && evt.sessionId === session.sessionId) handleEvent(evt);
  });

  const handleResume = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/session/${session.sessionId}/resume`, { method: "POST" });
      const updated = await parseJsonOrThrow<SessionState>(res);
      setSession(updated);
      setSessionError(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err));
    }
  }, [session]);

  const handleSubmitted = useCallback(
    ({ taskId, prompt, budgetUsd }: { taskId: string; prompt: string; budgetUsd: number }) => {
      dispatch({ type: "task.submitted", taskId, prompt, budgetUsd });
    },
    [],
  );

  const orderedRounds = rounds.order.map((id) => rounds.byId[id]);

  return (
    <>
      <header>
        <h1>BidStream</h1>
        <p className="tagline">
          AI providers bid via HTTP 402. XRPL settles the winner. Every payment carries its own justification.
        </p>
      </header>
      {sessionError && (
        <section className="panel" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          <strong>Session error:</strong> {sessionError}
        </section>
      )}
      <SessionBar session={session} onResume={handleResume} />
      <main>
        <TaskForm sessionId={session?.sessionId ?? null} onSubmitted={handleSubmitted} />
        <BidFeed rounds={orderedRounds} />
        <SettlementFeed settlements={settlements} />
        <MemoView memo={memo} />
      </main>
    </>
  );
}
