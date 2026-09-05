"use client";

import { useEffect, useState } from "react";
import type { SessionState } from "@/lib/shared/types";
import { fmtClock, fmtRelative, fmtUsdMicro, fmtPct, shortId } from "./format";
import { CopyButton, Skeleton } from "./ui";

const WARNING_RATIO = 0.9;

export function SessionBar({ session, onResume }: { session: SessionState | null; onResume: () => void }) {
  // Relative time is computed after mount only: rendering it during SSR
  // produces a value the client immediately disagrees with.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!session) {
    return (
      <section className="panel session-bar" aria-busy="true">
        <h2>Session</h2>
        <Skeleton height={18} />
        <div style={{ height: 8 }} />
        <Skeleton height={8} />
      </section>
    );
  }

  const { capUsd, spentUsd, status } = session;
  const pct = capUsd > 0 ? Math.min(100, (spentUsd / capUsd) * 100) : 0;
  const remaining = Math.max(0, capUsd - spentUsd);
  const statusClass = status !== "active" ? status : "";

  return (
    <section className="panel session-bar" data-status={status}>
      <h2>Session</h2>

      <div className="spend-row">
        <div className="spend-label">
          <span className="mono">{shortId(session.sessionId)}</span>
          <CopyButton value={session.sessionId} label="Copy session ID" />
          <span className={`badge ${statusClass}`}>{status}</span>
        </div>
        <div className="spend-amount mono">{fmtUsdMicro(spentUsd)}</div>
      </div>

      <div
        className="spend-bar"
        role="progressbar"
        aria-label="Session spend against cap"
        aria-valuemin={0}
        aria-valuemax={capUsd}
        aria-valuenow={spentUsd}
        aria-valuetext={`${fmtUsdMicro(spentUsd)} of ${fmtUsdMicro(capUsd)} spent (${fmtPct(pct / 100)})`}
      >
        <div className={`spend-fill ${statusClass}`} style={{ width: `${pct}%` }} />
        <span className="spend-tick" style={{ left: `${WARNING_RATIO * 100}%` }} aria-hidden="true" />
      </div>

      <dl className="kv session-kv">
        <div>
          <dt>Cap</dt>
          <dd className="mono">{fmtUsdMicro(capUsd)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd className="mono">{fmtUsdMicro(remaining)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd className="mono">
            {fmtClock(session.createdAt)}
            {now !== null ? <span className="dim"> · {fmtRelative(new Date(session.createdAt).getTime(), now)}</span> : null}
          </dd>
        </div>
      </dl>

      {status === "paused" ? (
        <>
          <p id="pause-explainer" className="field-hint warn-hint">
            The spend cap was reached. No further task will settle until the session is resumed.
          </p>
          <button id="resume-btn" type="button" onClick={onResume} aria-describedby="pause-explainer">
            Resume session
          </button>
        </>
      ) : null}
    </section>
  );
}
