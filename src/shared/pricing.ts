import type { ProviderId } from "./types.js";

/**
 * Published per-token list pricing, captured at build time (Sept 2026).
 * These are each provider's real, publicly listed USD/token rates for the
 * model tier this adapter uses — not fabricated numbers — but a provider's
 * live pricing page is the source of truth; verify before any production use.
 *
 * qualityScore is a static 0..1 tier signal we assign per model (cheaper/
 * faster tiers score lower, larger tiers score higher), not a live benchmark.
 * It stands in for the "confidence signal" a real provider would attach to
 * its 402 quote.
 */
export interface ModelPricing {
  providerId: ProviderId;
  modelId: string;
  pricePerInputTokenUsd: number;
  pricePerOutputTokenUsd: number;
  qualityScore: number;
  qualityJustification: string;
}

export const MODEL_PRICING: Record<ProviderId, ModelPricing> = {
  openai: {
    providerId: "openai",
    modelId: "gpt-4o-mini",
    pricePerInputTokenUsd: 0.15 / 1_000_000,
    pricePerOutputTokenUsd: 0.6 / 1_000_000,
    qualityScore: 0.62,
    qualityJustification: "cost-tier general model — fast, cheap, solid on straightforward tasks",
  },
  anthropic: {
    providerId: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    pricePerInputTokenUsd: 1.0 / 1_000_000,
    pricePerOutputTokenUsd: 5.0 / 1_000_000,
    qualityScore: 0.8,
    qualityJustification: "current-gen Haiku tier — stronger reasoning, mid price point",
  },
  gemini: {
    providerId: "gemini",
    modelId: "gemini-2.0-flash",
    pricePerInputTokenUsd: 0.1 / 1_000_000,
    pricePerOutputTokenUsd: 0.4 / 1_000_000,
    qualityScore: 0.58,
    qualityJustification: "cheapest tier in the pool — fastest, most price-competitive bidder",
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
