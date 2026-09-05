export const PROVIDER_IDS = ["openai", "anthropic", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ComplexityHint = "simple" | "standard" | "complex";

export interface Task {
  taskId: string;
  sessionId: string;
  prompt: string;
  complexityHint: ComplexityHint;
  budgetUsd: number;
  createdAt: string;
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
  expiresAt: string;
}

export interface ExcludedBid {
  providerId: ProviderId;
  reason: string;
}

export interface DecisionResult {
  winner: Bid;
  score: number;
  reason: string;
  ranked: Array<{ bid: Bid; score: number; budgetFit: boolean }>;
  rejectedForBudget: ProviderId[];
}

export type SettlementMode = "channel" | "payment";

export interface MemoPayload {
  providerId: ProviderId;
  bidPricePerInputTokenUsd: number;
  bidPricePerOutputTokenUsd: number;
  bidTotalCostUsd: number;
  qualityScore: number;
  taskComplexityScore: number;
  taskId: string;
  winningReason: string;
}

export interface SettlementRecord {
  taskId: string;
  providerId: ProviderId;
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
