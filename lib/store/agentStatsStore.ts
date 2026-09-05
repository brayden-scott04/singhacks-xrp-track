import type { IndustryAgentId } from "../shared/types";
import { globalSingleton } from "./globalSingleton";

interface Stats {
  successes: number;
  failures: number;
}

/** Seeded baseline shown before an industry agent has enough real executions to trust its own rate. */
const DEFAULT_ERROR_RATE_PCT = 2;
const MIN_SAMPLES_BEFORE_TRUSTING = 5;

const stats = globalSingleton("agentStats", () => new Map<IndustryAgentId, Stats>());

export function recordOutcome(industryId: IndustryAgentId, success: boolean): void {
  const current = stats.get(industryId) ?? { successes: 0, failures: 0 };
  if (success) {
    current.successes += 1;
  } else {
    current.failures += 1;
  }
  stats.set(industryId, current);
}

/** Real rolling error rate once enough samples exist; otherwise a seeded baseline. */
export function getErrorRatePct(industryId: IndustryAgentId): number {
  const current = stats.get(industryId);
  const total = (current?.successes ?? 0) + (current?.failures ?? 0);
  if (!current || total < MIN_SAMPLES_BEFORE_TRUSTING) return DEFAULT_ERROR_RATE_PCT;
  return (current.failures / total) * 100;
}
