import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import {
  executeRequestSchema,
  executeResponseSchema,
  quoteRequestSchema,
  quoteResponseSchema,
  QUOTE_TTL_MS,
  type QuoteResponse,
} from "../../shared/bidProtocol.js";
import type { ModelPricing } from "../../shared/pricing.js";
import type { LlmCallResult } from "./llmClients.js";
import { QuoteStore } from "./quoteStore.js";

export interface ProviderServerConfig {
  pricing: ModelPricing;
  callFn: (prompt: string, modelId: string) => Promise<LlmCallResult>;
}

/**
 * Builds a real local HTTP server that performs the 402-as-bid protocol for
 * one provider: POST /quote always returns HTTP 402 with a binding, TTL'd
 * quote; POST /execute redeems a still-valid quoteId with a genuine call to
 * the underlying LLM API.
 */
export function createProviderServer({ pricing, callFn }: ProviderServerConfig): Express {
  const app = express();
  app.use(express.json());
  const quoteStore = new QuoteStore();

  app.get("/health", (_req, res) => {
    res.json({ providerId: pricing.providerId, modelId: pricing.modelId, status: "ok" });
  });

  app.post("/quote", (req, res) => {
    const parsed = quoteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid quote request", details: parsed.error.flatten() });
      return;
    }
    const { taskId, estimatedInputTokens, estimatedOutputTokens } = parsed.data;

    const estimatedTotalCostUsd =
      estimatedInputTokens * pricing.pricePerInputTokenUsd + estimatedOutputTokens * pricing.pricePerOutputTokenUsd;

    const quote: QuoteResponse = quoteResponseSchema.parse({
      providerId: pricing.providerId,
      quoteId: randomUUID(),
      modelId: pricing.modelId,
      pricePerInputTokenUsd: pricing.pricePerInputTokenUsd,
      pricePerOutputTokenUsd: pricing.pricePerOutputTokenUsd,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalCostUsd,
      qualityScore: pricing.qualityScore,
      qualityJustification: pricing.qualityJustification,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    });

    quoteStore.put(taskId, quote, QUOTE_TTL_MS);

    res
      .status(402)
      .set({
        "X-Provider-Id": quote.providerId,
        "X-Price-Per-Input-Token-Usd": String(quote.pricePerInputTokenUsd),
        "X-Price-Per-Output-Token-Usd": String(quote.pricePerOutputTokenUsd),
        "X-Quality-Score": String(quote.qualityScore),
        "X-Estimated-Total-Cost-Usd": String(quote.estimatedTotalCostUsd),
        "X-Quote-Id": quote.quoteId,
        "X-Quote-Expires-At": quote.expiresAt,
      })
      .json(quote);
  });

  app.post("/execute", async (req, res) => {
    const parsed = executeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid execute request", details: parsed.error.flatten() });
      return;
    }
    const { taskId, quoteId, prompt } = parsed.data;

    const quote = quoteStore.consume(taskId, quoteId);
    if (!quote) {
      res.status(410).json({ error: "quote expired or unknown — request a fresh /quote" });
      return;
    }

    try {
      const result = await callFn(prompt, pricing.modelId);
      const actualCostUsd =
        result.inputTokens * pricing.pricePerInputTokenUsd + result.outputTokens * pricing.pricePerOutputTokenUsd;

      res.status(200).json(
        executeResponseSchema.parse({
          taskId,
          output: result.output,
          actualInputTokens: result.inputTokens,
          actualOutputTokens: result.outputTokens,
          actualCostUsd,
        }),
      );
    } catch (err) {
      res.status(502).json({ error: "provider execution failed", message: (err as Error).message });
    }
  });

  return app;
}
