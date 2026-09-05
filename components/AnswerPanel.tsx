"use client";

import { useMemo, useState } from "react";
import { detectOutputFile } from "@/lib/shared/outputFile";
import { countWords, fmtDuration, fmtUsdMicro, shortHash } from "./format";
import { IndustryIcon, LinkIcon, SpinnerIcon } from "./icons";
import { CopyButton, DownloadButton, Skeleton } from "./ui";
import { selectWinner, type Round } from "./roundsReducer";

/**
 * The output of the task the user actually paid for. The previous dashboard
 * never handled task.completed at all, so this — the delivered product —
 * was invisible.
 */
export function AnswerPanel({ round }: { round: Round }) {
  const [expanded, setExpanded] = useState(false);
  const winner = selectWinner(round);
  const settlement = round.settlement;
  const file = useMemo(
    () => (round.output ? detectOutputFile(round.prompt, round.output) : null),
    [round.prompt, round.output],
  );

  const waiting = round.phase === "executing" || round.phase === "settling";

  if (!round.output && !waiting) return null;

  if (!round.output) {
    return (
      <section className="answer" aria-label="Answer" aria-busy="true">
        <p className="answer-head">
          <SpinnerIcon size={14} />
          <span>
            {winner ? <strong className="answer-agent">{winner.industryId}</strong> : "The winning agent"} is running the
            task…
          </span>
        </p>
        <div className="answer-skeleton">
          <Skeleton height={12} />
          <Skeleton height={12} width="92%" />
          <Skeleton height={12} width="74%" />
        </div>
      </section>
    );
  }

  const words = countWords(round.output);
  const elapsed =
    round.completedAt !== undefined && round.submittedAt !== undefined ? round.completedAt - round.submittedAt : null;

  return (
    <section className="answer" aria-label="Answer">
      <div className="answer-head">
        <span className="answer-head-main">
          {winner ? <IndustryIcon industryId={winner.industryId} size={16} /> : null}
          <span>
            Answer delivered by <strong className="answer-agent">{winner?.industryId ?? "the winning agent"}</strong>
            {winner?.bid ? <span className="mono dim"> {winner.bid.modelId}</span> : null}
          </span>
        </span>
        <span className="answer-head-meta">
          {settlement ? <span className="mono">paid {fmtUsdMicro(settlement.amountUsd)}</span> : null}
          {settlement ? (
            <a href={settlement.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="View settlement on the XRPL testnet explorer">
              <LinkIcon size={12} />
              <span className="mono">{shortHash(settlement.txHash, 6, 4)}</span>
            </a>
          ) : null}
          <CopyButton value={round.output} label="Copy answer" />
          {file ? <DownloadButton filename={file.filename} content={file.content} label={`Download ${file.filename}`} /> : null}
        </span>
      </div>

      <div className={`answer-body${expanded ? " expanded" : ""}`}>{round.output}</div>

      <p className="answer-foot">
        <button type="button" className="btn-ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Collapse" : "Show all"}
        </button>
        <span className="dim">
          {words} words{elapsed !== null ? ` · ${fmtDuration(elapsed)} end to end` : ""}
        </span>
      </p>
    </section>
  );
}
