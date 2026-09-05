"use client";

import type { FactorScores } from "@/lib/shared/types";
import { fmtScore } from "./format";
import { IndustryIcon } from "./icons";
import { Meter } from "./ui";
import {
  DEFAULT_FACTOR_WEIGHTS,
  FACTOR_HINT,
  FACTOR_LABEL,
  FACTOR_ORDER,
  selectContributions,
  type RoundBid,
} from "./roundsReducer";

/**
 * One 100%-wide bar split into seven segments sized `score x weight`.
 * Because the contributions sum to the composite, the segment widths are a
 * literal decomposition of the score.
 *
 * Colour is one hue in seven opacity steps, not seven categorical colours:
 * this is an ordered decomposition, so a sequential ramp is the correct
 * encoding — and it stays legible on a projector.
 */
export function ContributionBar({ factorScores }: { factorScores: FactorScores }) {
  const contributions = selectContributions(factorScores);
  const total = contributions.reduce((sum, c) => sum + c.contribution, 0);

  return (
    <div className="contrib">
      <div className="contrib-bar" role="img" aria-label={`Score decomposition, composite ${fmtScore(total)}`}>
        {contributions.map((c, i) => (
          <span
            key={c.key}
            className="contrib-seg"
            style={{ flexGrow: Math.max(c.contribution, 0.0001), opacity: 1 - i * 0.11 }}
            title={`${FACTOR_LABEL[c.key]}: ${fmtScore(c.score)} × ${c.weight} = ${c.contribution.toFixed(3)}`}
          />
        ))}
      </div>
      <ol className="contrib-legend" role="list">
        {contributions.slice(0, 3).map((c, i) => (
          <li key={c.key}>
            <span className="contrib-swatch" style={{ opacity: 1 - i * 0.11 }} aria-hidden="true" />
            {FACTOR_LABEL[c.key]} <span className="mono dim">{c.contribution.toFixed(3)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The full scorer's working: agents as columns, factors as rows ordered by
 * weight descending. A real table so it is keyboard-navigable and readable
 * by a screen reader, with no chart dependency.
 */
export function FactorMatrix({ bids, winnerIndustryId }: { bids: RoundBid[]; winnerIndustryId?: string }) {
  const scored = bids.filter((b) => b.scored);
  if (scored.length === 0) return null;

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <caption className="sr-only">
          Deterministic factor scores per industry agent, weighted to a composite score
        </caption>
        <thead>
          <tr>
            <th scope="col">Factor</th>
            {scored.map((b) => (
              <th key={b.industryId} scope="col" data-winner={b.industryId === winnerIndustryId}>
                <span className="matrix-agent">
                  <IndustryIcon industryId={b.industryId} size={14} />
                  {b.industryId}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FACTOR_ORDER.map((key, rowIndex) => (
            <tr key={key}>
              <th scope="row" title={FACTOR_HINT[key]}>
                {FACTOR_LABEL[key]}
                <span className="matrix-weight mono">w {DEFAULT_FACTOR_WEIGHTS[key]}</span>
              </th>
              {scored.map((b) => {
                const v = b.scored!.factorScores[key];
                return (
                  <td key={b.industryId} data-winner={b.industryId === winnerIndustryId}>
                    <Meter value={v} label={`${FACTOR_LABEL[key]} for ${b.industryId}`} delayIndex={rowIndex} />
                    <span className="matrix-value mono">{fmtScore(v)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Composite</th>
            {scored.map((b) => (
              <td key={b.industryId} data-winner={b.industryId === winnerIndustryId}>
                <span className="matrix-composite mono">{fmtScore(b.scored!.compositeScore)}</span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Stacked per-agent cards — the matrix's small-screen equivalent. */
export function FactorStack({ bids, winnerIndustryId }: { bids: RoundBid[]; winnerIndustryId?: string }) {
  const scored = bids.filter((b) => b.scored);
  if (scored.length === 0) return null;

  return (
    <div className="factor-stack">
      {scored.map((b) => (
        <div key={b.industryId} className="factor-card" data-winner={b.industryId === winnerIndustryId}>
          <p className="factor-card-head">
            <span className="matrix-agent">
              <IndustryIcon industryId={b.industryId} size={14} />
              {b.industryId}
            </span>
            <span className="mono">{fmtScore(b.scored!.compositeScore)}</span>
          </p>
          {FACTOR_ORDER.map((key, i) => (
            <div key={key} className="factor-row">
              <span className="factor-row-label">{FACTOR_LABEL[key]}</span>
              <Meter
                value={b.scored!.factorScores[key]}
                label={`${FACTOR_LABEL[key]} for ${b.industryId}`}
                delayIndex={i}
              />
              <span className="mono factor-row-value">{fmtScore(b.scored!.factorScores[key])}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
