"use client";

import { useEffect, useState } from "react";
import { fmtDuration, fmtPricePerToken, fmtScore, fmtTokens, fmtUsdMicro, shortId } from "./format";
import { BanIcon, CheckIcon, DotIcon, IndustryIcon, XIcon } from "./icons";
import { Disclosure, Pill, Skeleton, type PillTone } from "./ui";
import { selectRanked, type BidOutcome, type Round, type RoundBid } from "./roundsReducer";

const OUTCOME: Record<BidOutcome, { label: string; tone: PillTone; icon: typeof CheckIcon }> = {
  pending: { label: "Bidding", tone: "neutral", icon: DotIcon },
  bid: { label: "Bid placed", tone: "neutral", icon: DotIcon },
  considered: { label: "Considered", tone: "neutral", icon: DotIcon },
  won: { label: "Won", tone: "accent", icon: CheckIcon },
  "rejected-budget": { label: "Over budget", tone: "warn", icon: BanIcon },
  excluded: { label: "No bid", tone: "danger", icon: XIcon },
};

/** Live countdown on the 30s quote TTL — the bid is only binding until then. */
function QuoteExpiry({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    if (Number.isNaN(target)) return;
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  // null until mounted, so the server and first client render agree
  if (remaining === null) return null;
  if (remaining <= 0) return <span className="bid-expiry expired">quote expired</span>;
  return <span className="bid-expiry">expires in {Math.ceil(remaining / 1000)}s</span>;
}

function BidDetails({ entry }: { entry: RoundBid }) {
  const b = entry.bid;
  if (!b) return null;
  return (
    <Disclosure summary="Quote details">
      <p className="bid-justification">{b.qualityJustification}</p>
      <dl className="kv">
        <div>
          <dt>Input price</dt>
          <dd className="mono">{fmtPricePerToken(b.pricePerInputTokenUsd)}</dd>
        </div>
        <div>
          <dt>Output price</dt>
          <dd className="mono">{fmtPricePerToken(b.pricePerOutputTokenUsd)}</dd>
        </div>
        <div>
          <dt>Est. tokens</dt>
          <dd className="mono">
            {fmtTokens(b.estimatedInputTokens)} in / {fmtTokens(b.estimatedOutputTokens)} out
          </dd>
        </div>
        <div>
          <dt>Context window</dt>
          <dd className="mono">{fmtTokens(b.contextWindowTokens)}</dd>
        </div>
        <div>
          <dt>Error rate</dt>
          <dd className="mono">{b.errorRatePct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Quote ID</dt>
          <dd className="mono">{shortId(b.quoteId)}</dd>
        </div>
      </dl>
    </Disclosure>
  );
}

function BidRow({ entry }: { entry: RoundBid }) {
  const meta = OUTCOME[entry.outcome];
  const Icon = meta.icon;
  const b = entry.bid;

  return (
    <li className="bid-item" data-outcome={entry.outcome}>
      <div className="bid-main">
        <span className="bid-identity">
          <IndustryIcon industryId={entry.industryId} size={16} />
          <span className="bid-industry">{entry.industryId}</span>
          {b ? <span className="bid-model mono">{b.modelId}</span> : null}
        </span>

        <span className="bid-figures">
          {b ? <span className="bid-price mono">{fmtUsdMicro(b.estimatedTotalCostUsd)}</span> : <Skeleton width="76px" />}
          {entry.scored ? <span className="bid-composite mono">{fmtScore(entry.scored.compositeScore)}</span> : null}
          <Pill tone={meta.tone} icon={Icon}>
            {meta.label}
          </Pill>
        </span>
      </div>

      <div className="bid-sub">
        {entry.scored ? <span>rank {entry.scored.rank}</span> : null}
        {entry.latencyMs !== undefined ? <span>{fmtDuration(entry.latencyMs)}</span> : null}
        {b ? <QuoteExpiry expiresAt={b.expiresAt} /> : null}
        {entry.excludedReason ? <span className="bid-reason">{entry.excludedReason}</span> : null}
      </div>

      {b ? <BidDetails entry={entry} /> : null}
    </li>
  );
}

export function BidFeed({ round }: { round: Round }) {
  const ranked = selectRanked(round);
  const anyExcluded = ranked.some((b) => b.outcome === "excluded");
  const anyRejected = ranked.some((b) => b.outcome === "rejected-budget");

  return (
    <div className="bid-feed">
      <ul className="bid-list" role="list">
        {ranked.map((entry) => (
          <BidRow key={entry.industryId} entry={entry} />
        ))}
      </ul>

      {anyExcluded || anyRejected ? (
        <p className="legend">
          {anyExcluded ? <span>No bid means the agent errored or timed out, so it sat this round out.</span> : null}
          {anyRejected ? (
            <span>Over budget means the bid came in above what was left of the budget, so it could not win.</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
