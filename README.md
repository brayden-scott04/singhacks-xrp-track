# BidStream

Every task you submit is auctioned live among five AI agents. Each one bids
with a real **HTTP 402 Payment Required** response, a decision agent picks the
winner, the task runs on that winner, and payment settles on the XRP Ledger
carrying a Memo that records *why* it won.

Built for the Ripple / SingHacks "AI-Native Business on XRPL" track. Testnet only.

![The BidStream dashboard: a task submission form on the left with complexity
and budget controls, and the live audit memo and XRPL settlement panels on the
right.](docs/dashboard.png)

## Why

Teams wire up one model provider and never revisit the choice. BidStream
re-shops the market on every single request, pays sub-cent amounts
autonomously, and leaves an auditable justification on-ledger for each spend.
Neither half works without the agent: nobody hand-compares five providers per
request, and nobody manually approves a $0.0003 payment at that volume.

## How a task flows

`POST /api/session/<id>/task` returns **202** immediately and runs the whole
round in the background, reporting only over SSE.

1. **Broadcast.** The orchestrator calls all five agents' `/quote` routes over
   real HTTP. Each returns **402** carrying its price per input/output token,
   quality, knowledge, speed, load, and context-window signals for that
   specific task. The 402 *is* the bid; any other status is a failed bid.
   Quotes are binding and TTL'd 30s.
2. **Decide.** Seven factors are normalised to 0-1 against the round (higher
   always better) and blended on fixed weights into a composite prior. The
   remaining budget is a hard gate: a bid above it scores 0 and cannot win.
   A decision agent (`openai/gpt-4.1-mini`, a notch stronger than any bidder)
   then reads the task text alongside the scored candidates and may override
   that prior. If it fails for any reason (no key, timeout, bad JSON, unknown
   winner, fewer than two candidates) the top composite wins silently.
3. **Execute.** The winner's `/execute` route redeems that exact `quoteId` (a
   stale or reused one gets 410) and calls the real model.
4. **Settle.** Payment goes out on XRPL through a Payment Channel: one per
   agent, opened lazily on first win, then a cumulative off-chain claim signed
   and locally verified per task before on-ledger redemption. Anything that
   throws falls back automatically to a discrete `Payment`. Every transaction
   carries a Memo with the winner, its bid, all seven factor scores, the task
   complexity and the winning reason, and `assertMemoComplete()` refuses to
   submit an incomplete one.
5. **Answer.** Only then is the output returned. Payment before answer is
   deliberate, and the UI is built in that order.

Event order on the stream: bids, `decision.made`, `settlement.started`,
(`settlement.fallback`), `settlement.confirmed`, `session.*`, `task.completed`.

## The five agents

Each industry agent is backed by one model. All five bid on every task
regardless of subject, and the providers never see the industry framing. Only
the decision agent, reading the task text next to the labels, makes routing
domain-aware.

| Agent | Provider | Model | Context |
|---|---|---|---|
| Legal | Anthropic | `anthropic/claude-haiku-4.5` | 200K |
| Healthcare | OpenAI | `openai/gpt-4o-mini` | 128K |
| Finance | Google | `google/gemini-2.5-flash-lite` | 1M |
| Technology | DeepSeek | `deepseek/deepseek-chat` | 164K |
| General | Meta | `meta-llama/llama-3.3-70b-instruct` | 128K |

Decision weights: quality 0.25, error rate 0.20, price 0.20, knowledge 0.15,
context window 0.10, speed 0.06, load 0.04. Error rate is a live rolling rate
per agent once it has five executions, and a seeded 2% baseline before that.

## Quick start

Requires Node 18.18+.

```bash
npm install
cp .env.example .env
# add your OPENROUTER_API_KEY to .env
npm run setup:wallets   # generates + faucet-funds 6 XRPL testnet wallets
npm run dev             # http://localhost:3000
```

`setup:wallets` funds one payer wallet plus one receiver per provider, appends
the seeds to `.env` without ever printing them, and skips any key already set.

Open the dashboard **before** submitting a task. There is no event replay, so
anything that fails in the first milliseconds publishes to nobody. When a task
looks stuck, read the server terminal.

Or drive it headlessly, with `npm run dev` already running:

```bash
npm run demo            # 3 scripted tasks, prints each auction + settlement
DEMO_BASE_URL=https://your-app.example npm run demo
```

If `npm install` dies compiling `better-sqlite3` (a `node-gyp` error about
missing build tools, even though a working prebuilt binary ships), skip
lifecycle scripts and run esbuild's installer directly:

```bash
npm install --ignore-scripts
node node_modules/esbuild/install.js
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | none | One key for all five bidders and the decision agent ([get one](https://openrouter.ai/keys)) |
| `XRPL_SEED_AGENT` | none | Payer wallet; `setup:wallets` fills it |
| `XRPL_SEED_PROVIDER_*` | none | One receiver per provider (openai, anthropic, gemini, deepseek, meta) |
| `XRPL_NETWORK` | testnet altnet | XRPL websocket endpoint |
| `SETTLEMENT_MODE` | `channel` | `channel` (with automatic `payment` fallback) or forced `payment` |
| `XRP_USD_RATE` | `0.50` | Fixed illustrative rate, not a live oracle |
| `SESSION_SPEND_CAP_USD` | `2.00` | Per-session cap; warns at 90%, then pauses |
| `PROVIDER_QUOTE_TIMEOUT_MS` | `8000` | A bidder slower than this is excluded from the round |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Base URL the orchestrator uses to reach the provider routes over real HTTP |

Env is validated with zod at import, so a bad value fails fast rather than at
settlement time.

## Screens

- **`/`** live dashboard: task form, one card per agent filling in as bids
  land, the factor bars and the decision, the settlement with its explorer
  link, the decoded memo, and a session spend bar with resume.
- **`/history`** every task ever run, kept in SQLite across restarts, filtered
  by status, agent, session or text, with win-rate and spend stats. The detail
  panel can re-fetch the settlement transaction from the ledger and show
  whether the on-chain memo matches the copy stored locally.

## API

```
POST /api/session                   create a session (optional capUsd)
GET  /api/session/<id>              session state + settlements
POST /api/session/<id>/task         submit a task -> 202
POST /api/session/<id>/resume       clear a spend-cap pause, optionally raising it
GET  /api/events                    SSE stream of every auction event
POST /api/providers/<id>/quote      always 402: the bid
POST /api/providers/<id>/execute    redeem a quoteId; 410 if expired
GET  /api/history                   paged, filterable task history
GET  /api/history/stats             aggregate spend and per-agent win rates
GET  /api/history/<taskId>          one full record
GET  /api/history/<taskId>/memo     re-read the memo off-ledger and verify it
```

## Layout

```
app/api/               the route handlers listed above
app/page.tsx           live dashboard      app/history/page.tsx   history
lib/agent/             orchestrator, bid broadcaster, decision engine,
                       LLM decision model, industry registry, spend cap
lib/providers/         one 402 quote/execute factory + OpenRouter clients
lib/shared/            types, env, pricing, complexity, memo, scoring weights
lib/store/             in-process session/quote/channel state, event bus,
                       agent stats, SQLite history
lib/xrpl/              wallets, payment channels, claim codec, payment fallback
components/            dashboard and history UI
scripts/               wallet setup, scripted demo
docs/architecture.md   full write-up
```

## Operational notes

- **Run it as one persistent Node process.** Sessions, quotes and channel
  state live in in-process Maps anchored on `globalThis`. Serverless or
  multi-instance breaks quote redemption and the cumulative claim math.
- **Any restart resets that state**, open payment channels included. An HMR
  reload opens a fresh channel, so don't edit files mid-demo. Task history is
  the exception: it persists to `data/history.db`.
- Settlement uses the *quoted* cost, not actual token usage, so the on-chain
  record always matches the auction decision it justifies.
- Every transaction carries `SourceTag 20260530`, is autofilled before signing
  and submitted with `submitAndWait`.

## Commands

```bash
npm run dev         # dev server: dashboard + all API routes
npm run build       # production build
npm test            # vitest run
npm run typecheck   # tsc --noEmit
npm run setup:wallets
npm run demo
```

## On-chain proof (testnet)

From a real `npm run demo` run plus a forced-fallback run, not a mocked
settlement test. Each has a decoded, matching audit memo.

| What | Type | Transaction |
|---|---|---|
| Channel open (to `deepseek`) | `PaymentChannelCreate` | [`6FDF5464...79BE30`](https://testnet.xrpl.org/transactions/6FDF54641BE7C71EF6EF73FEBB2BF18667847995701F561BBB7498342F79BE30) |
| Task 1 settlement | `PaymentChannelClaim` | [`92C72CEA...D5E85B5`](https://testnet.xrpl.org/transactions/92C72CEA0680E4CFE74BC2DBC6BFE1CDA7150334135F5C6AFC2B5E494D5E85B5) |
| Task 2, cumulative claim on the same channel | `PaymentChannelClaim` | [`EB0F8B3F...CF0A3A`](https://testnet.xrpl.org/transactions/EB0F8B3F7FF00E1A3D64F8F8F70ED2C949E63446115C7D862E46FB4FDDCF0A3A) |
| Forced fallback (`SETTLEMENT_MODE=payment`) | `Payment` | [`BEBEAFAE...C11E6BC`](https://testnet.xrpl.org/transactions/BEBEAFAEA1BD182338FFA788A1A35B9FE610AA634B90A1E7FA084D316C11E6BC) |

## More

- [docs/architecture.md](docs/architecture.md) for the full diagram, the
  [402-as-bid protocol](docs/architecture.md#the-402-as-bid-protocol), the
  [settlement design](docs/architecture.md#xrpl-settlement) and the
  [safeguards](docs/architecture.md#safeguards).
- [XRPL AI Starter Kit usage](docs/architecture.md#xrpl-ai-starter-kit-skill-usage):
  how this follows the vendored `xrpl-agent-wallet` and `xrpl-payments` skills,
  and the one deliberate departure (autonomous signing instead of
  per-transaction confirmation, since autonomous payment is the product).
- [CLAUDE.md](CLAUDE.md) for conventions and known quirks.
