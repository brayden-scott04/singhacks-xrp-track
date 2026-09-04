import type { QuoteResponse } from "../../shared/bidProtocol.js";

interface StoredQuote {
  quote: QuoteResponse;
  taskId: string;
  expiresAtMs: number;
}

/**
 * In-memory per-process store keyed by quoteId. Makes a provider's 402
 * response a binding quote (checked again at /execute) rather than
 * decoration — a stale or mismatched quoteId is rejected with 410.
 */
export class QuoteStore {
  private readonly quotes = new Map<string, StoredQuote>();

  put(taskId: string, quote: QuoteResponse, ttlMs: number): void {
    this.quotes.set(quote.quoteId, { quote, taskId, expiresAtMs: Date.now() + ttlMs });
  }

  /** Returns the quote if valid for this task, else null. Does not consume it. */
  peek(taskId: string, quoteId: string): QuoteResponse | null {
    const entry = this.quotes.get(quoteId);
    if (!entry) return null;
    if (entry.taskId !== taskId) return null;
    if (entry.expiresAtMs < Date.now()) {
      this.quotes.delete(quoteId);
      return null;
    }
    return entry.quote;
  }

  consume(taskId: string, quoteId: string): QuoteResponse | null {
    const quote = this.peek(taskId, quoteId);
    if (quote) this.quotes.delete(quoteId);
    return quote;
  }
}
