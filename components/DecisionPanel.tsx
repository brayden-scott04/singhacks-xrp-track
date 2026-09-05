"use client";

import { fmtScore, fmtUsdMicro } from "./format";
import { BoltIcon, CheckIcon, IndustryIcon, InfoIcon } from "./icons";
import { Disclosure, Pill } from "./ui";
import { ContributionBar, FactorMatrix, FactorStack } from "./FactorBars";
import { DEFAULT_FACTOR_WEIGHTS, FACTOR_LABEL, FACTOR_ORDER, selectScoredBids, selectWinner, type Round } from "./roundsReducer";

export function DecisionPanel({ round }: { round: Round }) {
  const decision = round.decision;
  if (!decision) return null;

  const winner = selectWinner(round);
  const scored = selectScoredBids(round);

  return (
    <section className="decision" aria-label="Auction decision">
      <div className="verdict">
        <p className="verdict-line">
          <CheckIcon size={18} />
          <IndustryIcon industryId={decision.winnerIndustryId} size={18} />
          <strong className="verdict-agent">{decision.winnerIndustryId}</strong>
          <span>wins</span>
          {winner?.bid ? <span className="mono verdict-price">{fmtUsdMicro(winner.bid.estimatedTotalCostUsd)}</span> : null}
          <span className="mono verdict-score">composite {fmtScore(decision.score)}</span>
        </p>

        {decision.overrodePrior ? (
          <Pill tone="info" icon={BoltIcon} title="The decision agent picked someone other than the top-scoring agent">
            Override: the score ranked {decision.priorTopIndustryId} first
          </Pill>
        ) : (
          <Pill tone="neutral" icon={CheckIcon}>
            Agreed with the score
          </Pill>
        )}
      </div>

      {/* The reason string lives only in the sidebar memo. It is the same
          text as memo.winningReason, so showing it here too was noise. */}
      {winner?.scored ? <ContributionBar factorScores={winner.scored.factorScores} /> : null}

      <div className="matrix-only-wide">
        <FactorMatrix bids={scored} winnerIndustryId={decision.winnerIndustryId} />
      </div>
      <div className="matrix-only-narrow">
        <FactorStack bids={scored} winnerIndustryId={decision.winnerIndustryId} />
      </div>

      <Disclosure summary="How the score is worked out">
        <p>
          Every bid gets seven scores from 0 to 1, where higher is always better. Those are weighted and added
          into one composite score. The composite is only a starting point: the decision agent also reads the task
          itself, and can pick someone else.
        </p>
        <ul className="weight-list" role="list">
          {FACTOR_ORDER.map((key) => (
            <li key={key}>
              <span>{FACTOR_LABEL[key]}</span>
              <span className="mono">{DEFAULT_FACTOR_WEIGHTS[key].toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p className="field-hint">
          <InfoIcon size={12} /> Price is scored against the most expensive bid in the round, so the priciest
          bidder always scores 0. Context works the same way, against the largest window.
        </p>
      </Disclosure>
    </section>
  );
}
