import type { ProviderId } from "./types";

/**
 * Published per-token list pricing, captured at build time (Sept 2026) from
 * OpenRouter's live model catalog (https://openrouter.ai/api/v1/models) —
 * all three model calls are routed through OpenRouter's unified endpoint
 * (see lib/providers/llmClients.ts), so modelId below is the OpenRouter
 * slug, not the native provider's own model name. Not fabricated numbers —
 * but OpenRouter's live pricing page is the source of truth; verify before
 * any production use.
 *
 * qualityScore is a static 0..1 tier signal we assign per model (cheaper/
 * faster tiers score lower, larger tiers score higher), not a live benchmark.
 * It stands in for the "confidence signal" a real provider would attach to
 * its 402 quote.
 *
 * loadScore/knowledgeScore/speedScore are the same kind of static stand-in,
 * extended to the industry-agent decision layer's other self-reported
 * factors — loadScore is 0..1 "how busy this agent claims to be right now"
 * (higher = busier = worse), knowledgeScore/speedScore are 0..1 "higher is
 * better" tier signals. contextWindowTokens is real, published model spec.
 */
export interface ModelPricing {
  providerId: ProviderId;
  modelId: string;
  pricePerInputTokenUsd: number;
  pricePerOutputTokenUsd: number;
  qualityScore: number;
  qualityJustification: string;
  loadScore: number;
  knowledgeScore: number;
  speedScore: number;
  contextWindowTokens: number;
}

export const MODEL_PRICING: Record<ProviderId, ModelPricing> = {
  openai: {
    providerId: "openai",
    modelId: "openai/gpt-4o-mini",
    pricePerInputTokenUsd: 0.15 / 1_000_000,
    pricePerOutputTokenUsd: 0.6 / 1_000_000,
    qualityScore: 0.62,
    qualityJustification: "Fast, cheap, general-purpose. Solid on straightforward tasks.",
    loadScore: 0.35,
    knowledgeScore: 0.6,
    speedScore: 0.85,
    contextWindowTokens: 128_000,
  },
  anthropic: {
    providerId: "anthropic",
    modelId: "anthropic/claude-haiku-4.5",
    pricePerInputTokenUsd: 1.0 / 1_000_000,
    pricePerOutputTokenUsd: 5.0 / 1_000_000,
    qualityScore: 0.8,
    qualityJustification: "Current-generation Haiku. Stronger reasoning at a mid price point.",
    loadScore: 0.5,
    knowledgeScore: 0.85,
    speedScore: 0.55,
    contextWindowTokens: 200_000,
  },
  gemini: {
    providerId: "gemini",
    modelId: "google/gemini-2.5-flash-lite",
    pricePerInputTokenUsd: 0.1 / 1_000_000,
    pricePerOutputTokenUsd: 0.4 / 1_000_000,
    qualityScore: 0.58,
    qualityJustification: "The cheapest and fastest bidder in the pool.",
    loadScore: 0.3,
    knowledgeScore: 0.55,
    speedScore: 0.9,
    contextWindowTokens: 1_048_576,
  },
  deepseek: {
    providerId: "deepseek",
    modelId: "deepseek/deepseek-chat",
    pricePerInputTokenUsd: 0.32 / 1_000_000,
    pricePerOutputTokenUsd: 0.89 / 1_000_000,
    qualityScore: 0.75,
    qualityJustification: "DeepSeek V3. Strong reasoning at a mid-to-low price point.",
    loadScore: 0.45,
    knowledgeScore: 0.78,
    speedScore: 0.65,
    contextWindowTokens: 163_840,
  },
  meta: {
    providerId: "meta",
    modelId: "meta-llama/llama-3.3-70b-instruct",
    pricePerInputTokenUsd: 0.12 / 1_000_000,
    pricePerOutputTokenUsd: 0.3 / 1_000_000,
    qualityScore: 0.7,
    qualityJustification: "broad general-purpose tier — versatile across mixed or unclassified tasks, not domain-specialized",
    loadScore: 0.4,
    knowledgeScore: 0.65,
    speedScore: 0.75,
    contextWindowTokens: 128_000,
  },
};

/** Cheap, deterministic token estimate: ~4 chars/token, never zero. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateOutputTokens(complexityScore: number): number {
  // 64 tokens for a trivial task, scaling up to ~768 for a maximally complex one.
  return Math.round(64 + complexityScore * 704);
}
