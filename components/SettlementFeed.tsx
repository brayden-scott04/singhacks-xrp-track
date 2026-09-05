"use client";

import type { SettlementRecord } from "@/lib/shared/types";

function fmtUsd(n: number): string {
  return n.toFixed(6);
}

export function SettlementFeed({ settlements }: { settlements: SettlementRecord[] }) {
  return (
    <section className="panel" id="payments-panel">
      <h2>Settlements</h2>
      <div id="payment-feed" className="feed">
        {settlements.length === 0 && <p className="empty">No settlements yet.</p>}
        {settlements.map((s, i) => (
          <div key={i} className={`payment-row${s.mode === "payment" && s.fallbackReason ? " fallback" : ""}`}>
            <strong>{s.industryId}</strong> ({s.providerId}) via {s.mode}
            {s.fallbackReason ? " (fallback)" : ""} — ${fmtUsd(s.amountUsd)} —{" "}
            <a href={s.explorerUrl} target="_blank" rel="noopener noreferrer">
              {s.txHash.slice(0, 12)}…
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
