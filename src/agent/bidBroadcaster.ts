import { env } from "../shared/env.js";
import { quoteResponseSchema, type QuoteRequest } from "../shared/bidProtocol.js";
import type { Bid, ExcludedBid, ProviderId } from "../shared/types.js";
import { publish } from "./eventBus.js";
import { allProviderIds, providerBaseUrl } from "./providerRegistry.js";

export interface BroadcastResult {
  bids: Bid[];
  excluded: ExcludedBid[];
}

async function quoteFromProvider(providerId: ProviderId, request: QuoteRequest): Promise<Bid> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.PROVIDER_QUOTE_TIMEOUT_MS);

  try {
    const response = await fetch(`${providerBaseUrl(providerId)}/quote`, {
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

    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fans out /quote to every registered provider in parallel. A timeout,
 * network error, or malformed response excludes that provider from this
 * round only — the task proceeds with whoever else responded.
 */
export async function broadcastQuotes(sessionId: string, taskId: string, request: QuoteRequest): Promise<BroadcastResult> {
  const results = await Promise.allSettled(allProviderIds().map((providerId) => quoteFromProvider(providerId, request)));

  const bids: Bid[] = [];
  const excluded: ExcludedBid[] = [];

  results.forEach((result, index) => {
    const providerId = allProviderIds()[index];
    if (result.status === "fulfilled") {
      bids.push(result.value);
      publish({ type: "bid.received", sessionId, taskId, bid: result.value });
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const excludedBid: ExcludedBid = { providerId, reason };
      excluded.push(excludedBid);
      publish({ type: "bid.excluded", sessionId, taskId, excluded: excludedBid });
    }
  });

  return { bids, excluded };
}
