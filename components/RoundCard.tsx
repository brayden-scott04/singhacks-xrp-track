"use client";

import { fmtUsdAuto } from "./format";
import { AlertIcon, SpinnerIcon } from "./icons";
import { BidFeed } from "./BidFeed";
import type { Round, RoundPhase } from "./roundsReducer";

const PHASES: Array<{ key: RoundPhase; label: string }> = [
  { key: "bidding", label: "Bidding" },
  { key: "executing", label: "Deciding" },
  { key: "settling", label: "Settling" },
  { key: "settled", label: "Settled" },
];

const PHASE_INDEX: Record<RoundPhase, number> = {
  bidding: 0,
  deciding: 0,
  executing: 1,
  settling: 2,
  settled: 3,
  rejected: 3,
  failed: 3,
};

function PhaseStepper({ phase }: { phase: RoundPhase }) {
  const current = PHASE_INDEX[phase];
  const terminal = phase === "failed" || phase === "rejected";

  return (
    <ol className="stepper" role="list" aria-label={`Round progress: ${phase}`}>
      {PHASES.map((step, i) => {
        const state = i < current ? "done" : i === current ? (terminal ? "failed" : "active") : "todo";
        return (
          <li key={step.key} className="stepper-step" data-state={state}>
            <span className="stepper-dot" aria-hidden="true" />
            <span className="stepper-label">{terminal && i === current ? phase : step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function RoundCard({ round }: { round: Round }) {
  const busy = round.phase === "bidding" || round.phase === "executing" || round.phase === "settling";

  return (
    <article className="panel round-card" id={`round-${round.taskId}`} aria-busy={busy}>
      <header className="round-head">
        <div className="round-head-main">
          <p className="round-prompt">{round.prompt || "Task submitted from another client"}</p>
          <p className="round-meta">
            {round.budgetUsd !== null ? <span>budget {fmtUsdAuto(round.budgetUsd)}</span> : null}
            {round.complexityHint ? <span>{round.complexityHint}</span> : null}
            {busy ? (
              <span className="round-busy">
                <SpinnerIcon size={12} /> running
              </span>
            ) : null}
          </p>
        </div>
        <PhaseStepper phase={round.phase} />
      </header>

      <BidFeed round={round} />

      {round.notes.length > 0 ? (
        <ul className="notes" role="list">
          {round.notes.map((note, i) => (
            <li key={i} className="note" data-kind={note.kind}>
              <AlertIcon size={14} />
              <span>{note.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
