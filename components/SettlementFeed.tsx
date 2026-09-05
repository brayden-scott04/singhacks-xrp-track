"use client";

import type { SettlementRecord } from "@/lib/shared/types";
import { dropsToXrp, fmtDrops, fmtUsdMicro, shortHash, shortId } from "./format";
import { CoinsIcon, IndustryIcon, LinkIcon } from "./icons";
import { CopyButton, Disclosure, EmptyState, Pill } from "./ui";

function SettlementRow({ settlement }: { settlement: SettlementRecord }) {
  const isFallback = settlement.mode === "payment" && Boolean(settlement.fallbackReason);

  return (
    <li className="settlement" data-fallback={isFallback}>
      <div className="settlement-main">
        <span className="settlement-agent">
          <IndustryIcon industryId={settlement.industryId} size={15} />
          <span className="settlement-industry">{settlement.industryId}</span>
          <span className="dim mono">{settlement.providerId}</span>
        </span>
        <span className="settlement-amount mono">{fmtUsdMicro(settlement.amountUsd)}</span>
      </div>

      <div className="settlement-sub">
        <Pill tone={isFallback ? "warn" : "accent"} icon={CoinsIcon}>
          {isFallback ? "payment · fallback" : settlement.mode}
        </Pill>
        <span className="mono dim" title={dropsToXrp(settlement.amountDrops)}>
          {fmtDrops(settlement.amountDrops)}
        </span>
        <a
          href={settlement.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View transaction ${settlement.txHash} on the XRPL testnet explorer`}
        >
          <LinkIcon size={12} />
          <span className="mono">{shortHash(settlement.txHash)}</span>
        </a>
        <CopyButton value={settlement.txHash} label="Copy transaction hash" />
        <a className="settlement-backlink" href={`#round-${settlement.taskId}`}>
          round <span className="mono">{shortId(settlement.taskId, 6)}</span>
        </a>
      </div>

      {settlement.fallbackReason ? (
        <Disclosure summary="Why the channel path failed">
          <p className="settlement-fallback-reason mono">{settlement.fallbackReason}</p>
        </Disclosure>
      ) : null}
    </li>
  );
}

export function SettlementFeed({ settlements }: { settlements: SettlementRecord[] }) {
  return (
    <section className="panel settlement-feed">
      <h2>XRPL settlements</h2>

      {settlements.length === 0 ? (
        <EmptyState title="No settlements yet" hint="Each completed auction pays its winner on the XRP Ledger." />
      ) : (
        <ul className="feed" role="list">
          {settlements.map((s) => (
            <SettlementRow key={s.txHash} settlement={s} />
          ))}
        </ul>
      )}

      <p className="legend">
        <span>
          <strong>channel</strong> — an off-chain cumulative claim redeemed on-ledger, the cheap path for repeat
          payments to the same agent.
        </span>
        <span>
          <strong>payment · fallback</strong> — a discrete Payment, used automatically when the channel path throws.
        </span>
      </p>
    </section>
  );
}
