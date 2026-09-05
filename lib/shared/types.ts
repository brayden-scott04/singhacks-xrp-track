export const PROVIDER_IDS = ["openai", "anthropic", "gemini", "deepseek"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * The bidding unit the decision agent actually ranks. Each industry agent is
 * a fixed business vertical backed 1:1 by one of the LLM providers above
 * (see lib/agent/industryRegistry.ts) — the provider itself stays unaware of
 * which industry it's being used for.
 */
export const INDUSTRY_AGENT_IDS = ["legal", "healthcare", "finance", "technology"] as const;
export type IndustryAgentId = (typeof INDUSTRY_AGENT_IDS)[number];

export type ComplexityHint = "simple" | "standard" | "complex";

export interface Task {
  taskId: string;
  sessionId: string;
  prompt: string;
  complexityHint: ComplexityHint;
  budgetUsd: number;
  createdAt: string;
}

/**
 * The seven factors the decision agent ranks every industry agent on, each
 * normalized 0..1 for the round it competed in with higher always meaning
 * better (see lib/shared/scoringWeights.ts for the normalization/inversion
 * rules and default weights).
 */
export interface FactorScores {
  price: number;
  load: number;
  quality: number;
  knowledge: number;
  speed: number;
  errorRate: number;
  contextWindow: number;
}

export interface Bid {
  providerId: ProviderId;
  quoteId: string;
  modelId: string;
  pricePerInputTokenUsd: number;
  pricePerOutputTokenUsd: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalCostUsd: number;
  qualityScore: number;
  qualityJustification: string;
  loadScore: number;
  knowledgeScore: number;
  speedScore: number;
  contextWindowTokens: number;
  expiresAt: string;
}

/** A provider's raw quote, tagged with the industry identity that solicited it and a real tracked error rate. */
export interface IndustryBid extends Bid {
  industryId: IndustryAgentId;
  errorRatePct: number;
}

/** An IndustryBid after the decision agent has normalized and weighted it against the rest of its round. */
export interface ScoredIndustryBid extends IndustryBid {
  factorScores: FactorScores;
  compositeScore: number;
}

export interface ExcludedBid {
  industryId: IndustryAgentId;
  reason: string;
}

export interface DecisionResult {
  winner: ScoredIndustryBid;
  score: number;
  reason: string;
  ranked: Array<{ bid: ScoredIndustryBid; score: number; budgetFit: boolean }>;
  rejectedForBudget: IndustryAgentId[];
}

export type SettlementMode = "channel" | "payment";

export interface MemoPayload {
  providerId: ProviderId;
  industryId: IndustryAgentId;
  bidPricePerInputTokenUsd: number;
  bidPricePerOutputTokenUsd: number;
  bidTotalCostUsd: number;
  qualityScore: number;
  factorScores: FactorScores;
  compositeScore: number;
  taskComplexityScore: number;
  taskId: string;
  winningReason: string;
}

export interface SettlementRecord {
  taskId: string;
  providerId: ProviderId;
  industryId: IndustryAgentId;
  mode: SettlementMode;
  txHash: string;
  amountDrops: string;
  amountUsd: number;
  memo: MemoPayload;
  explorerUrl: string;
  fallbackReason?: string;
}

export type SessionStatus = "active" | "warning" | "paused";

export interface SessionState {
  sessionId: string;
  capUsd: number;
  spentUsd: number;
  status: SessionStatus;
  createdAt: string;
}

export interface TaskResult {
  taskId: string;
  output: string;
  actualInputTokens: number;
  actualOutputTokens: number;
  actualCostUsd: number;
}
