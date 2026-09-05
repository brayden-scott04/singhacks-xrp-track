"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HistoryStats, ListHistoryResult, TaskHistoryListItem } from "@/lib/shared/historyTypes";
import { AlertIcon } from "../icons";
import { Skeleton } from "../ui";
import { HistoryDetailPanel } from "./HistoryDetailPanel";
import { HistoryFilters, type HistoryFilterState } from "./HistoryFilters";
import { HistoryStatsStrip } from "./HistoryStatsStrip";
import { HistoryTable, type SortDir, type SortKey } from "./HistoryTable";

const PAGE_SIZE = 25;

function sortRows(rows: TaskHistoryListItem[], key: SortKey, dir: SortDir): TaskHistoryListItem[] {
  const sorted = [...rows].sort((a, b) => {
    if (key === "cost") {
      const av = a.amountUsd ?? a.estimatedCostUsd ?? -1;
      const bv = b.amountUsd ?? b.estimatedCostUsd ?? -1;
      return av - bv;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return dir === "asc" ? sorted : sorted.reverse();
}

export function HistoryDashboard() {
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [result, setResult] = useState<ListHistoryResult>({ rows: [], total: 0 });
  const [filters, setFilters] = useState<HistoryFilterState>({ status: "all", industryId: "all", q: "" });
  const [offset, setOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadStats = useCallback(() => {
    fetch("/api/history/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {
        // Stats are supplementary — a failed fetch here shouldn't block the table.
      });
  }, []);

  const loadRows = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.industryId !== "all") params.set("industryId", filters.industryId);
    if (filters.q.trim()) params.set("q", filters.q.trim());

    fetch(`/api/history?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
        return body as ListHistoryResult;
      })
      .then(setResult)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [filters, offset]);

  useEffect(() => loadStats(), [loadStats, refreshTick]);
  useEffect(() => loadRows(), [loadRows, refreshTick]);

  // Any filter change resets pagination back to the first page.
  const handleFilterChange = useCallback((next: HistoryFilterState) => {
    setFilters(next);
    setOffset(0);
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      setSortDir((prevDir) => (key === sortKey ? (prevDir === "asc" ? "desc" : "asc") : "desc"));
      setSortKey(key);
    },
    [sortKey],
  );

  const handleRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  const sortedRows = useMemo(() => sortRows(result.rows, sortKey, sortDir), [result.rows, sortKey, sortDir]);

  return (
    <>
      {error ? (
        <section className="banner banner-danger" role="alert">
          <p className="banner-title">
            <AlertIcon size={16} />
            Could not load history
          </p>
          <p className="banner-body">{error}</p>
        </section>
      ) : null}

      <HistoryStatsStrip stats={stats} />

      <section className="panel">
        <h2>Filters</h2>
        <HistoryFilters value={filters} onChange={handleFilterChange} onRefresh={handleRefresh} />
      </section>

      {loading && result.rows.length === 0 ? (
        <section className="panel" aria-busy="true">
          <h2>Task history</h2>
          <Skeleton height={16} />
          <div style={{ height: 8 }} />
          <Skeleton height={16} width="85%" />
        </section>
      ) : (
        <HistoryTable
          rows={sortedRows}
          total={result.total}
          limit={PAGE_SIZE}
          offset={offset}
          selectedTaskId={selectedTaskId}
          sortKey={sortKey}
          sortDir={sortDir}
          onSelect={setSelectedTaskId}
          onSort={handleSort}
          onPageChange={setOffset}
        />
      )}
      {selectedTaskId && <HistoryDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
    </>
  );
}
