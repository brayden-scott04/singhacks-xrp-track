"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSSE, type SseStatus } from "@/hooks/useSSE";
import type { SessionState, SettlementRecord } from "@/lib/shared/types";
import type { BidStreamEvent } from "@/lib/store/eventBus";
import { INDUSTRY_AGENT_IDS } from "@/lib/shared/types";
import { titleCaseId } from "./format";
import { AlertIcon, DotIcon } from "./icons";
import { EmptyState, Pill } from "./ui";
import { MemoView } from "./MemoView";
import { RoundCard } from "./RoundCard";
import { SessionBar } from "./SessionBar";
import { SettlementFeed } from "./SettlementFeed";
import { TaskForm } from "./TaskForm";
import { ThemeToggle } from "./ThemeToggle";
import { initialRoundsState, roundsReducer } from "./roundsReducer";

// Derived, not hardcoded: this sentence already went stale once when a fifth
// agent was added.
const TAGLINE =
  `${INDUSTRY_AGENT_IDS.length} industry agents bid on every task using HTTP 402. A decision agent picks the winner, ` +
  "XRPL pays them, and every payment records why it was made.";

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body ? String(body.error) : `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function ConnectionPill({ status }: { status: SseStatus }) {
  if (status === "open") {
    return (
      <Pill tone="accent" icon={DotIcon}>
        Live
      </Pill>
    );
  }
  return (
    <Pill tone="warn" icon={DotIcon}>
      {status === "connecting" ? "Connecting" : "Reconnecting"}
    </Pill>
  );
}

export function Dashboard() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [rounds, dispatch] = useReducer(roundsReducer, initialRoundsState);
  const [liveMessage, setLiveMessage] = useState("");

  // StrictMode mounts effects twice in dev; without this guard the dashboard
  // creates two sessions and the second one silently wins.
  const sessionRequested = useRef(false);

  useEffect(() => {
    if (sessionRequested.current) return;
    sessionRequested.current = true;

    fetch("/api/session", { method: "POST" })
      .then((res) => parseJsonOrThrow<SessionState>(res))
      .then((s) => {
        setSession(s);
        setSessionError(null);
      })
      .catch((err) => setSessionError(err instanceof Error ? err.message : String(err)));
  }, []);

  const handleEvent = useCallback((evt: BidStreamEvent) => {
    const at = Date.now();
    switch (evt.type) {
      case "bid.received":
        dispatch({ type: "bid.received", taskId: evt.taskId, bid: evt.bid, at });
        break;
      case "bid.excluded":
        dispatch({ type: "bid.excluded", taskId: evt.taskId, excluded: evt.excluded, at });
        break;
      case "decision.made":
        dispatch({ type: "decision.made", taskId: evt.taskId, decision: evt.decision, at });
        setLiveMessage(`${titleCaseId(evt.decision.winner.industryId)} agent won the auction`);
        break;
      case "settlement.started":
        dispatch({
          type: "settlement.started",
          taskId: evt.taskId,
          providerId: evt.providerId,
          industryId: evt.industryId,
          at,
        });
        break;
      case "settlement.fallback":
        dispatch({ type: "settlement.fallback", taskId: evt.taskId, reason: evt.reason, at });
        break;
      case "settlement.confirmed":
        dispatch({ type: "settlement.confirmed", taskId: evt.taskId, settlement: evt.settlement, at });
        setSettlements((prev) => [evt.settlement, ...prev]);
        // The server only publishes session.* when the status changes to
        // warning or paused, so without this the spend bar reads $0.00 for
        // an entire demo. A resync corrects any drift.
        setSession((prev) => (prev ? { ...prev, spentUsd: prev.spentUsd + evt.settlement.amountUsd } : prev));
        setLiveMessage(`Settled on XRPL to the ${titleCaseId(evt.settlement.industryId)} agent`);
        break;
      case "task.completed":
        dispatch({ type: "task.completed", taskId: evt.taskId, output: evt.output, at });
        setLiveMessage("Answer received");
        break;
      case "task.rejected":
        dispatch({ type: "task.rejected", taskId: evt.taskId, reason: evt.reason, at });
        setLiveMessage(`Task rejected: ${evt.reason}`);
        break;
      case "task.failed":
        dispatch({ type: "task.failed", taskId: evt.taskId, reason: evt.reason, at });
        setLiveMessage(`Task failed: ${evt.reason}`);
        break;
      case "session.warning":
      case "session.paused":
      case "session.resumed":
        setSession(evt.session);
        break;
    }
  }, []);

  const sessionId = session?.sessionId ?? null;

  /**
   * Repairs what a reconnect gap can lose. The stream has no replay, so an
   * in-flight round's bids are unrecoverable — this restores only the state
   * that has a GET endpoint.
   */
  const resync = useCallback(() => {
    if (!sessionId) return;
    fetch(`/api/session/${sessionId}`)
      .then((res) => parseJsonOrThrow<{ session: SessionState; settlements: SettlementRecord[] }>(res))
      .then(({ session: s, settlements: list }) => {
        setSession(s);
        setSettlements([...list].reverse());
      })
      .catch(() => {
        // a failed resync is not worth surfacing; the stream is already back
      });
  }, [sessionId]);

  const sseStatus = useSSE(
    "/api/events",
    (evt) => {
      if (sessionId && evt.sessionId === sessionId) handleEvent(evt);
    },
    resync,
  );

  const handleResume = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/session/${sessionId}/resume`, { method: "POST" });
      setSession(await parseJsonOrThrow<SessionState>(res));
      setSessionError(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  const handleSubmitted = useCallback(
    (task: { taskId: string; prompt: string; complexityHint: "simple" | "standard" | "complex"; budgetUsd: number }) => {
      dispatch({ type: "task.submitted", ...task, at: Date.now() });
      setLiveMessage("Task submitted, auction open");
    },
    [],
  );

  const orderedRounds = useMemo(() => rounds.order.map((id) => rounds.byId[id]), [rounds]);
  const latestMemo = settlements[0]?.memo ?? null;

  // Exactly one round is open at a time; the rest collapse to pills.
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const newestTaskId = rounds.order[0] ?? null;

  // Keyed on the newest id, not on `rounds` — keying on the object would re-fire
  // on every incoming bid and settlement event and fight the user's clicks.
  useEffect(() => {
    if (newestTaskId) setExpandedTaskId(newestTaskId);
  }, [newestTaskId]);

  // The settlement rail links back with #round-<taskId>. Without this, those
  // links land on a collapsed pill and dead-end.
  useEffect(() => {
    function expandFromHash() {
      const match = /^#round-(.+)$/.exec(window.location.hash);
      if (match) setExpandedTaskId(match[1]);
    }
    window.addEventListener("hashchange", expandFromHash);
    return () => window.removeEventListener("hashchange", expandFromHash);
  }, []);

  const toggleRound = useCallback((taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  }, []);

  return (
    <>
      <header className="app-head">
        <div className="app-head-main">
          <h1>BidStream</h1>
          <p className="tagline">{TAGLINE}</p>
        </div>
        <div className="app-head-actions">
          <ConnectionPill status={sseStatus} />
          <Link className="btn-ghost" href="/history">
            History
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {sessionError ? (
        <section className="banner banner-danger" role="alert">
          <p className="banner-title">
            <AlertIcon size={16} />
            Session error
          </p>
          <p className="banner-body">{sessionError}</p>
        </section>
      ) : null}

      <div className="layout">
        <main id="main">
          <TaskForm sessionId={sessionId} sseStatus={sseStatus} onSubmitted={handleSubmitted} />

          <section className="rounds" aria-label="Auction rounds">
            {orderedRounds.length === 0 ? (
              <EmptyState
                title="No auctions yet"
                hint={`Submit a task and all ${INDUSTRY_AGENT_IDS.length} industry agents will bid on it in parallel.`}
              />
            ) : (
              orderedRounds.map((round) => (
                <RoundCard
                  key={round.taskId}
                  round={round}
                  expanded={round.taskId === expandedTaskId}
                  onToggle={() => toggleRound(round.taskId)}
                />
              ))
            )}
          </section>
        </main>

        <aside className="rail" aria-label="Session and ledger">
          <SessionBar session={session} onResume={handleResume} />
          <MemoView memo={latestMemo} settlement={settlements[0] ?? null} />
          <SettlementFeed settlements={settlements} />
        </aside>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
    </>
  );
}
