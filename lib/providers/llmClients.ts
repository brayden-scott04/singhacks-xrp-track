import OpenAI from "openai";
import { env, requireEnv } from "../shared/env";

export interface LlmCallResult {
  output: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * All three "providers" are really just different model slugs called through
 * OpenRouter's unified OpenAI-compatible endpoint — one API key instead of
 * three, using the same `openai` SDK pointed at OpenRouter's base URL.
 * modelId here is the OpenRouter slug, e.g. "anthropic/claude-haiku-4.5".
 */
function openRouterClient(): OpenAI {
  return new OpenAI({
    apiKey: requireEnv("OPENROUTER_API_KEY"),
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "BidStream",
    },
  });
}

async function callViaOpenRouter(prompt: string, modelId: string): Promise<LlmCallResult> {
  const client = openRouterClient();
  const response = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: "user", content: prompt }],
  });
  return {
    output: response.choices[0]?.message?.content ?? "",
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

export async function callOpenAI(prompt: string, modelId: string): Promise<LlmCallResult> {
  return callViaOpenRouter(prompt, modelId);
}

export async function callAnthropic(prompt: string, modelId: string): Promise<LlmCallResult> {
  return callViaOpenRouter(prompt, modelId);
}

export async function callGemini(prompt: string, modelId: string): Promise<LlmCallResult> {
  return callViaOpenRouter(prompt, modelId);
}

void env; // ensures env is validated as soon as a provider route imports this module
