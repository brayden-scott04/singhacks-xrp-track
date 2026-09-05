# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BidStream — a Next.js app that runs a live auction among five "industry agents" for every
submitted task, executes the task on the winner, and settles payment to it on the XRP Ledger
with an on-chain Memo recording *why* that agent won. Built for the Ripple / SingHacks
"AI-Native Business on XRPL" track.

## Commands

```bash
npm run dev              # Next dev server on :3000 (dashboard + all API routes)
npm run build            # next build
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run setup:wallets    # generate + faucet-fund 6 XRPL testnet wallets, append seeds to .env
npm run demo             # scripted 3-task run; needs `npm run dev` already running
```

Single test file / single test:

```bash
npx vitest run components/roundsReducer.test.ts
npx vitest run -t "detects an LLM override"
```

`npm run demo` targets `http://localhost:3000`; override with `DEMO_BASE_URL=…`.

Requires `OPENROUTER_API_KEY` and six `XRPL_SEED_*` values in `.env` (copy `.env.example`).

**Vitest needs `vitest.config.ts` for the `@/` alias.** Next resolves it from tsconfig;
Vitest does not, and any test importing a module that uses `@/` fails to resolve without it.

## Architecture

### The two-stage decision — the core of the product

Reading [lib/agent/decisionEngine.ts](lib/agent/decisionEngine.ts) alone is misleading; the
actual pick happens in [lib/agent/decisionModel.ts](lib/agent/decisionModel.ts).

1. **Deterministic prior** — seven factors normalised to 0–1 for the round (higher always
   better), blended by fixed weights in [lib/shared/scoringWeights.ts](lib/shared/scoringWeights.ts).
2. **Hard budget gate** — a bid over `budgetRemainingUsd` scores 0 and cannot win.
3. **LLM decision agent** — `chooseWinnerWithLLM` sends the task text plus every eligible
   bid to `openai/gpt-4.1-mini` and lets it override the composite. Returns `null` on *any*
   problem (no key, timeout, bad JSON, unknown winner, <2 candidates) and the caller falls
   back silently to the top composite. A broken LLM path looks identical to a working one
   unless you read `decision.reason`, which names the model when the LLM actually decided.

`decision.ranked` is sorted descending before being returned, so **`ranked[0]` is the
deterministic prior's pick**. Comparing it to `decision.winner` is a structural test for
"the LLM overrode the prior" — never parse the reason string for this.

### Industry agents vs providers

Two id spaces, mapped 1:1 in [lib/agent/industryRegistry.ts](lib/agent/industryRegistry.ts):

| Industry agent | Provider | OpenRouter slug |
|---|---|---|
| legal | anthropic | `anthropic/claude-haiku-4.5` |
| healthcare | openai | `openai/gpt-4o-mini` |
| finance | gemini | `google/gemini-2.5-flash-lite` |
| technology | deepseek | `deepseek/deepseek-chat` |
| general | meta | `meta-llama/llama-3.3-70b-instruct` |

**All five bid on every task** regardless of subject matter; the provider never sees the
industry framing. Only the LLM decision agent, which reads the task text alongside the
industry labels, makes routing domain-aware.

**Adding an agent touches six places** — `INDUSTRY_AGENT_IDS`/`PROVIDER_IDS` in
[lib/shared/types.ts](lib/shared/types.ts), `MODEL_PRICING`, both registries, a new
`XRPL_SEED_PROVIDER_*`, a new `app/api/providers/<id>/{quote,execute}` route pair, and
`INDUSTRY_ICONS` in [components/icons.tsx](components/icons.tsx). That last one is an
exhaustive `Record<IndustryAgentId, …>` on purpose, so a missing agent is a compile error
rather than a silent generic dot — it has already broken `main` once.

### The 402-as-bid protocol

`POST /api/providers/<id>/quote` **always returns HTTP 402** carrying price, quality and the
other factor signals. The 402 *is* the bid — in
[lib/agent/bidBroadcaster.ts](lib/agent/bidBroadcaster.ts) any status other than 402 is a
failed bid. Quotes are TTL'd 30s and binding: `/execute` consumes the exact `quoteId` or
returns 410.

The orchestrator calls these sibling routes over **real HTTP** so the 402 round-trip stays
genuine, which makes `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`) load-bearing
when deployed. All five `callX` functions in [lib/providers/llmClients.ts](lib/providers/llmClients.ts)
are identical wrappers over one OpenRouter endpoint; the provider distinction is the model
slug and the pricing row, nothing more.

### State is in-process, anchored on globalThis

Everything in [lib/store/](lib/store/) is a `Map` or `EventEmitter` created through
`globalSingleton` ([globalSingleton.ts](lib/store/globalSingleton.ts)). That indirection is
required: Next dev compiles each Route Handler into its own webpack bundle, so a plain
module-level `const` is **not** shared across routes. Consequences:

- **The app must run as one persistent Node process.** Serverless or multi-instance breaks
  the auction (quotes vanish between `/quote` and `/execute`) and the channel math.
- **Any restart resets everything**, including open payment channels — an HMR reload opens a
  *fresh* channel and burns another ceiling of testnet XRP. Do not edit files mid-demo.
- `saveSession()` is an intentional no-op; `getSession` returns the live object that
  [spendCap.ts](lib/agent/safeguards/spendCap.ts) mutates in place.

### XRPL settlement

Payment Channel primary ([paymentChannel.ts](lib/xrpl/paymentChannel.ts)): one
`PaymentChannelCreate` per provider opened lazily on first win, then per task an off-chain
cumulative claim signed and locally verified before submission, redeemed on-ledger by the
**provider's** wallet. Any throw falls back automatically to a discrete `Payment` and
publishes `settlement.fallback` — so a broken channel path still produces a working demo,
silently.

Invariants worth preserving:

- `withChannelLock(providerId, …)` serializes ensure-open + claim + state-update per
  provider. Settlement spans several `await`s; without it, concurrent tasks corrupt the
  cumulative claim math or double-open a channel.
- `SourceTag = 20260530` on every submitted transaction; `autofill()` before signing;
  `submitAndWait`, never bare `submit`.
- `assertMemoComplete()` throws before submission if the audit payload is incomplete.
- Settlement uses the **quoted** cost, not actual usage, so the on-chain record matches the
  auction decision it justifies.
- `serverExternalPackages: ["xrpl","ws","bufferutil","utf-8-validate"]` in `next.config.mjs`
  is required — webpack bundling `ws` breaks its `bufferutil` feature detection with
  `bufferUtil.mask is not a function` at runtime.

### Request flow and eventing

`POST /api/session/[id]/task` returns **202 immediately** and runs `runTask()` in the
background, reporting only over SSE (`/api/events`). There is **no event replay** — anything
failing in the first milliseconds publishes to nobody. Open the dashboard *before*
submitting, and read the server terminal when a task appears to hang.

Publish order is bids → `decision.made` → `settlement.started` → (`settlement.fallback`) →
`settlement.confirmed` → `session.*` → `task.completed`. The answer arrives *after* the
payment; the UI is built in that order deliberately.

## Presentation layer

[components/roundsReducer.ts](components/roundsReducer.ts) is the view model: it consumes
`BidStreamEvent` and shapes it for rendering. It is presentation state, not business logic,
but treat these as rules:

- **Pure and clock-free.** `at` always arrives on the action. React 19 + `reactStrictMode`
  double-invokes reducers in dev, so an internal `Date.now()` drifts between invocations.
- **Store whole domain objects**, never pre-formatted strings. The pre-redesign version
  flattened a bid into one line before the feed saw it, which made any non-text layout
  impossible.
- Seeds one `pending` slot per `INDUSTRY_AGENT_IDS` entry, so the auction visibly fills in.

Client/server boundary rules:

- **Never import [lib/shared/memo.ts](lib/shared/memo.ts) into a client component** — it uses
  `Buffer` and breaks the browser bundle. `MemoView` retypes the two memo constants instead.
- Import `DEFAULT_FACTOR_WEIGHTS` from `lib/shared/scoringWeights.ts` rather than
  re-declaring weights. Re-implementing scoring in the UI lets it drift from what is written
  on-chain, which destroys the memo's credibility.
- Pin every `Intl` formatter to `"en-US"` ([components/format.ts](components/format.ts)) and
  compute relative times only after mount. Unpinned locales and render-time clocks are
  hydration mismatches, even in `"use client"` components.

Other conventions: colours come from the token layer in `app/globals.css` (complete semantic
set in both themes, verified against WCAG AA — 4.5:1 text, 3:1 control boundaries); icons are
hand-inlined SVGs, never emoji; exactly one polite `role="status"` region lives in
`Dashboard`, and panels announce nothing themselves.

**Copy convention: no em dashes in user-visible text.** One survives on purpose, in
`decisionEngine`'s `scoreSummary`, because that string is hex-encoded into the settlement
memo and written to the ledger.

## Known behavioural quirks (verified, not yet fixed)

- `price: 1 - cost/maxCost` pins the round's most expensive bidder to exactly 0. Anthropic is
  always priciest, so **legal scores 0.00 on price every round**. A test in
  `scoringWeights.test.ts` asserts this as intended behaviour.
- The deterministic prior ranks finance/Gemini first on every task shape tested, and the
  margin is almost entirely the `contextWindow` factor (Gemini's 1M window normalises to 1.0
  while the rest land at 0.12–0.19). The LLM override is what makes routing task-aware.
- `complexityScore` no longer influences routing — computed, sent to providers for the
  output-token estimate, written to the memo, but not passed to `decide()`.
- The `wouldExceedCap` pause branch in the orchestrator is effectively unreachable:
  `budgetRemainingUsd` is already clamped to `capUsd - spentUsd` and the decision engine gates
  on it. The cap surfaces via `applySpend` on the *next* submission instead.
- `decodeMemoHex` in [lib/shared/memo.ts](lib/shared/memo.ts) still has **no callers**. The
  audit trail is written on-chain and never read back by the app.
- Channel ceiling is `capUsd * 2` per provider, roughly 47,000× a real task's cost.

## Repo conventions

- Comments explain *why*, not what, and are used sparingly on non-obvious trade-offs.
- `@/*` maps to the repo root.
- A project-scoped `Stop` hook in `.claude/settings.json` runs the XRPL hackathon feedback
  reflection on ~20% of turns, injecting an instruction via exit 2 — that is expected, not an
  error. It reads `hook/.xrpl-feedback-hook.json`, which is **gitignored**, so each clone must
  create it (`{"teamName":…,"hackerName":…}`) or the hook silently submits nothing.
