import { z } from "zod";
import { PROVIDER_IDS } from "./types.js";

export const providerIdSchema = z.enum(PROVIDER_IDS);

export const quoteRequestSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1),
  promptPreview: z.string().min(1),
  estimatedInputTokens: z.number().int().positive(),
  estimatedOutputTokens: z.number().int().positive(),
  complexityScore: z.number().min(0).max(1),
  budgetRemainingUsd: z.number().min(0),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const quoteResponseSchema = z.object({
  providerId: providerIdSchema,
  quoteId: z.string().min(1),
  modelId: z.string().min(1),
  pricePerInputTokenUsd: z.number().positive(),
  pricePerOutputTokenUsd: z.number().positive(),
  estimatedInputTokens: z.number().int().positive(),
  estimatedOutputTokens: z.number().int().positive(),
  estimatedTotalCostUsd: z.number().positive(),
  qualityScore: z.number().min(0).max(1),
  qualityJustification: z.string().min(1),
  expiresAt: z.string(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

export const executeRequestSchema = z.object({
  taskId: z.string().min(1),
  quoteId: z.string().min(1),
  prompt: z.string().min(1),
});
export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

export const executeResponseSchema = z.object({
  taskId: z.string().min(1),
  output: z.string(),
  actualInputTokens: z.number().int().nonnegative(),
  actualOutputTokens: z.number().int().nonnegative(),
  actualCostUsd: z.number().nonnegative(),
});
export type ExecuteResponse = z.infer<typeof executeResponseSchema>;

export const QUOTE_TTL_MS = 30_000;
