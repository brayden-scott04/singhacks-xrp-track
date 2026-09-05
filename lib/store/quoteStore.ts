import { QUOTE_TTL_MS, type QuoteResponse } from "../shared/bidProtocol";
import type { ProviderId } from "../shared/types";
import { globalSingleton } from "./globalSingleton";

interface StoredQuote {
  quote: QuoteResponse;
  taskId: string;
  expiresAtMs: number;
}

/**
 * In-memory, keyed by `${providerId}:${quoteId}`. A provider's 402 response
 * is a binding quote (checked again at /execute) rather than decoration — a
 * stale or mismatched quoteId is rejected with 410. Namespacing by
 * providerId matches the isolation the old per-process instance gave for
 * free (a quoteId collision across providers can't leak into another
 * provider's execute path).
 */
const quotes = globalSingleton("quotes", () => new Map<string, StoredQuote>());

function quoteKey(providerId: ProviderId, quoteId: string): string {
  return `${providerId}:${quoteId}`;
}

export function putQuote(providerId: ProviderId, taskId: string, quote: QuoteResponse): void {
  quotes.set(quoteKey(providerId, quote.quoteId), { quote, taskId, expiresAtMs: Date.now() + QUOTE_TTL_MS });
}

/** Returns the quote if valid for this task, else null. Does not consume it. */
export function peekQuote(providerId: ProviderId, taskId: string, quoteId: string): QuoteResponse | null {
  const key = quoteKey(providerId, quoteId);
  const entry = quotes.get(key);
  if (!entry) return null;
  if (entry.taskId !== taskId) return null;
  if (entry.expiresAtMs < Date.now()) {
    quotes.delete(key);
    return null;
  }
  return entry.quote;
}

export function consumeQuote(providerId: ProviderId, taskId: string, quoteId: string): QuoteResponse | null {
  const quote = peekQuote(providerId, taskId, quoteId);
  if (quote) quotes.delete(quoteKey(providerId, quoteId));
  return quote;
}
