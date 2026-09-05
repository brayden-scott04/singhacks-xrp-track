import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { env, requireEnv, requireGoogleApiKey } from "../shared/env";

export interface LlmCallResult {
  output: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callOpenAI(prompt: string, modelId: string): Promise<LlmCallResult> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
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

export async function callAnthropic(prompt: string, modelId: string): Promise<LlmCallResult> {
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((block) => block.type === "text");
  return {
    output: textBlock && "text" in textBlock ? textBlock.text : "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function callGemini(prompt: string, modelId: string): Promise<LlmCallResult> {
  const ai = new GoogleGenAI({ apiKey: requireGoogleApiKey() });
  const response = await ai.models.generateContent({ model: modelId, contents: prompt });
  return {
    output: response.text ?? "",
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

void env; // ensures env is validated as soon as a provider route imports this module
