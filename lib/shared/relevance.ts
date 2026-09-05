import type { IndustryAgentId } from "./types";

/**
 * Bonus weight applied to an industry's effective score when the task
 * clearly matches its specialty. Deliberately pinned to the smallest
 * official factor weight (DEFAULT_FACTOR_WEIGHTS.load, see
 * scoringWeights.ts) so this can only tip a close call between otherwise
 * comparable bids — it can never outweigh a genuine quality/price/knowledge
 * differential from the real factor scores.
 */
export const RELEVANCE_BONUS_WEIGHT = 0.04;

/**
 * Hard ceiling enforced in decisionEngine.ts: the decision agent (LLM) may
 * still override the top composite score for its own judgment — domain fit
 * or any other reason — but if its pick trails the best eligible composite
 * by more than this margin, decisionEngine.ts reverts to the deterministic
 * winner. This is what actually bounds "best value/optimization" vs. domain
 * expertise; the same number is quoted to the LLM in decisionModel.ts's
 * prompt so its own reasoning already aims to stay inside the ceiling, but
 * the code-level check is what makes it a guarantee rather than a request.
 */
export const MAX_COMPOSITE_OVERRIDE_GAP = 0.085;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const LEGAL_KEYWORDS = [
  /\bcontract\b/i,
  /\bclause\b/i,
  /\bcompliance\b/i,
  /\blawsuit\b/i,
  /\bliability\b/i,
  /\blegal\b/i,
  /\bagreement\b/i,
  /\bstatute\b/i,
  /\bregulation\b/i,
  /\bterms and conditions\b/i,
  /\bnda\b/i,
  /\bcopyright\b/i,
  /\bpatent\b/i,
  /\b(?:plaintiff|defendant)\b/i,
];

const HEALTHCARE_KEYWORDS = [
  /\bpatient\b/i,
  /\bdiagnos(?:is|e)\b/i,
  /\btreatment\b/i,
  /\bsymptom\b/i,
  /\bclinical\b/i,
  /\bmedical\b/i,
  /\bdosage|dose\b/i,
  /\btherapy\b/i,
  /\bprescription\b/i,
  /\bhealthcare\b/i,
  /\bdisease\b/i,
  /\bmedication\b/i,
  /\bhospital\b/i,
  /\b(?:nurse|physician|doctor)\b/i,
];

const FINANCE_KEYWORDS = [
  /\bbudget\b/i,
  /\binvoice\b/i,
  /\brevenue\b/i,
  /\bstock\b/i,
  /\btax(?:es)?\b/i,
  /\bexpense\b/i,
  /\binvestment\b/i,
  /\baccounting\b/i,
  /\bbalance sheet\b/i,
  /\bcash flow\b/i,
  /\bportfolio\b/i,
  /\b(?:loan|interest rate)\b/i,
  /\bfinanc(?:e|ial)\b/i,
  /\baudit\b/i,
];

const TECHNOLOGY_KEYWORDS = [
  /\bpython\b/i,
  /\b(?:javascript|typescript)\b/i,
  /\bcode\b/i,
  /\bprogram(?:ming)?\b/i,
  /\bsoftware\b/i,
  /\balgorithm\b/i,
  /\bapi\b/i,
  /\bdebug(?:ging)?\b/i,
  /\bfunction\b/i,
  /\bdatabase\b/i,
  /\bbug\b/i,
  /\bscript\b/i,
  /\bapp(?:lication)?\b/i,
  /\bserver\b/i,
];

function keywordSignal(prompt: string, keywords: RegExp[]): number {
  const hits = keywords.reduce((count, re) => (re.test(prompt) ? count + 1 : count), 0);
  return Math.min(1, hits / 3);
}

/**
 * Deterministic 0..1 domain-relevance score per industry, from prompt text
 * alone. No extra API call — mirrors complexity.ts's keyword-hit heuristic.
 * `general` scores highest exactly when the prompt doesn't clearly match any
 * of the four specialist domains.
 */
export function scoreIndustryRelevance(prompt: string): Record<IndustryAgentId, number> {
  const legal = keywordSignal(prompt, LEGAL_KEYWORDS);
  const healthcare = keywordSignal(prompt, HEALTHCARE_KEYWORDS);
  const finance = keywordSignal(prompt, FINANCE_KEYWORDS);
  const technology = keywordSignal(prompt, TECHNOLOGY_KEYWORDS);
  const general = clamp01(1 - Math.max(legal, healthcare, finance, technology));

  return { legal, healthcare, finance, technology, general };
}
