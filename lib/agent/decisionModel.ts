import { openRouterClient } from "../providers/llmClients";
import { env } from "../shared/env";
import type { IndustryAgentId, ScoredIndustryBid } from "../shared/types";

/**
 * The decision agent itself is an LLM call — deliberately a notch stronger
 * than any of the four bidding industry agents (which run on cheap/fast
 * tiers: gpt-4o-mini, claude-haiku-4.5, gemini-2.5-flash-lite, deepseek-chat)
 * — so the model making the final call outclasses every model it's judging.
 */
export const DECISION_MODEL_ID = "openai/gpt-4.1-mini";

export interface RankedCandidate {
  bid: ScoredIndustryBid;
  score: number;
  budgetFit: boolean;
}

export interface LlmDecision {
  winnerIndustryId: IndustryAgentId;
  reason: string;
}

function buildPrompt(taskPromptPreview: string, eligible: RankedCandidate[]): string {
  const lines = eligible.map(({ bid, score }) => {
    const f = bid.factorScores;
    return (
      `- ${bid.industryId} (${bid.providerId}/${bid.modelId}): $${bid.estimatedTotalCostUsd.toFixed(6)}, composite=${score.toFixed(3)}, ` +
      `factors[price=${f.price.toFixed(2)} load=${f.load.toFixed(2)} quality=${f.quality.toFixed(2)} knowledge=${f.knowledge.toFixed(2)} ` +
      `speed=${f.speed.toFixed(2)} errorRate=${f.errorRate.toFixed(2)} context=${f.contextWindow.toFixed(2)}]`
    );
  });

  return (
    `You are the decision agent in a task auction among AI industry agents. Task: "${taskPromptPreview}"\n\n` +
    `Eligible candidates (each factor already scored 0..1 by a deterministic scorer, higher is always better; ` +
    `composite is a weighted blend of all seven factors):\n${lines.join("\n")}\n\n` +
    `Pick the single best candidate to actually run this task. Use the composite score as a strong prior, but you ` +
    `may override it if the task's nature clearly favors a different tradeoff among the candidates shown. ` +
    `Respond with ONLY a JSON object, no other text: {"winnerIndustryId": "<industryId from the list above>", "reason": "<one sentence>"}.`
  );
}

/**
 * Runs the actual pick on DECISION_MODEL_ID. Returns null on any failure
 * (no key, timeout, malformed response, invalid winner) — the caller falls
 * back to the deterministic top composite score, so a flaky decision call
 * never blocks the auction.
 */
export async function chooseWinnerWithLLM(taskPromptPreview: string, eligible: RankedCandidate[]): Promise<LlmDecision | null> {
  if (eligible.length < 2 || !env.OPENROUTER_API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.PROVIDER_QUOTE_TIMEOUT_MS);

  try {
    const client = openRouterClient();
    const response = await client.chat.completions.create(
      {
        model: DECISION_MODEL_ID,
        messages: [{ role: "user", content: buildPrompt(taskPromptPreview, eligible) }],
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      winnerIndustryId?: string;
      reason?: string;
    };
    const winner = eligible.find((c) => c.bid.industryId === parsed.winnerIndustryId);
    if (!winner || !parsed.reason) return null;

    return { winnerIndustryId: winner.bid.industryId, reason: parsed.reason };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
