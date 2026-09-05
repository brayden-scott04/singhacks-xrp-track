"use client";

import type { FactorScores, MemoPayload } from "@/lib/shared/types";

const FACTOR_LABELS: Record<keyof FactorScores, string> = {
  price: "Price",
  load: "Load",
  quality: "Quality",
  knowledge: "Knowledge",
  speed: "Speed",
  errorRate: "Error rate",
  contextWindow: "Context window",
};

export function MemoView({ memo }: { memo: MemoPayload | null }) {
  if (!memo) {
    return (
      <section className="panel" id="memo-panel">
        <h2>Latest audit memo</h2>
        <p className="empty">—</p>
      </section>
    );
  }

  return (
    <section className="panel" id="memo-panel">
      <h2>Latest audit memo</h2>
      <dl className="memo-grid">
        <dt>Provider</dt>
        <dd>{memo.providerId}</dd>
        <dt>Industry</dt>
        <dd>{memo.industryId}</dd>
        <dt>Bid price (in / out per token)</dt>
        <dd>
          ${memo.bidPricePerInputTokenUsd.toFixed(8)} / ${memo.bidPricePerOutputTokenUsd.toFixed(8)}
        </dd>
        <dt>Total bid cost</dt>
        <dd>${memo.bidTotalCostUsd.toFixed(6)}</dd>
        <dt>Quality score</dt>
        <dd>{memo.qualityScore.toFixed(2)}</dd>
        <dt>Composite score</dt>
        <dd>{memo.compositeScore.toFixed(2)}</dd>
        <dt>Task complexity</dt>
        <dd>{memo.taskComplexityScore.toFixed(2)}</dd>
        <dt>Task ID</dt>
        <dd>
          <code>{memo.taskId}</code>
        </dd>
      </dl>
      <div className="memo-factors">
        {(Object.keys(memo.factorScores) as (keyof FactorScores)[]).map((key) => (
          <div className="factor-row" key={key}>
            <span className="factor-label">{FACTOR_LABELS[key]}</span>
            <div className="factor-bar">
              <div className="factor-fill" style={{ width: `${memo.factorScores[key] * 100}%` }} />
            </div>
            <span className="factor-value">{memo.factorScores[key].toFixed(2)}</span>
          </div>
        ))}
      </div>
      <p className="memo-reason">{memo.winningReason}</p>
    </section>
  );
}
