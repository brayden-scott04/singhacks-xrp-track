import type { ComplexityHint } from "./types.js";

const HINT_FLOOR: Record<ComplexityHint, number> = {
  simple: 0.05,
  standard: 0.3,
  complex: 0.6,
};

const HINT_MULTIPLIER: Record<ComplexityHint, number> = {
  simple: 0.6,
  standard: 1.0,
  complex: 1.25,
};

const COMPLEXITY_KEYWORDS = [
  /\bstep[s]? by step\b/i,
  /\bcompare\b/i,
  /\banaly[sz]e\b/i,
  /\bexplain\b/i,
  /\brefactor\b/i,
  /\bdesign\b/i,
  /\bsummari[sz]e (?:in depth|thoroughly)\b/i,
  /```/,
  /\bmulti[- ]?step\b/i,
  /\band\b.*\band\b/i, // multi-part ask ("do X and Y and Z")
];

/**
 * Deterministic 0..1 complexity score. No extra API call — pure local
 * heuristic combining prompt length, structural/keyword signals, and the
 * customer-supplied hint. Drives both the token estimate sent to providers
 * and the decision engine's price-vs-quality weighting.
 */
export function scoreComplexity(prompt: string, hint: ComplexityHint): number {
  const lengthSignal = Math.min(1, Math.log10(1 + prompt.length) / 4); // ~0 at 1 char, ~1 at 10k chars
  const keywordHits = COMPLEXITY_KEYWORDS.reduce((count, re) => (re.test(prompt) ? count + 1 : count), 0);
  const keywordSignal = Math.min(1, keywordHits / 3);

  const raw = 0.5 * lengthSignal + 0.5 * keywordSignal;
  const withHint = Math.max(HINT_FLOOR[hint], raw * HINT_MULTIPLIER[hint]);

  return Math.min(1, Math.max(0, withHint));
}
