/**
 * Bid/settlement amounts range from ~$0.00001 to ~$0.50 in this app.
 * A fixed `toFixed(N)` either collapses small values to `$0.00` (N=2) or
 * bloats large ones with noise digits (N=6). Above a cent, show cents
 * normally; below a cent, show ~2 significant figures so the value stays
 * short but never rounds away to zero.
 */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  const abs = Math.abs(n);
  if (abs >= 0.01) return `$${n.toFixed(2)}`;
  const decimals = Math.max(2, -Math.floor(Math.log10(abs)) + 1);
  return `$${n.toFixed(decimals)}`;
}

export function fmtScore(n: number): string {
  return n.toFixed(2);
}
