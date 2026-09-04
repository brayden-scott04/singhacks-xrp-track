# BidStream — Architecture

```
        ┌───────────────────────────┐
        │   Customer / Caller       │
        │  task + budget + hint     │
        └────────────┬──────────────┘
                      │ POST /session/:id/task
                      ↓
        ┌───────────────────────────┐
        │   Agent (src/agent)       │
        │  - complexity scorer      │
        │  - spend-cap check        │
        └────────────┬──────────────┘
                      │ POST /quote (parallel, per provider)
        ┌────────────┼──────────────┬────────────┐
        │ OpenAI     │  Anthropic   │ Gemini     │
        │ adapter    │  adapter     │ adapter    │
        │ 402 + quote│  402 + quote │ 402 + quote│
        └────────────┴──────┬───────┴────────────┘
                      │ compare bids
                      ↓
        ┌───────────────────────────┐
        │  Decision engine          │
        │  price × quality × budget │
        └────────────┬──────────────┘
                      │ POST /execute (winner only, real LLM call)
                      ↓
        ┌───────────────────────────┐
        │  XRPL settlement          │
        │  Payment Channel (primary)│
        │  → discrete Payment       │
        │    (automatic fallback)   │
        │  + audit Memo             │
        └────────────┬──────────────┘
                      ↓
        ┌───────────────────────────┐
        │  Dashboard (SSE)          │
        │  bids · winner · payment  │
        │  · memo · running spend   │
        └───────────────────────────┘
```

## Why an agent, not a human, does this

A human re-shopping three AI providers per request, then hand-approving a
micropayment for each one, doesn't scale past a handful of tasks a day. The
agent does both in milliseconds: it broadcasts the same bid request to every
provider in parallel, and it settles the winner over a pre-authorized XRPL
channel with no per-transaction human step. Remove the agent and the product
doesn't get slower — it becomes impossible to run at the volume it's meant
for.

## The 402-as-bid protocol

Each provider adapter (`src/providers/<name>/index.ts`, built on the shared
factory in `src/providers/common/createProviderServer.ts`) is a real local
HTTP server, not a mocked function call. `POST /quote` always answers **HTTP
402 Payment Required** — the 402 itself carries that provider's price-per-token
and quality signal for *this specific task*, both in response headers and a
JSON body. The quote is TTL'd and held in-memory (`quoteStore.ts`) so it's a
binding bid, not decoration: `POST /execute` rejects a stale or unknown
`quoteId` with 410.

The agent (`src/agent/bidBroadcaster.ts`) fires `/quote` at all three
providers in parallel with a timeout; a non-responding provider is excluded
from that round only (`bid.excluded`), never blocking the task.

## Decision engine

`src/agent/decisionEngine.ts` weighs price against quality based on task
complexity (`src/shared/complexity.ts` — a deterministic, local scorer: no
extra API call). A hard budget gate removes any bid over the customer's
remaining budget before scoring. See the formula and full rationale inline in
that file.

## XRPL settlement

- **Wallets** (`src/agent/xrpl/wallets.ts`): four testnet wallets — one agent
  payer, one receiver per provider — generated and faucet-funded by
  `scripts/setupWallets.ts`, seeds held only in the gitignored `.env` file per
  the XRPL Agent Wallet skill's non-negotiables (never logged, never written
  to a file the agent re-reads on its own initiative beyond `.env`).
- **Payment Channel (primary path)**, `src/agent/xrpl/paymentChannel.ts`:
  the agent opens one `PaymentChannelCreate` per provider, lazily on that
  provider's first win. Per task, the agent signs an off-chain, no-gas
  cumulative claim (`channelClaimCodec.ts`, the exact `CLM\0 + channelId +
  amount` byte layout `rippled`'s `channel_authorize`/`channel_verify` use)
  and verifies it locally before ever touching the network. The provider
  wallet then submits `PaymentChannelClaim` on-ledger with that signature —
  settled immediately after every task (not batched), so each task produces
  its own inspectable tx + memo for a demo/judging audience. Production would
  batch N tasks per on-ledger claim; this build makes that trade-off explicit
  rather than hiding it.
- **Discrete Payment (fallback path)**, `src/agent/xrpl/paymentFallback.ts`:
  a plain `Payment` transaction, auto-triggered if any channel operation
  throws, or forced via `SETTLEMENT_MODE=payment`. The dashboard visibly
  flags a `settlement.fallback` event when this happens.
- **Memo** (`src/shared/memo.ts`): every settlement — channel or fallback —
  carries a hex-encoded JSON memo: winning provider, its bid price, its
  quality score, the task's complexity score, and the decision's reason
  string. `assertMemoComplete()` throws before any submission if a field is
  missing, so no payment can leave without a self-justifying record attached.
- **USD → XRP**: providers quote in real published USD/token pricing
  (`src/shared/pricing.ts`); a static, clearly-labeled `XRP_USD_RATE` env
  value converts the winning bid to drops. This is illustrative, not a live
  oracle — out of scope for a one-day build.

## Safeguards

- **Spend cap** (`src/agent/safeguards/spendCap.ts`): per-session cap, warns
  at 90%, pauses at 100% and blocks further settlement until an explicit
  `POST /session/:id/resume`.
- **Provider timeout/exclusion**: a non-responding provider drops out of one
  round only; a zero-bidder round fails the task explicitly rather than
  hanging.
- **Memo-based audit**: see above — no external system is needed to answer
  "why did this cost what it cost."

## XRPL AI Starter Kit skill usage

This build follows the vendored `xrpl-agent-wallet` and `xrpl-payments`
skills (`skills/xrpl-agentic-resources/xrpl-dev-portal/...`) for wallet
hygiene and transaction-construction conventions: `SourceTag = 20260530` on
every submitted transaction, `client.autofill()` before signing,
`submitAndWait` (never bare `submit`), the transaction hash persisted before
submission, and testnet-by-default networking. One deliberate departure: the
wallet skill's signing ceremony assumes a human confirms each signature in a
chat session; BidStream is an autonomous, machine-speed payment agent by
design (the whole point of the pitch), so its equivalent of the skill's
"auto-sign override" is encoded as software policy — the spend cap and the
mandatory audit memo — rather than a per-transaction chat prompt.
