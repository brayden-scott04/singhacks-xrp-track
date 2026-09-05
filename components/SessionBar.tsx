"use client";

import type { SessionState } from "@/lib/shared/types";

function fmtUsd(n: number): string {
  return n.toFixed(6);
}

export function SessionBar({ session, onResume }: { session: SessionState | null; onResume: () => void }) {
  if (!session) {
    return (
      <section id="session-bar" className="panel">
        <div className="spend-row">
          <div className="spend-label">Starting session…</div>
        </div>
      </section>
    );
  }

  const pct = Math.min(100, (session.spentUsd / session.capUsd) * 100);
  const statusClass = session.status !== "active" ? session.status : "";

  return (
    <section id="session-bar" className="panel">
      <div className="spend-row">
        <div className="spend-label">
          Session <code>{session.sessionId.slice(0, 8)}</code>
          <span className={`badge ${statusClass}`}>{session.status}</span>
        </div>
        <div className="spend-amount">
          ${fmtUsd(session.spentUsd)} / ${session.capUsd.toFixed(2)}
        </div>
      </div>
      <div className="spend-bar">
        <div className={`spend-fill ${statusClass}`} style={{ width: `${pct}%` }} />
      </div>
      {session.status === "paused" && (
        <button id="resume-btn" onClick={onResume}>
          Resume session
        </button>
      )}
    </section>
  );
}
