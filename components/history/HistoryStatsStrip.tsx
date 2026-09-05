"use client";

import { fmtInt, fmtPct, fmtUsdMicro } from "../format";
import { CheckIcon, IndustryIcon } from "../icons";
import { Pill, Skeleton } from "../ui";
import type { HistoryStats } from "@/lib/shared/historyTypes";

export function HistoryStatsStrip({ stats }: { stats: HistoryStats | null }) {
  if (!stats) {
    return (
      <section className="panel" aria-busy="true">
        <h2>Overview</h2>
        <Skeleton height={18} />
        <div style={{ height: 8 }} />
        <Skeleton height={18} width="70%" />
      </section>
    );
  }

  return (
    <section className="panel history-stats">
      <h2>Overview</h2>

      <dl className="kv">
        <div>
          <dt>Tasks run</dt>
          <dd className="mono history-stat-value">{fmtInt(stats.totalTasks)}</dd>
        </div>
        <div>
          <dt>Success rate</dt>
          <dd className="mono history-stat-value">{fmtPct(stats.successRate)}</dd>
        </div>
        <div>
          <dt>Settled on-chain</dt>
          <dd className="mono history-stat-value">{fmtUsdMicro(stats.totalSettledUsd)}</dd>
        </div>
        <div>
          <dt>Spent on inference</dt>
          <dd className="mono history-stat-value">{fmtUsdMicro(stats.totalSpentUsd)}</dd>
        </div>
        <div>
          <dt>Avg per task</dt>
          <dd className="mono history-stat-value">{fmtUsdMicro(stats.avgCostPerTaskUsd)}</dd>
        </div>
      </dl>

      <div className="history-stat-pills">
        <Pill tone="accent" icon={CheckIcon}>
          {stats.completed} completed
        </Pill>
        {stats.failed > 0 ? <Pill tone="danger">{stats.failed} failed</Pill> : null}
        {stats.rejected > 0 ? <Pill tone="warn">{stats.rejected} rejected</Pill> : null}
      </div>

      {stats.perIndustry.some((i) => i.wins > 0) ? (
        <ul className="history-agent-wins" role="list">
          {stats.perIndustry
            .filter((i) => i.wins > 0)
            .sort((a, b) => b.wins - a.wins)
            .map((i) => (
              <li key={i.industryId}>
                <IndustryIcon industryId={i.industryId} size={14} />
                <span className="history-agent-name">{i.industryId}</span>
                <span className="mono dim">
                  {i.wins} won · {fmtPct(i.winRate)} · {fmtUsdMicro(i.totalPaidUsd)}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}
