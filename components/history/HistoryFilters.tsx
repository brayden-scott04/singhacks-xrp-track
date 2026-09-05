"use client";

import { INDUSTRY_AGENT_IDS, type IndustryAgentId } from "@/lib/shared/types";
import { titleCaseId } from "../format";
import type { TaskHistoryStatus } from "@/lib/shared/historyTypes";

export interface HistoryFilterState {
  status: TaskHistoryStatus | "all";
  industryId: IndustryAgentId | "all";
  q: string;
}

type Props = {
  value: HistoryFilterState;
  onChange: (next: HistoryFilterState) => void;
  onRefresh: () => void;
};

const STATUSES: Array<TaskHistoryStatus | "all"> = ["all", "completed", "failed", "rejected"];

export function HistoryFilters({ value, onChange, onRefresh }: Props) {
  return (
    <div className="form-row history-filters">
      <label>
        <span className="field-label">Status</span>
        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as HistoryFilterState["status"] })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCaseId(s)}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="field-label">Winning agent</span>
        <select
          value={value.industryId}
          onChange={(e) => onChange({ ...value, industryId: e.target.value as HistoryFilterState["industryId"] })}
        >
          <option value="all">All</option>
          {INDUSTRY_AGENT_IDS.map((id) => (
            <option key={id} value={id}>
              {titleCaseId(id)}
            </option>
          ))}
        </select>
      </label>

      <label className="history-filter-search">
        <span className="field-label">Search prompts</span>
        <input
          type="search"
          placeholder="e.g. Contract"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
        />
      </label>

      <button type="button" className="btn-ghost" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
}
