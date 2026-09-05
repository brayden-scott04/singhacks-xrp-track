"use client";

import { fmtDrops, fmtUsdAuto, fmtUsdMicro, shortHash } from "./format";
import { AlertIcon, ChevronIcon, CoinsIcon, IndustryIcon, LinkIcon, SpinnerIcon } from "./icons";
import { Pill } from "./ui";
import { BidFeed } from "./BidFeed";
import { DecisionPanel } from "./DecisionPanel";
import { AnswerPanel } from "./AnswerPanel";
import { selectWinner, type Round, type RoundPhase } from "./roundsReducer";

const PHASES: Array<{ key: RoundPhase; label: string }> = [
  { key: "bidding", label: "Bidding" },
  { key: "executing", label: "Deciding" },
  { key: "settling", label: "Settling" },
  { key: "settled", label: "Settled" },
];

const PHASE_LABEL: Record<RoundPhase, string> = {
  bidding: "Bidding",
  deciding: "Deciding",
  executing: "Deciding",
  settling: "Settling",
  settled: "Settled",
  rejected: "Rejected",
  failed: "Failed",
};

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
    <ol className="stepper" role="list" aria-label={`Round progress: ${PHASE_LABEL[phase]}`}>
      {PHASES.map((step, i) => {
        const state = i < current ? "done" : i === current ? (terminal ? "failed" : "active") : "todo";
        return (
          <li key={step.key} className="stepper-step" data-state={state}>
            <span className="stepper-dot" aria-hidden="true" />
            <span className="stepper-label">{terminal && i === current ? PHASE_LABEL[phase] : step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SettlementStrip({ round }: { round: Round }) {
  const s = round.settlement;
  if (!s) return null;
  const isFallback = s.mode === "payment" && Boolean(s.fallbackReason);

  return (
    <div className="settle-strip">
      <Pill tone={isFallback ? "warn" : "accent"} icon={CoinsIcon}>
        {isFallback ? "payment · fallback" : s.mode}
      </Pill>
      <span className="mono settle-amount">{fmtUsdMicro(s.amountUsd)}</span>
      <span className="mono dim">{fmtDrops(s.amountDrops)}</span>
      <a
        href={s.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View transaction ${s.txHash} on the XRPL testnet explorer`}
      >
        <LinkIcon size={12} />
        <span className="mono">{shortHash(s.txHash)}</span>
      </a>
    </div>
  );
}

function isBusy(phase: RoundPhase): boolean {
  return phase === "bidding" || phase === "executing" || phase === "settling";
}

const PROMPT_FALLBACK = "Task submitted from another client";

/**
 * The collapsed form of a round: one line carrying just enough to tell rounds
 * apart. Keeps the `round-<taskId>` id so the settlement rail's backlinks
 * still resolve when their round is collapsed.
 */
function RoundPill({ round, onExpand }: { round: Round; onExpand: () => void }) {
  const winner = selectWinner(round);
  const busy = isBusy(round.phase);
  const failed = round.phase === "failed" || round.phase === "rejected";

  return (
    <button
      type="button"
      className="round-pill"
      id={`round-${round.taskId}`}
      data-phase={round.phase}
      aria-expanded={false}
      aria-controls={`round-body-${round.taskId}`}
      onClick={onExpand}
    >
      {failed ? (
        <span className="round-pill-status">
          <AlertIcon size={14} />
          {PHASE_LABEL[round.phase]}
        </span>
      ) : winner ? (
        <span className="round-pill-winner">
          <IndustryIcon industryId={winner.industryId} size={14} />
          {winner.industryId}
        </span>
      ) : (
        <span className="round-pill-winner dim">
          <SpinnerIcon size={14} />
          Bidding
        </span>
      )}

      {busy ? (
        <span className="round-pill-amount dim">
          <SpinnerIcon size={12} />
        </span>
      ) : round.settlement ? (
        <span className="round-pill-amount mono">{fmtUsdMicro(round.settlement.amountUsd)}</span>
      ) : null}

      <span className="round-pill-prompt">{round.prompt || PROMPT_FALLBACK}</span>

      <ChevronIcon size={14} className="round-pill-chevron" />
    </button>
  );
}

export function RoundCard({
  round,
  expanded,
  onToggle,
}: {
  round: Round;
  expanded: boolean;
  onToggle: () => void;
}) {
  const busy = isBusy(round.phase);

  if (!expanded) return <RoundPill round={round} onExpand={onToggle} />;

  return (
    <article className="panel round-card" id={`round-${round.taskId}`} aria-busy={busy}>
      <button
        type="button"
        className="round-toggle"
        aria-expanded={true}
        aria-controls={`round-body-${round.taskId}`}
        onClick={onToggle}
      >
        <header className="round-head">
          <div className="round-head-main">
            <p className="round-prompt">{round.prompt || PROMPT_FALLBACK}</p>
            <p className="round-meta">
              {round.budgetUsd !== null ? <span>budget {fmtUsdAuto(round.budgetUsd)}</span> : null}
              {round.complexityHint ? <span className="capitalise">{round.complexityHint}</span> : null}
              {busy ? (
                <span className="round-busy">
                  <SpinnerIcon size={12} /> running
                </span>
              ) : null}
            </p>
          </div>
          <PhaseStepper phase={round.phase} />
          <ChevronIcon size={16} className="round-pill-chevron open" />
        </header>
      </button>

      <div id={`round-body-${round.taskId}`}>
        <BidFeed round={round} />

        <DecisionPanel round={round} />

        <SettlementStrip round={round} />

        <AnswerPanel round={round} />

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
      </div>
    </article>
  );
}
