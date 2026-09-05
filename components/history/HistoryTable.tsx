"use client";

import { fmtClock, fmtUsdMicro, shortHash } from "../format";
import { BanIcon, CheckIcon, IndustryIcon, LinkIcon, XIcon } from "../icons";
import { EmptyState, Pill, type PillTone } from "../ui";
import type { TaskHistoryListItem, TaskHistoryStatus } from "@/lib/shared/historyTypes";

export type SortKey = "createdAt" | "cost";
export type SortDir = "asc" | "desc";

const STATUS: Record<TaskHistoryStatus, { tone: PillTone; icon: typeof CheckIcon }> = {
  completed: { tone: "accent", icon: CheckIcon },
  rejected: { tone: "warn", icon: BanIcon },
  failed: { tone: "danger", icon: XIcon },
};

type Props = {
  rows: TaskHistoryListItem[];
  total: number;
  limit: number;
  offset: number;
  selectedTaskId: string | null;
  sortKey: SortKey;
  sortDir: SortDir;
  onSelect: (taskId: string) => void;
  onSort: (key: SortKey) => void;
  onPageChange: (offset: number) => void;
};

function ariaSort(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function HistoryTable({
  rows,
  total,
  limit,
  offset,
  selectedTaskId,
  sortKey,
  sortDir,
  onSelect,
  onSort,
  onPageChange,
}: Props) {
  if (rows.length === 0) {
    return (
      <section className="panel">
        <h2>Task history</h2>
        <EmptyState title="No tasks match these filters" hint="Every task the agent runs is recorded here, including the ones that failed." />
      </section>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <section className="panel">
      <h2>Task history</h2>

      <div className="history-table-wrap">
        <table className="history-table">
          <caption className="sr-only">Every task run, newest first. Select a row to see its full auction and settlement.</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort(sortKey === "createdAt", sortDir)}>
                <button type="button" className="btn-ghost th-sort" onClick={() => onSort("createdAt")}>
                  Time
                </button>
              </th>
              <th scope="col">Prompt</th>
              <th scope="col">Won by</th>
              <th scope="col" aria-sort={ariaSort(sortKey === "cost", sortDir)}>
                <button type="button" className="btn-ghost th-sort" onClick={() => onSort("cost")}>
                  Cost
                </button>
              </th>
              <th scope="col">Status</th>
              <th scope="col">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = STATUS[row.status];
              const cost = row.amountUsd ?? row.estimatedCostUsd;
              return (
                <tr
                  key={row.taskId}
                  data-selected={row.taskId === selectedTaskId}
                  onClick={() => onSelect(row.taskId)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open detail for task: ${row.prompt.slice(0, 60)}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(row.taskId);
                    }
                  }}
                >
                  <td className="mono nowrap dim">{fmtClock(row.createdAt)}</td>
                  <td className="history-prompt" title={row.prompt}>
                    {row.prompt}
                  </td>
                  <td className="nowrap">
                    {row.winnerIndustryId ? (
                      <span className="history-winner">
                        <IndustryIcon industryId={row.winnerIndustryId} size={14} />
                        {row.winnerIndustryId}
                      </span>
                    ) : (
                      <span className="dim">none</span>
                    )}
                  </td>
                  <td className="mono nowrap">{cost === null ? <span className="dim">—</span> : fmtUsdMicro(cost)}</td>
                  <td>
                    <Pill tone={status.tone} icon={status.icon}>
                      {row.status}
                    </Pill>
                  </td>
                  <td className="nowrap">
                    {row.explorerUrl && row.txHash ? (
                      <a
                        href={row.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`View transaction ${row.txHash} on the XRPL testnet explorer`}
                      >
                        <LinkIcon size={12} />
                        <span className="mono">{shortHash(row.txHash, 6, 4)}</span>
                      </a>
                    ) : (
                      <span className="dim">not settled</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="history-pagination">
        <span className="dim">
          Page {currentPage} of {totalPages}
        </span>
        <div className="history-pagination-buttons">
          <button type="button" className="btn-ghost" disabled={offset === 0} onClick={() => onPageChange(Math.max(0, offset - limit))}>
            Previous
          </button>
          <button type="button" className="btn-ghost" disabled={isLastPage} onClick={() => onPageChange(offset + limit)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
