# BidStream

An AI agent that runs a live per-task auction among competing AI model
providers — using HTTP 402 responses as the bid — and settles payment to the
winner on XRPL, with every settlement carrying a Memo that records why that
provider won.

Built for the Ripple / SingHacks "AI-Native Business on XRPL" hackathon.

## Product overview

Teams running multi-model AI pipelines pick a provider once and stick with
it, regardless of whether a cheaper or better-fit provider is available for a
given task. BidStream's agent re-shops the market on every single task: it
broadcasts a bid request to three real LLM providers (OpenAI, Anthropic,
Google), each of which answers with a genuine **HTTP 402 Payment Required**
carrying its price-per-token and quality signal for that specific task — the
402 challenge *is* the bid. A decision engine picks a winner on
price-vs-quality-vs-remaining-budget, not just cheapest, executes the task on
the winner, and settles payment on the XRP Ledger via a Payment Channel
(falling back to a discrete Payment if the channel path fails). Every
settlement transaction carries a Memo recording the winning provider, its
bid, its quality score, and the task's complexity score — a self-contained,
inspectable justification for the spend.

Remove the agent and the product doesn't just slow down — it stops working:
no one re-shops three AI providers by hand per request, and no one approves a
sub-cent payment manually at that volume.

See [docs/architecture.md](docs/architecture.md) for the full diagram, the
402-as-bid protocol, the XRPL settlement design, and the safeguards.

## Setup

Requires Node 18+.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `OPENROUTER_API_KEY` — all three bidding providers call OpenRouter's
  unified OpenAI-compatible endpoint with this one key. Get one at
  https://openrouter.ai/keys
- Leave the `XRPL_SEED_*` values blank, then generate and faucet-fund four
  testnet wallets (one agent payer, one receiver per provider):

  ```bash
  npm run setup:wallets
  ```

  This appends the generated seeds directly to `.env` (never prints them) and
  reports each wallet's public address and starting XRP balance.

Then run the app:

```bash
npm run dev
```

Open the dashboard at `http://localhost:3000`, submit a task, and watch the
bids, the winning decision, the XRPL settlement, and the audit memo appear
live. Or run the scripted demo in another terminal:

```bash
npm run demo
```

`npm run demo` targets `http://localhost:3000` by default; point it at a
deployed URL with `DEMO_BASE_URL=https://your-deployed-app.example npm run demo`.

## Project structure

```
app/
  api/          Route Handlers: session CRUD, task submission (fire-and-
                forget background processing), the /events SSE stream, and
                one /quote + /execute pair per provider
  page.tsx      dashboard shell
  globals.css   dashboard styling
lib/
  shared/       task types, env loading, pricing table, complexity scorer,
                memo encoding, the 402 bid-protocol schemas
  providers/    one real HTTP handler pair per LLM provider (openai/
                anthropic/gemini), all built on a shared 402-quote/execute
                factory
  agent/        orchestrator, decision engine, bid broadcaster, spend-cap
                safeguard, provider URL resolution
  store/        in-process session/quote/payment-channel state and the
                event bus (same Maps/EventEmitter design as the original
                Express app, now shared across Route Handlers in this one
                Next.js process — see docs/architecture.md)
  xrpl/         wallet loading, Payment Channel + discrete Payment
                settlement, off-chain claim signing
components/     React dashboard (session bar, task form, live bid feed,
                settlement feed, audit memo view)
hooks/          useSSE — the dashboard's live-event subscription
scripts/        wallet setup, scripted end-to-end demo
docs/           architecture write-up
```

## XRPL transactions (testnet)

These verify the settlement mechanics end-to-end on real XRPL testnet —
channel open, off-chain claim sign + local verify, on-ledger
`PaymentChannelClaim`, and the discrete `Payment` fallback — each with a
decoded, matching audit memo:

| Transaction | Type | Hash |
|---|---|---|
| Channel open | `PaymentChannelCreate` | [`41F1261510C4540E9C8BBA8A8705C14A9D72154070C590999BD5848E6445A829`](https://testnet.xrpl.org/transactions/41F1261510C4540E9C8BBA8A8705C14A9D72154070C590999BD5848E6445A829) |
| Task 1 settlement | `PaymentChannelClaim` | [`F9C0EE9745214A0307213F88CF89209A522CDCF0F1F01B3B6EB648CD5B232AE5`](https://testnet.xrpl.org/transactions/F9C0EE9745214A0307213F88CF89209A522CDCF0F1F01B3B6EB648CD5B232AE5) |
| Task 2 settlement (cumulative claim, same channel) | `PaymentChannelClaim` | [`7B229A9AFBD2E2FA954F49380492D47106F3564E0D04BDD85F4DF1A2E2239E47`](https://testnet.xrpl.org/transactions/7B229A9AFBD2E2FA954F49380492D47106F3564E0D04BDD85F4DF1A2E2239E47) |
| Fallback settlement | `Payment` | [`62778130F69F985B0FE4016732C47C6D91300EDB8C8A6F72DE0516C53E81B37E`](https://testnet.xrpl.org/transactions/62778130F69F985B0FE4016732C47C6D91300EDB8C8A6F72DE0516C53E81B37E) |

These four were produced directly against the settlement modules while
provider LLM API keys weren't yet available in this environment. Once real
API keys are in `.env`, `npm run demo` or the dashboard produces fresh,
task-linked hashes for a full live run — replace the table above with those
for the final submission.

## Agentic payment flow (x402-as-bidding)

See [docs/architecture.md](docs/architecture.md#the-402-as-bid-protocol).
Each provider is a real local HTTP endpoint; `/quote` always returns 402 with
a TTL'd, binding price/quality quote for the specific task, and `/execute`
redeems that exact `quoteId` with a genuine call to the underlying model.

## XRPL AI Starter Kit usage

See [docs/architecture.md](docs/architecture.md#xrpl-ai-starter-kit-skill-usage)
for how this build follows the vendored `xrpl-agent-wallet` and
`xrpl-payments` skills, and the one deliberate departure (autonomous signing
in place of per-transaction chat confirmation, since autonomous payment is
the product).
