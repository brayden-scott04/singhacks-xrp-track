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
broadcasts a bid request to five real LLM providers (OpenAI, Anthropic,
Google, DeepSeek, Meta), each of which answers with a genuine **HTTP 402 Payment Required**
carrying its price-per-token and quality signal for that specific task — the
402 challenge *is* the bid. A decision engine picks a winner on
price-vs-quality-vs-remaining-budget, not just cheapest, executes the task on
the winner, and settles payment on the XRP Ledger via a Payment Channel
(falling back to a discrete Payment if the channel path fails). Every
settlement transaction carries a Memo recording the winning provider, its
bid, its quality score, and the task's complexity score — a self-contained,
inspectable justification for the spend.

Remove the agent and the product doesn't just slow down — it stops working:
no one re-shops five AI providers by hand per request, and no one approves a
sub-cent payment manually at that volume.

See [docs/architecture.md](docs/architecture.md) for the full diagram, the
402-as-bid protocol, the XRPL settlement design, and the safeguards.

## Setup

Requires Node 18+.

```bash
npm install
cp .env.example .env
```

If `npm install` fails trying to compile `better-sqlite3` (a `node-gyp`
error about missing Visual Studio / build tools — npm auto-runs `node-gyp
rebuild` for any package with a `binding.gyp`, even though this one already
ships a working prebuilt binary for common platforms), skip lifecycle
scripts and run esbuild's own installer directly instead:

```bash
npm install --ignore-scripts
node node_modules/esbuild/install.js
```

Fill in `.env`:

- `OPENROUTER_API_KEY` — all five bidding providers call OpenRouter's
  unified OpenAI-compatible endpoint with this one key. Get one at
  https://openrouter.ai/keys
- Leave the `XRPL_SEED_*` values blank, then generate and faucet-fund six
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
| Channel open (to `deepseek`) | `PaymentChannelCreate` | [`6FDF54641BE7C71EF6EF73FEBB2BF18667847995701F561BBB7498342F79BE30`](https://testnet.xrpl.org/transactions/6FDF54641BE7C71EF6EF73FEBB2BF18667847995701F561BBB7498342F79BE30) |
| Task 1 settlement | `PaymentChannelClaim` | [`92C72CEA0680E4CFE74BC2DBC6BFE1CDA7150334135F5C6AFC2B5E494D5E85B5`](https://testnet.xrpl.org/transactions/92C72CEA0680E4CFE74BC2DBC6BFE1CDA7150334135F5C6AFC2B5E494D5E85B5) |
| Task 2 settlement (cumulative claim, same channel) | `PaymentChannelClaim` | [`EB0F8B3F7FF00E1A3D64F8F8F70ED2C949E63446115C7D862E46FB4FDDCF0A3A`](https://testnet.xrpl.org/transactions/EB0F8B3F7FF00E1A3D64F8F8F70ED2C949E63446115C7D862E46FB4FDDCF0A3A) |
| Fallback settlement (forced via `SETTLEMENT_MODE=payment`) | `Payment` | [`BEBEAFAEA1BD182338FFA788A1A35B9FE610AA634B90A1E7FA084D316C11E6BC`](https://testnet.xrpl.org/transactions/BEBEAFAEA1BD182338FFA788A1A35B9FE610AA634B90A1E7FA084D316C11E6BC) |

These were produced by `npm run demo` and a follow-up forced-fallback run
against this build with real provider API keys and freshly funded testnet
wallets — a full live run, not a mocked or standalone settlement-module test.

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
