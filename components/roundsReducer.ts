/**
 * Presentation state for the dashboard's round cards.
 *
 * This is a view model, not business logic: it consumes the BidStreamEvent
 * union and shapes it for rendering. It deliberately stores whole domain
 * objects (IndustryBid, DecisionResult, SettlementRecord) rather than
 * pre-formatted strings — the previous version flattened a bid into one
 * opaque line before the feed ever saw it, which made any layout other
 * than a text blob impossible.
 *
 * Pure and free of clocks: `at` always arrives on the action. React 19
 * with reactStrictMode double-invokes reducers in development, so a
 * Date.now() call in here would produce different values per invocation.
 */
import { INDUSTRY_AGENT_IDS } from "@/lib/shared/types";
import type {
  ComplexityHint,
  DecisionResult,
  ExcludedBid,
  FactorScores,
  IndustryAgentId,
  IndustryBid,
  ProviderId,
  SettlementRecord,
} from "@/lib/shared/types";
import { DEFAULT_FACTOR_WEIGHTS } from "@/lib/shared/scoringWeights";

/** Keeps a long demo from growing without bound. */
const MAX_ROUNDS = 20;

export type BidOutcome = "pending" | "bid" | "excluded" | "won" | "rejected-budget" | "considered";

export interface RoundBid {
  industryId: IndustryAgentId;
  outcome: BidOutcome;
  bid: IndustryBid | null;
  excludedReason?: string;
  /** ms from task submission to this bid landing */
  latencyMs?: number;
  scored?: {
    factorScores: FactorScores;
    compositeScore: number;
    score: number;
    budgetFit: boolean;
    rank: number;
  };
}

export type RoundPhase = "bidding" | "deciding" | "executing" | "settling" | "settled" | "rejected" | "failed";

export interface RoundNote {
  kind: "info" | "warn" | "error";
  text: string;
  at: number;
}

export interface RoundDecision {
  winnerIndustryId: IndustryAgentId;
  reason: string;
  score: number;
  /** ranked[0] — the deterministic composite's top pick */
  priorTopIndustryId: IndustryAgentId;
  /** true when the LLM decision agent picked someone other than the prior's top */
  overrodePrior: boolean;
  rejectedForBudget: IndustryAgentId[];
  decidedAt: number;
}

export interface Round {
  taskId: string;
  prompt: string;
  complexityHint: ComplexityHint | null;
  budgetUsd: number | null;
  submittedAt: number;
  phase: RoundPhase;
  bids: RoundBid[];
  decision?: RoundDecision;
  settlementStartedAt?: number;
  settlement?: SettlementRecord;
  fallbackReason?: string;
  output?: string;
  completedAt?: number;
  notes: RoundNote[];
}

export interface RoundsState {
  order: string[]; // taskId, newest first
  byId: Record<string, Round>;
}

export const initialRoundsState: RoundsState = { order: [], byId: {} };

export type RoundsAction =
  | {
      type: "task.submitted";
      taskId: string;
      prompt: string;
      complexityHint: ComplexityHint;
      budgetUsd: number;
      at: number;
    }
  | { type: "bid.received"; taskId: string; bid: IndustryBid; at: number }
  | { type: "bid.excluded"; taskId: string; excluded: ExcludedBid; at: number }
  | { type: "decision.made"; taskId: string; decision: DecisionResult; at: number }
  | { type: "settlement.started"; taskId: string; providerId: ProviderId; industryId: IndustryAgentId; at: number }
  | { type: "settlement.fallback"; taskId: string; reason: string; at: number }
  | { type: "settlement.confirmed"; taskId: string; settlement: SettlementRecord; at: number }
  | { type: "task.completed"; taskId: string; output: string; at: number }
  | { type: "task.rejected"; taskId: string; reason: string; at: number }
  | { type: "task.failed"; taskId: string; reason: string; at: number };

function emptyRound(taskId: string, at: number): Round {
  return {
    taskId,
    // A round can arrive from `npm run demo` or another browser tab, in
    // which case we never saw the submission that named it.
    prompt: "",
    complexityHint: null,
    budgetUsd: null,
    submittedAt: at,
    phase: "bidding",
    bids: INDUSTRY_AGENT_IDS.map((industryId) => ({ industryId, outcome: "pending" as const, bid: null })),
    notes: [],
  };
}

function ensureRound(state: RoundsState, taskId: string, at: number): RoundsState {
  if (state.byId[taskId]) return state;

  const order = [taskId, ...state.order].slice(0, MAX_ROUNDS);
  const byId: Record<string, Round> = { ...state.byId, [taskId]: emptyRound(taskId, at) };
  for (const id of Object.keys(byId)) {
    if (!order.includes(id)) delete byId[id];
  }
  return { order, byId };
}

function patch(state: RoundsState, taskId: string, next: Round): RoundsState {
  return { ...state, byId: { ...state.byId, [taskId]: next } };
}

function withNote(round: Round, note: RoundNote): Round {
  return { ...round, notes: [...round.notes, note] };
}

/** Replaces one industry's slot, preserving the fixed industry ordering. */
function setBid(round: Round, industryId: IndustryAgentId, next: Partial<RoundBid>): Round {
  return {
    ...round,
    bids: round.bids.map((b) => (b.industryId === industryId ? { ...b, ...next } : b)),
  };
}

export function roundsReducer(state: RoundsState, action: RoundsAction): RoundsState {
  const withRound = ensureRound(state, action.taskId, action.at);
  const round = withRound.byId[action.taskId];

  switch (action.type) {
    case "task.submitted":
      return patch(withRound, action.taskId, {
        ...round,
        prompt: action.prompt,
        complexityHint: action.complexityHint,
        budgetUsd: action.budgetUsd,
        submittedAt: action.at,
      });

    case "bid.received":
      return patch(
        withRound,
        action.taskId,
        setBid(round, action.bid.industryId, {
          outcome: "bid",
          bid: action.bid,
          latencyMs: Math.max(0, action.at - round.submittedAt),
        }),
      );

    case "bid.excluded":
      return patch(
        withRound,
        action.taskId,
        setBid(round, action.excluded.industryId, {
          outcome: "excluded",
          bid: null,
          excludedReason: action.excluded.reason,
          latencyMs: Math.max(0, action.at - round.submittedAt),
        }),
      );

    case "decision.made": {
      const { decision } = action;
      // decisionEngine sorts `ranked` descending before returning, so
      // ranked[0] IS the deterministic prior's winner. Comparing it to the
      // actual winner is a structural test for "the LLM overrode the prior"
      // — no parsing of the reason string.
      const priorTop = decision.ranked[0]?.bid.industryId ?? decision.winner.industryId;

      let next: Round = round;
      decision.ranked.forEach((entry, index) => {
        const id = entry.bid.industryId;
        const existing = next.bids.find((b) => b.industryId === id);
        const outcome: BidOutcome =
          id === decision.winner.industryId
            ? "won"
            : decision.rejectedForBudget.includes(id)
              ? "rejected-budget"
              : existing?.outcome === "excluded"
                ? "excluded"
                : "considered";

        next = setBid(next, id, {
          outcome,
          // A round seeded from another client may never have seen bid.received.
          bid: existing?.bid ?? entry.bid,
          scored: {
            factorScores: entry.bid.factorScores,
            compositeScore: entry.bid.compositeScore,
            score: entry.score,
            budgetFit: entry.budgetFit,
            rank: index + 1,
          },
        });
      });

      return patch(withRound, action.taskId, {
        ...next,
        phase: "executing",
        decision: {
          winnerIndustryId: decision.winner.industryId,
          reason: decision.reason,
          score: decision.score,
          priorTopIndustryId: priorTop,
          overrodePrior: priorTop !== decision.winner.industryId,
          rejectedForBudget: decision.rejectedForBudget,
          decidedAt: action.at,
        },
      });
    }

    case "settlement.started":
      return patch(withRound, action.taskId, {
        ...round,
        phase: "settling",
        settlementStartedAt: action.at,
      });

    case "settlement.fallback":
      return patch(withRound, action.taskId, {
        ...withNote(round, { kind: "warn", text: `Channel settlement failed — ${action.reason}`, at: action.at }),
        fallbackReason: action.reason,
      });

    case "settlement.confirmed":
      return patch(withRound, action.taskId, {
        ...round,
        phase: "settled",
        settlement: action.settlement,
      });

    case "task.completed":
      return patch(withRound, action.taskId, {
        ...round,
        output: action.output,
        completedAt: action.at,
        // Never overwrite a terminal failure: a round can settle, then fail.
        phase: round.phase === "failed" || round.phase === "rejected" ? round.phase : "settled",
      });

    case "task.rejected":
      return patch(withRound, action.taskId, {
        ...withNote(round, { kind: "error", text: action.reason, at: action.at }),
        phase: "rejected",
      });

    case "task.failed":
      return patch(withRound, action.taskId, {
        ...withNote(round, { kind: "error", text: action.reason, at: action.at }),
        phase: "failed",
      });

    default:
      // Return withRound, not state — the old reducer silently discarded
      // the round it had just created here.
      return withRound;
  }
}

/* ------------------------------------------------------------ selectors --- */

const OUTCOME_ORDER: Record<BidOutcome, number> = {
  won: 0,
  considered: 1,
  "rejected-budget": 2,
  bid: 3,
  pending: 4,
  excluded: 5,
};

/** Ranked by the composite once scored; before that, by arrival state. */
export function selectRanked(round: Round): RoundBid[] {
  return [...round.bids].sort((a, b) => {
    if (a.scored && b.scored) return a.scored.rank - b.scored.rank;
    if (a.scored) return -1;
    if (b.scored) return 1;
    return OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome];
  });
}

export function selectWinner(round: Round): RoundBid | null {
  return round.bids.find((b) => b.outcome === "won") ?? null;
}

export function selectScoredBids(round: Round): RoundBid[] {
  return selectRanked(round).filter((b) => b.scored);
}

export type FactorKey = keyof FactorScores;

/** Weight-descending, so the matrix reads top-down in order of influence. */
export const FACTOR_ORDER: FactorKey[] = (Object.keys(DEFAULT_FACTOR_WEIGHTS) as FactorKey[]).sort(
  (a, b) => DEFAULT_FACTOR_WEIGHTS[b] - DEFAULT_FACTOR_WEIGHTS[a],
);

export const FACTOR_LABEL: Record<FactorKey, string> = {
  quality: "Quality",
  errorRate: "Reliability",
  price: "Price",
  knowledge: "Knowledge",
  contextWindow: "Context",
  speed: "Speed",
  load: "Load",
};

export const FACTOR_HINT: Record<FactorKey, string> = {
  quality: "Self-reported quality tier for the model",
  errorRate: "Inverted rolling execution error rate — higher is more reliable",
  price: "Relative to the most expensive bid this round",
  knowledge: "Self-reported domain knowledge tier",
  contextWindow: "Relative to the largest context window this round",
  speed: "Self-reported throughput tier",
  load: "Inverted current load — higher means less busy",
};

/** score x weight per factor, descending: what actually decided the round. */
export function selectContributions(
  factorScores: FactorScores,
): Array<{ key: FactorKey; score: number; weight: number; contribution: number }> {
  return FACTOR_ORDER.map((key) => ({
    key,
    score: factorScores[key],
    weight: DEFAULT_FACTOR_WEIGHTS[key],
    contribution: factorScores[key] * DEFAULT_FACTOR_WEIGHTS[key],
  })).sort((a, b) => b.contribution - a.contribution);
}

export { DEFAULT_FACTOR_WEIGHTS };
