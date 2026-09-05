"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useSSE } from "@/hooks/useSSE";
import type { MemoPayload, SessionState, SettlementRecord } from "@/lib/shared/types";
import type { BidStreamEvent } from "@/lib/store/eventBus";
import { BidFeed, type Round } from "./BidFeed";
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
  | { type: "bid.received"; taskId: string; providerId: string; text: string }
  | { type: "bid.excluded"; taskId: string; providerId: string; text: string }
  | { type: "decision.made"; taskId: string; winnerProviderId: string; rejectedForBudget: string[]; suffix: string }
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
          [action.taskId]: { ...round, rows: [...round.rows, { providerId: action.providerId, text: action.text }] },
        },
      };
    case "bid.excluded":
      return {
        ...withRound,
        byId: {
          ...withRound.byId,
          [action.taskId]: {
            ...round,
            rows: [...round.rows, { providerId: action.providerId, text: action.text, className: "excluded" }],
          },
        },
      };
    case "decision.made": {
      const rows = round.rows.map((row) => {
        if (row.providerId === action.winnerProviderId) return { ...row, className: "winner" };
        if (action.rejectedForBudget.includes(row.providerId)) return { ...row, className: "rejected" };
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

function fmtUsd(n: number): string {
  return n.toFixed(6);
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
          providerId: b.providerId,
          text: `${b.providerId} (${b.modelId}) — $${fmtUsd(b.estimatedTotalCostUsd)} @ quality ${b.qualityScore.toFixed(2)}`,
        });
        break;
      }
      case "bid.excluded": {
        dispatch({
          type: "bid.excluded",
          taskId: evt.taskId,
          providerId: evt.excluded.providerId,
          text: `${evt.excluded.providerId} excluded — ${evt.excluded.reason}`,
        });
        break;
      }
      case "decision.made": {
        dispatch({
          type: "decision.made",
          taskId: evt.taskId,
          winnerProviderId: evt.decision.winner.providerId,
          rejectedForBudget: evt.decision.rejectedForBudget,
          suffix: ` — winner: ${evt.decision.winner.providerId} (${evt.decision.reason})`,
        });
        break;
      }
      case "settlement.confirmed": {
        setSettlements((prev) => [evt.settlement, ...prev]);
        setMemo(evt.settlement.memo);
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
