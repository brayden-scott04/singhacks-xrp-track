"use client";

import { fmtUsd } from "@/lib/shared/format";
import type { SettlementRecord } from "@/lib/shared/types";

export function SettlementFeed({ settlements }: { settlements: SettlementRecord[] }) {
  return (
    <section className="panel" id="payments-panel">
      <h2>Settlements</h2>
      <div id="payment-feed" className="feed">
        {settlements.length === 0 && <p className="empty">No settlements yet.</p>}
        {settlements.map((s, i) => (
          <div key={i} className="settlement-card">
            <div className="settlement-main">
              <span className="settlement-industry">{s.industryId}</span>
              <span className="settlement-provider">{s.providerId}</span>
              <span className={`badge mode-badge ${s.mode}`}>{s.mode}</span>
              {s.fallbackReason && (
                <span className="badge fallback-badge" title={s.fallbackReason}>
                  fallback
                </span>
              )}
            </div>
            <div className="settlement-meta">
              <span className="settlement-amount num">{fmtUsd(s.amountUsd)}</span>
              <a href={s.explorerUrl} target="_blank" rel="noopener noreferrer" className="settlement-link">
                {s.txHash.slice(0, 12)}…
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
