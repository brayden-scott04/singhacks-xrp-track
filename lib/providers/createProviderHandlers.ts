import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  executeRequestSchema,
  executeResponseSchema,
  quoteRequestSchema,
  quoteResponseSchema,
  QUOTE_TTL_MS,
  type QuoteResponse,
} from "../shared/bidProtocol";
import type { ModelPricing } from "../shared/pricing";
import { consumeQuote, putQuote } from "../store/quoteStore";
import type { LlmCallResult } from "./llmClients";

export interface ProviderHandlerConfig {
  pricing: ModelPricing;
  callFn: (prompt: string, modelId: string) => Promise<LlmCallResult>;
}

/**
 * Builds the pair of Route Handlers that perform the 402-as-bid protocol for
 * one provider: POST quote() always returns a genuine HTTP 402 with a
 * binding, TTL'd quote; POST execute() redeems a still-valid quoteId with a
 * genuine call to the underlying LLM API.
 */
export function createProviderHandlers({ pricing, callFn }: ProviderHandlerConfig) {
  async function quote(req: Request): Promise<Response> {
    const body = await req.json().catch(() => null);
    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid quote request", details: parsed.error.flatten() }, { status: 400 });
    }
    const { taskId, estimatedInputTokens, estimatedOutputTokens } = parsed.data;

    const estimatedTotalCostUsd =
      estimatedInputTokens * pricing.pricePerInputTokenUsd + estimatedOutputTokens * pricing.pricePerOutputTokenUsd;

    const quoteResponse: QuoteResponse = quoteResponseSchema.parse({
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
      loadScore: pricing.loadScore,
      knowledgeScore: pricing.knowledgeScore,
      speedScore: pricing.speedScore,
      contextWindowTokens: pricing.contextWindowTokens,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    });

    await putQuote(pricing.providerId, taskId, quoteResponse);

    return NextResponse.json(quoteResponse, {
      status: 402,
      headers: {
        "X-Provider-Id": quoteResponse.providerId,
        "X-Price-Per-Input-Token-Usd": String(quoteResponse.pricePerInputTokenUsd),
        "X-Price-Per-Output-Token-Usd": String(quoteResponse.pricePerOutputTokenUsd),
        "X-Quality-Score": String(quoteResponse.qualityScore),
        "X-Estimated-Total-Cost-Usd": String(quoteResponse.estimatedTotalCostUsd),
        "X-Quote-Id": quoteResponse.quoteId,
        "X-Quote-Expires-At": quoteResponse.expiresAt,
      },
    });
  }

  async function execute(req: Request): Promise<Response> {
    const body = await req.json().catch(() => null);
    const parsed = executeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid execute request", details: parsed.error.flatten() }, { status: 400 });
    }
    const { taskId, quoteId, prompt } = parsed.data;

    const quote = await consumeQuote(pricing.providerId, taskId, quoteId);
    if (!quote) {
      return NextResponse.json({ error: "Quote expired or unknown. Request a fresh /quote." }, { status: 410 });
    }

    try {
      const result = await callFn(prompt, pricing.modelId);
      const actualCostUsd =
        result.inputTokens * pricing.pricePerInputTokenUsd + result.outputTokens * pricing.pricePerOutputTokenUsd;

      return NextResponse.json(
        executeResponseSchema.parse({
          taskId,
          output: result.output,
          actualInputTokens: result.inputTokens,
          actualOutputTokens: result.outputTokens,
          actualCostUsd,
        }),
      );
    } catch (err) {
      return NextResponse.json({ error: "provider execution failed", message: (err as Error).message }, { status: 502 });
    }
  }

  return { quote, execute };
}
