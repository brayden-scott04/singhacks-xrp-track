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
          <Pill tone="info" icon={BoltIcon} title="The decision agent chose against the deterministic ranking">
            LLM override — prior ranked {decision.priorTopIndustryId} #1
          </Pill>
        ) : (
          <Pill tone="neutral" icon={CheckIcon}>
            Agreed with the deterministic prior
          </Pill>
        )}
      </div>

      <blockquote className="verdict-reason">{decision.reason}</blockquote>

      {winner?.scored ? <ContributionBar factorScores={winner.scored.factorScores} /> : null}

      <div className="matrix-only-wide">
        <FactorMatrix bids={scored} winnerIndustryId={decision.winnerIndustryId} />
      </div>
      <div className="matrix-only-narrow">
        <FactorStack bids={scored} winnerIndustryId={decision.winnerIndustryId} />
      </div>

      <Disclosure summary="How the deterministic prior is computed">
        <p>
          Each bid&rsquo;s seven factors are normalised to 0&ndash;1 for the round (higher is always better), then
          blended by fixed weights into a composite. That composite is a <em>prior</em>: the decision agent sees it
          alongside the task text and may override it, as it did whenever the badge above says so.
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
          <InfoIcon size={12} /> Price is scored relative to the round&rsquo;s most expensive bid, so the priciest
          bidder always scores 0 on price. Context is relative to the largest window in the round.
        </p>
      </Disclosure>
    </section>
  );
}
