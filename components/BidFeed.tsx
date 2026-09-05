"use client";

import { fmtScore, fmtUsd } from "@/lib/shared/format";

export type BidStatus = "pending" | "winner" | "excluded" | "rejected";

export interface BidRow {
  industryId: string;
  providerId?: string;
  modelId?: string;
  estimatedTotalCostUsd?: number;
  qualityScore?: number;
  knowledgeScore?: number;
  speedScore?: number;
  loadScore?: number;
  errorRatePct?: number;
  contextWindowTokens?: number;
  status: BidStatus;
  excludedReason?: string;
}

export interface Round {
  taskId: string;
  title: string;
  rows: BidRow[];
}

export function BidFeed({ rounds }: { rounds: Round[] }) {
  return (
    <section className="panel" id="bids-panel">
      <h2>Industry agent bids</h2>
      <div id="bid-feed" className="feed">
        {rounds.length === 0 && <p className="empty">Submit a task to see industry agents bid.</p>}
        {rounds.map((round) => (
          <div className="bid-round" key={round.taskId}>
            <div className="bid-round-title">{round.title}</div>
            <div className="bid-table" role="table">
              <div className="bid-table-header" role="row">
                <span>Industry</span>
                <span>Provider / Model</span>
                <span className="num">Price</span>
                <span className="num">Quality</span>
                <span className="num">Knowledge</span>
                <span className="num">Speed</span>
                <span className="num">Load</span>
                <span className="num">Error %</span>
                <span className="num">Context</span>
              </div>
              {round.rows.map((row, i) =>
                row.status === "excluded" ? (
                  <div className="bid-table-row excluded" role="row" key={i}>
                    <span className="bid-industry">{row.industryId}</span>
                    <span className="bid-excluded-reason">excluded — {row.excludedReason}</span>
                  </div>
                ) : (
                  <div
                    className={`bid-table-row${row.status === "winner" ? " winner" : ""}${row.status === "rejected" ? " rejected" : ""}`}
                    role="row"
                    key={i}
                  >
                    <span className="bid-industry">
                      {row.industryId}
                      {row.status === "winner" && <span className="badge winner-badge">winner</span>}
                      {row.status === "rejected" && <span className="badge rejected-badge">over budget</span>}
                    </span>
                    <span>
                      {row.providerId} / {row.modelId}
                    </span>
                    <span className="num">{row.estimatedTotalCostUsd !== undefined ? fmtUsd(row.estimatedTotalCostUsd) : "—"}</span>
                    <span className="num">{row.qualityScore !== undefined ? fmtScore(row.qualityScore) : "—"}</span>
                    <span className="num">{row.knowledgeScore !== undefined ? fmtScore(row.knowledgeScore) : "—"}</span>
                    <span className="num">{row.speedScore !== undefined ? fmtScore(row.speedScore) : "—"}</span>
                    <span className="num">{row.loadScore !== undefined ? fmtScore(row.loadScore) : "—"}</span>
                    <span className="num">{row.errorRatePct !== undefined ? `${row.errorRatePct.toFixed(1)}%` : "—"}</span>
                    <span className="num">{row.contextWindowTokens !== undefined ? row.contextWindowTokens.toLocaleString() : "—"}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
