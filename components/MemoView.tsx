"use client";

import type { MemoPayload, SettlementRecord } from "@/lib/shared/types";
import { fmtPricePerToken, fmtScore, fmtUsdMicro, shortHash, shortId } from "./format";
import { IndustryIcon, LinkIcon } from "./icons";
import { CopyButton, Disclosure, EmptyState, Meter, Pill } from "./ui";
import { ContributionBar } from "./FactorBars";

/**
 * The audit memo is the product's headline claim — every payment carries a
 * decodable reason. It was previously a JSON.stringify dump, which proves
 * the bytes exist but communicates nothing. The JSON is kept, demoted to a
 * disclosure, so the proof is still one click away.
 *
 * These two constants mirror lib/shared/memo.ts. They are retyped rather
 * than imported: that module uses Buffer and cannot enter a client bundle.
 */
const MEMO_TYPE = "bidstream/audit-v1";
const MEMO_FORMAT = "application/json";

export function MemoView({ memo, settlement }: { memo: MemoPayload | null; settlement?: SettlementRecord | null }) {
  return (
    <section className="panel memo" id="memo-panel">
      <h2>Audit memo · written on-chain</h2>

      {!memo ? (
        <EmptyState
          title="No memo yet"
          hint="Every settlement carries a memo recording which agent won, what it bid, and why."
        />
      ) : (
        <>
          <div className="memo-chips">
            <Pill tone="neutral">{MEMO_TYPE}</Pill>
            <Pill tone="neutral">{MEMO_FORMAT}</Pill>
          </div>

          <div className="memo-strip">
            <span className="memo-agent">
              <IndustryIcon industryId={memo.industryId} size={16} />
              <strong>{memo.industryId}</strong>
              <span className="dim mono">{memo.providerId}</span>
            </span>
            {settlement ? (
              <a
                href={settlement.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View transaction ${settlement.txHash} on the XRPL testnet explorer`}
              >
                <LinkIcon size={12} />
                <span className="mono">{shortHash(settlement.txHash)}</span>
              </a>
            ) : null}
          </div>

          <blockquote className="memo-reason">{memo.winningReason}</blockquote>

          <ContributionBar factorScores={memo.factorScores} />

          <dl className="kv memo-kv">
            <div>
              <dt>Bid total</dt>
              <dd className="mono">{fmtUsdMicro(memo.bidTotalCostUsd)}</dd>
            </div>
            <div>
              <dt>Composite</dt>
              <dd className="mono">{fmtScore(memo.compositeScore)}</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd className="mono">{fmtScore(memo.qualityScore)}</dd>
            </div>
            <div>
              <dt>Input price</dt>
              <dd className="mono">{fmtPricePerToken(memo.bidPricePerInputTokenUsd)}</dd>
            </div>
            <div>
              <dt>Output price</dt>
              <dd className="mono">{fmtPricePerToken(memo.bidPricePerOutputTokenUsd)}</dd>
            </div>
            <div>
              <dt>Task ID</dt>
              <dd className="mono">{shortId(memo.taskId)}</dd>
            </div>
          </dl>

          <div className="memo-complexity">
            <span className="memo-complexity-label">Task complexity</span>
            <Meter value={memo.taskComplexityScore} label="Task complexity score" tone="muted" />
            <span className="mono">{fmtScore(memo.taskComplexityScore)}</span>
          </div>

          <Disclosure summary="Raw memo JSON, as encoded on-chain">
            <div className="memo-raw-head">
              <CopyButton value={JSON.stringify(memo, null, 2)} label="Copy memo JSON" />
            </div>
            <pre id="memo-view">{JSON.stringify(memo, null, 2)}</pre>
          </Disclosure>
        </>
      )}
    </section>
  );
}
