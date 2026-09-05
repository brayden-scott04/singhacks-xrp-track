import { env } from "../shared/env";
import { quoteResponseSchema, type QuoteRequest } from "../shared/bidProtocol";
import type { ExcludedBid, IndustryAgentId, IndustryBid } from "../shared/types";
import { getErrorRatePct } from "../store/agentStatsStore";
import { publish } from "../store/eventBus";
import { allIndustryIds, industryProfile } from "./industryRegistry";
import { providerUrl } from "./providerRegistry";

export interface BroadcastResult {
  bids: IndustryBid[];
  excluded: ExcludedBid[];
}

async function quoteFromIndustry(industryId: IndustryAgentId, request: QuoteRequest): Promise<IndustryBid> {
  const { providerId } = industryProfile(industryId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.PROVIDER_QUOTE_TIMEOUT_MS);

  try {
    const response = await fetch(providerUrl(providerId, "quote"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    // 402 IS the expected "bid" response for a valid quote — not an error here.
    if (response.status !== 402) {
      throw new Error(`unexpected status ${response.status} from ${providerId}`);
    }

    const body = await response.json();
    const parsed = quoteResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(`malformed quote body from ${providerId}`);
    }

    return { ...parsed.data, industryId, errorRatePct: getErrorRatePct(industryId) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fans out /quote to every industry agent's backing provider in parallel. A
 * timeout, network error, or malformed response excludes that industry agent
 * from this round only — the task proceeds with whoever else responded.
 */
export async function broadcastQuotes(sessionId: string, taskId: string, request: QuoteRequest): Promise<BroadcastResult> {
  const industries = allIndustryIds();
  const results = await Promise.allSettled(industries.map((industryId) => quoteFromIndustry(industryId, request)));

  const bids: IndustryBid[] = [];
  const excluded: ExcludedBid[] = [];

  for (const [index, result] of results.entries()) {
    const industryId = industries[index];
    if (result.status === "fulfilled") {
      bids.push(result.value);
      await publish({ type: "bid.received", sessionId, taskId, bid: result.value });
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const excludedBid: ExcludedBid = { industryId, reason };
      excluded.push(excludedBid);
      await publish({ type: "bid.excluded", sessionId, taskId, excluded: excludedBid });
    }
  }

  return { bids, excluded };
}
