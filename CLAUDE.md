# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BidStream — a Next.js app that runs a live auction among four "industry agents" for every
submitted task, executes the task on the winner, and settles payment to it on the XRP Ledger
with an on-chain Memo recording *why* that agent won. Built for the Ripple / SingHacks
"AI-Native Business on XRPL" track.

## Commands

```bash
npm run dev              # Next dev server on :3000 (dashboard + all API routes)
npm run build            # next build
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run setup:wallets    # generate + faucet-fund 5 XRPL testnet wallets, append seeds to .env
npm run demo             # scripted end-to-end demo; needs `npm run dev` already running
```

Single test file / single test:

```bash
npx vitest run lib/shared/scoringWeights.test.ts
npx vitest run -t "scores price relative to the round"
```

`npm run demo` targets `http://localhost:3000`; override with `DEMO_BASE_URL=...`.

Requires `OPENROUTER_API_KEY` in `.env` for anything past the bid round, and the five
`XRPL_SEED_*` values for settlement. Copy `.env.example` first.

## Architecture

### The two-stage decision — the core of the product

Reading [lib/agent/decisionEngine.ts](lib/agent/decisionEngine.ts) alone is misleading; the
actual pick happens in [lib/agent/decisionModel.ts](lib/agent/decisionModel.ts).

1. **Deterministic prior** — every bid is normalized to seven 0..1 factors (price, load,
   quality, knowledge, speed, errorRate, contextWindow) and blended by the fixed weights in
   [lib/shared/scoringWeights.ts](lib/shared/scoringWeights.ts). Higher is always better;
   `load`/`errorRate` are inverted, `price`/`contextWindow` are relative to the round's best.
2. **Hard budget gate** — a bid over `budgetRemainingUsd` scores 0 and cannot win.
3. **LLM decision agent** — `chooseWinnerWithLLM` sends the task text plus every eligible
   bid's factors to `DECISION_MODEL_ID` (`openai/gpt-4.1-mini`, deliberately stronger than
   any bidder) and asks it to pick, using the composite as "a strong prior" it may override.
   Returns `null` on *any* problem (no key, timeout, bad JSON, unknown winner, <2 candidates),
   and the caller silently falls back to the top composite score. A failing decision call is
   therefore invisible unless you read `decision.reason`, which names the model when the LLM
   actually decided.

### Industry agents vs providers

Two distinct id spaces, mapped 1:1 in [lib/agent/industryRegistry.ts](lib/agent/industryRegistry.ts):

| Industry agent | Provider | OpenRouter slug |
|---|---|---|
| legal | anthropic | `anthropic/claude-haiku-4.5` |
| healthcare | openai | `openai/gpt-4o-mini` |
| finance | gemini | `google/gemini-2.5-flash-lite` |
| technology | deepseek | `deepseek/deepseek-chat` |

**All four bid on every task** regardless of subject matter, and the provider never sees the
industry framing — the vertical is only a label the decision agent reasons over. Adding an
agent means touching `INDUSTRY_AGENT_IDS`/`PROVIDER_IDS` in
[lib/shared/types.ts](lib/shared/types.ts), `MODEL_PRICING`, both registries, a new
`XRPL_SEED_PROVIDER_*`, and a new `app/api/providers/<id>/{quote,execute}` route pair.

### The 402-as-bid protocol

`POST /api/providers/<id>/quote` **always returns HTTP 402** carrying price, quality and the
other factor signals. The 402 *is* the bid — in
[lib/agent/bidBroadcaster.ts](lib/agent/bidBroadcaster.ts) any status other than 402 is
treated as a failed bid. Quotes are TTL'd 30s ([lib/shared/bidProtocol.ts](lib/shared/bidProtocol.ts))
and binding: `/execute` consumes the exact `quoteId` or returns 410.

The orchestrator calls these sibling routes over **real HTTP** via
[lib/agent/providerRegistry.ts](lib/agent/providerRegistry.ts), not direct function calls, so
the 402 round-trip stays genuine. That makes `NEXT_PUBLIC_APP_URL` (default
`http://localhost:3000`) load-bearing for anything deployed.

All four `callX` functions in [lib/providers/llmClients.ts](lib/providers/llmClients.ts) are
identical wrappers over one OpenRouter endpoint — the provider distinction is the model slug
and the pricing row, nothing more.

### State is entirely in-process

Everything in [lib/store/](lib/store/) is a module-level `Map` or `EventEmitter`: sessions,
settlements, quotes, payment-channel state, agent success/failure stats. Consequences:

- **The app must run as one persistent Node process.** Serverless/multi-instance deployment
  breaks the auction (quotes vanish between `/quote` and `/execute`) and the channel math.
- **Any restart resets everything**, including open payment channels — a `tsx watch`-style
  reload opens a *fresh* channel and burns another ceiling. Avoid editing files mid-demo.
- `saveSession()` is an intentional no-op; `getSession` hands back the live object that
  [lib/agent/safeguards/spendCap.ts](lib/agent/safeguards/spendCap.ts) mutates in place.

### XRPL settlement

Primary path is a Payment Channel ([lib/xrpl/paymentChannel.ts](lib/xrpl/paymentChannel.ts)):
one `PaymentChannelCreate` per provider opened lazily on first win, then per task an off-chain
cumulative claim signed and *locally verified* before submission, redeemed on-ledger by the
**provider's** wallet via `PaymentChannelClaim`. Any throw falls back automatically to a
discrete `Payment` ([lib/xrpl/paymentFallback.ts](lib/xrpl/paymentFallback.ts)) and publishes
`settlement.fallback` — so a broken channel path still produces a working demo, silently.

Invariants worth preserving:

- `withChannelLock(providerId, …)` serializes ensure-open + claim + state-update per provider.
  Settlement spans several `await`s; without the lock, concurrent tasks corrupt the cumulative
  claim math or double-open a channel.
- `SourceTag = 20260530` on every submitted transaction (XRPL AI Starter Kit convention).
- `client.autofill()` before signing, `submitAndWait` never bare `submit`.
- `assertMemoComplete()` throws before any submission if the audit payload is missing a field —
  no payment can leave without a decodable justification.
- Settlement uses the **quoted** cost, not actual usage, so the on-chain record always matches
  the auction decision it justifies.
- `usdToDrops` uses the static `XRP_USD_RATE` env value — illustrative, not a live oracle.

### Request flow and eventing

`POST /api/session/[id]/task` returns **202 immediately** and runs `runTask()` in the
background, reporting only over SSE (`/api/events`, [lib/store/eventBus.ts](lib/store/eventBus.ts)).
There is **no event replay** — anything that fails in the first milliseconds publishes to
nobody. Open the dashboard *before* submitting, and read the server terminal when a task
appears to hang.

## Known behavioral quirks (verified, not yet fixed)

- `price: 1 - cost/maxCost` pins the round's most expensive bidder to exactly 0. Anthropic is
  always the priciest, so **legal scores 0.00 on price every round**. A test in
  `scoringWeights.test.ts` asserts this as intended behavior.
- The deterministic prior ranks finance/Gemini first on every task shape tested, and the
  margin is almost entirely the `contextWindow` factor (Gemini's 1M window ratio-normalizes to
  1.0 while others land at 0.12–0.19). Zero that weight and technology/DeepSeek wins instead.
- `complexityScore` no longer influences routing — it is computed, sent to providers for the
  output-token estimate, and written to the memo, but `decide()` does not take it.
- The `wouldExceedCap` pause branch in the orchestrator is effectively unreachable:
  `budgetRemainingUsd` is already clamped to `capUsd - spentUsd` and the decision engine gates
  on it. The cap surfaces via `applySpend` on the *next* submission instead.
- `decodeMemoHex` in [lib/shared/memo.ts](lib/shared/memo.ts) has no callers — the dashboard
  renders the memo from the local event object, never read back from the ledger.
- The XRPL transaction hashes in the README were produced by driving the settlement modules
  directly, not by a live auction run.

## Repo conventions

- Comments explain *why*, not what, and are used sparingly on non-obvious trade-offs. Match
  that density; several modules document a deliberate decision in their header block.
- `@/*` path alias maps to the repo root.
- A project-scoped `Stop` hook in `.claude/settings.json` runs the XRPL hackathon feedback
  reflection on ~20% of turns. It injects an instruction via exit 2; that is expected, not an
  error. Config lives at `~/.xrpl-feedback-hook.json`.
