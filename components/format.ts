/**
 * Display formatting for the dashboard.
 *
 * Every Intl formatter is pinned to "en-US". These components are server-
 * rendered once before hydration, so a locale-dependent string produces a
 * hydration mismatch on any machine not already in en-US.
 *
 * Deliberately does NOT convert between USD and XRP: the rate is a
 * server-side env value (XRP_USD_RATE), and deriving it here would let the
 * UI drift from what was actually written on-chain.
 */

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usd6 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

const int = new Intl.NumberFormat("en-US");

const clock = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Headline money, 2dp. Use for the cap and for large totals. */
export function fmtUsd(n: number): string {
  return usd2.format(n);
}

/** Precise money, 6dp. Bids are fractions of a cent — 2dp would read as $0.00. */
export function fmtUsdMicro(n: number): string {
  return usd6.format(n);
}

/** 6dp below a cent, 2dp above. Never mix the two on one line. */
export function fmtUsdAuto(n: number): string {
  return n < 0.01 ? usd6.format(n) : usd2.format(n);
}

/** Per-token prices are ~1e-7; currency formatting collapses them to zero. */
export function fmtPricePerToken(n: number): string {
  return `$${n.toExponential(2)}/tok`;
}

/** 0..1 factor score as ".87" — the leading zero is noise in a dense table. */
export function fmtScore(n: number): string {
  return n.toFixed(2).replace(/^0/, "");
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtInt(n: number): string {
  return int.format(n);
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return int.format(n);
}

/** Drops are the ledger's own unit; show both so the memo can be checked. */
export function fmtDrops(drops: string): string {
  const n = Number(drops);
  if (!Number.isFinite(n)) return `${drops} drops`;
  return `${int.format(n)} drops`;
}

export function dropsToXrp(drops: string): string {
  const n = Number(drops);
  if (!Number.isFinite(n)) return "n/a";
  return `${(n / 1_000_000).toFixed(6)} XRP`;
}

/** Middle-truncate so both ends of a hash stay checkable against an explorer. */
export function shortHash(hash: string, lead = 8, tail = 6): string {
  if (hash.length <= lead + tail + 1) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

export function shortId(id: string, lead = 8): string {
  return id.length <= lead ? id : id.slice(0, lead);
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Wall-clock only. Relative times must be computed after mount. */
export function fmtClock(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "n/a";
  return clock.format(d);
}

export function fmtRelative(fromMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - fromMs);
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}

const WORD_RE = /\S+/g;

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}
