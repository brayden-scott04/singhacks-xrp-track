import type { SessionState } from "../../shared/types";

const WARNING_THRESHOLD_RATIO = 0.9;

export function isPaused(session: SessionState): boolean {
  return session.status === "paused";
}

/** Would this settlement amount push the session over its cap? */
export function wouldExceedCap(session: SessionState, amountUsd: number): boolean {
  return session.spentUsd + amountUsd > session.capUsd;
}

/** Applies a confirmed settlement to the session and recomputes status. Mutates and returns the session. */
export function applySpend(session: SessionState, amountUsd: number): SessionState {
  session.spentUsd += amountUsd;
  if (session.spentUsd >= session.capUsd) {
    session.status = "paused";
  } else if (session.spentUsd >= session.capUsd * WARNING_THRESHOLD_RATIO) {
    session.status = "warning";
  }
  return session;
}

/** Explicit resume, optionally raising the cap. Required after a pause — never auto-resumes. */
export function resumeSession(session: SessionState, newCapUsd?: number): SessionState {
  if (newCapUsd !== undefined) {
    session.capUsd = newCapUsd;
  }
  session.status = session.spentUsd >= session.capUsd * WARNING_THRESHOLD_RATIO ? "warning" : "active";
  return session;
}
