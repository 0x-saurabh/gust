# Kyte and Harmonic Agent: integration plan

Status as of 8 November 2026: **Phase 1 shipped** (indexer session poll, `/prices` and `/assets` carry `session`,
Market and Sell badges, MCP warnings, Autopilot gating). Phases 2 and 3 are still plans. Written from a read of
[harmonicagent.solutions](https://harmonicagent.solutions), its `skill.md` files, its MCP server and its public
JSON routes, plus the Kyte indexer, Autopilot spec and MCP tools.

## What Harmonic Agent is

An autonomous agent and a set of DeFi "desks" on Robinhood Chain (chain id 4663), run from an operations wallet
(`0xbAC08203fBB2273878B3e4bcE46dCEA3B41D799E`), with rules proved in Lean 4 by Harmonic's prover, Aristotle. Not an
options venue. Its brokerage "rail" explicitly refuses options orders, so there is no product overlap with Kyte.

The surfaces that matter to us, all public and keyless unless noted:

| Surface | What it is | Route |
|---|---|---|
| Session oracle | Per stock token: `halted`, `paused`, `unknown`, `held` (weekend), `stale`, `open`; issuer print and its age; the chain's own price. Written on chain to `HarmonicOracle` `0x938097252667b9efac600c8dd1826f54eae96881` on every verdict change and once a day. Free off chain. | `GET /api/oracle/equities` (all 203 rows), `GET /api/keeper/session/<SYMBOL>` |
| Session Signal | One answer for keepers: `canExec` true only when the row is fresh and reads open. Signed webhooks (HMAC-SHA256 over `timestamp.body`) on halt, reopen, close and weekend mark, up to 20 tokens per subscription. | `/api/keeper/session/<SYMBOL>`, webhook subscribe on the Session Signal tab |
| Weekend Mark | What each stock token actually traded at on chain Friday 20:00 to Sunday 20:00 New York, against Friday's print. | `GET /api/weekend` |
| Halt gate | `HarmonicHaltGate.sol`, one file to inherit in a v4 hook, lender or vault; `_requireOpen(token)` reverts during a halt. A contract reading the oracle pays 100 USDG a month (zero paid readers today). | `GET /api/oracle/gate` |
| Risk feed | `HarmonicRiskFeed` `0xd91e56a9999974a1319150cd6fa00bc87cc2d91d`: `markOf(token, minStatus)` returns a USD 1e8 mark and a status 0 to 10. **Not live-priced today**: writes are policy `paid`, nobody pays, 185 of 203 tokens read `quiet`. | `GET /api/riskfeed`, `/api/riskfeed/<SYMBOL>` |
| Atlas | Directory of every stock token on the chain: price, multiplier, lending limit, and flags `feed`, `perps`, `basket`, `borrow`, `depth`, each with links to Harmonic's own desks. | `GET /api/atlas`, `/api/atlas/<SYMBOL>` |
| Agent registry (MCP) | Streamable HTTP MCP at `/mcp/registry`: `registry_*` tools (file a directional call, get graded) and the `defi_*` reads above as tools, plus `rehearse` (0.25 USDG) and `ask` (1 USDG) paid through a compute escrow. | `{"mcpServers":{"harmonic-registry":{"type":"http","url":"https://harmonicagent.solutions/mcp/registry"}}}` |
| ERC-8004 | Agent identity on Robinhood Chain. Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa1…9b63`, Validation `0x8004Cc84…AB58`. Harmonic is agent #22514, file at `/.well-known/agent-registration.json`. | `GET /api/erc8004` |
| Seals | A capped ETH wallet for an agent (`hx_` key, per-tx and daily caps). Only ETH sends and token transfers, no contract calls. | `/api/seals/skill.md` |
| Solve, Frontier, World | Problem boards and a Lean 4 math tree for agents; wallet sign-in by nonce. | `/skill.md` |
| SDK | `harmonic-sdk` 0.1.0, not on npm, fetched as a tarball with a SHA-256. Plain `fetch`, no deps, one typed method per read above. | `/sdk/harmonic-sdk.tgz` |

## Why it matters to Kyte

Kyte lists roughly 200 Robinhood stock tokens (AAPL, NVDA, SPY, ...) with calls and puts enabled, and prices them
from Robinhood's Stock Token API in `indexer/src/index.mjs` (`pollQuotes`). Two gaps there:

1. **Halts are silent.** `if (qt.isTradingHalt) continue` drops the quote, so the last price simply stops updating.
   Market, Sell, Positions, the MCP `get_prices` tool and the Autopilot evaluator all keep treating that stale
   number as spot. Nothing in the UI says "halted".
2. **Weekends look live.** Friday 20:00 to Sunday 20:00 New York the issuer's print stands still while the token
   keeps trading on chain. Kyte shows Friday's print as the current price; Harmonic's Weekend Mark shows where the
   token really trades (SPY was 37 bps off Friday at the time of writing). A covered call written "20% above spot"
   on Saturday is priced off the wrong spot.

Harmonic already runs the session oracle, the keeper signal and the weekend mark for every one of those tokens, free
off chain. That is the integration: Kyte becomes session-aware for stock-token options without building its own
halt infrastructure. Everything else (distribution, identity, on-chain gates) is secondary and listed after.

## Phase 1: session awareness (indexer, site, MCP, Autopilot). No contracts. Shipped 8 Nov 2026.

What landed, for maintenance:

- `indexer/src/index.mjs`: `pollSession()` every 5 min (`SESSION_MS`, host `HARMONIC_URL`) reads
  `/api/oracle/equities` (203 rows) and `/api/weekend` (only while a hold is running), keeps rows in memory keyed by
  token address with a symbol fallback for Ondo `…on` tokens. `sessionOf()` is attached to every `/prices` and
  `/assets` row as `session: { state, why, until, at, issuerUsd, weekendMarkUsd?, offFridayBps? }`, `null` for crypto.
  First log line after boot: `[indexer] session oracle: 203 tokens { open: 1, held: 202 }`.
- `indexer/src/autopilot.mjs`: `list_*`, `buy_*` and `exercise` rules skip a stock token whose session is not `open`.
- `src/components/SessionBadge.tsx`: the pill and the one-line sentence; used on Market (header and under it) and
  Sell (warning note under the token, pill on the chart card). `Session` type in `src/lib/data.ts`; `useAssets()`
  copies `session` from `/prices`.
- `src/lib/agent/tools.ts`: `sessionWarning()`; `get_prices`, `list_tokens`, `find_offers`, `get_offer` (so
  `explain_offer` and `compare_offers` too) return `session` and `warning`; the four prepare tools put `warning`
  first in their result. Agent system prompt rule 6 and the MCP server instructions say what to do with it.
- Docs: "Halts and weekends" tile under Risks.

**Indexer** (`indexer/src/index.mjs`)

- New poll beside `pollQuotes`, every 5 minutes: `GET https://www.harmonicagent.solutions/api/oracle/equities`,
  one call, 203 rows under `bySymbol` with `verdict` and `writtenAt`. Store per symbol:
  `session` (`open | held | halted | paused | stale | unknown`), `sessionAt`, `sessionWhy`. Match by token address
  (the atlas gives `symbol -> address`; fetch `/api/atlas` once a day for the map), fall back to symbol for Ondo
  `…on` tokens the way `pollQuotes` already does.
- On weekends also poll `GET /api/weekend` and store `weekendMark` (USD) and `offFridayBps` per symbol.
- `/prices` gains `session`, `sessionAt`, `weekendMark` per token. `/assets` gains `session`.
- When a token reads `halted`, keep the last price but mark it; do not drop it the way `isTradingHalt` does now.
- Keep it to two JSON routes with plain `fetch`, not the SDK tarball: one more vendored, un-npm'd dependency is not
  worth two URLs. Time out at 10 s and keep the last good row on failure, same as `ethUsd()`.

**Website**

- Market, Sell, Positions, TokenPicker: a small badge next to stock-token prices, `Halted`, `Weekend hold`, `Stale`,
  with the oracle's sentence on hover. Sell page: when the token is not `open`, show a line under the strike input,
  "Spot is Friday's print; the token traded at $X on chain this weekend" or "Trading is halted; this spot may be
  stale", and link the Harmonic atlas row for that token.
- Docs: a short "Stock tokens, halts and weekends" block under Risks, naming the source.

**MCP server and agent** (`src/lib/agent/tools.ts`)

- `get_prices` and `list_tokens` return `session` per token. `find_offers`, `explain_offer`, `compare_offers`
  add a `warning` when the underlying is not `open`. `prepare_covered_call`, `prepare_cash_secured_put`,
  `prepare_buy`, `prepare_exercise` include the same warning in their preview text. No new tools; the 20 stay 20.
- Agent system prompt: "a stock token that is halted or in its weekend hold has no live spot; say so before any
  strike or premium judgement".

**Autopilot mode A** (`indexer/src/autopilot.mjs`)

- `list_call`, `list_put`, `buy_*` and `exercise` rules on a stock token only fire when the token's session is
  `open`. Held or halted tokens skip the cycle and the trigger text says why when the rule is next evaluated.
  This is Harmonic's `canExec` applied to our evaluator, using the row we already polled, so no extra call.

**Session Signal webhooks** (optional in this phase)

- Subscribe the Render indexer (`https://` URL required; private and loopback addresses are refused) for the 20
  stock tokens with the most open interest, events `halt`, `reopen`, `close`, `weekend mark`. Verify
  `x-harmonic-signature: v1=<hex>` as HMAC-SHA256 over `x-harmonic-timestamp + "." + rawBody` before acting.
  Polling `/api/oracle/equities` remains the source of truth; the webhook only shortens the lag on a halt.

Effort: 2 days indexer and site, half a day MCP and Autopilot, half a day webhooks. No new secrets except the
webhook HMAC secret (shown once at subscribe) in the indexer's env.

## Phase 2: distribution on Harmonic's agent surfaces

Mirrors what we did for HOL (`docs/HOL.md`) and Oak (`docs/OAK.md`).

1. **ERC-8004 identity for the Kyte MCP agent.** Register on the Identity Registry
   `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` from the ops Safe, pointing at
   `https://kyte.sh/.well-known/agent-registration.json` (registration-v1 shape, naming the agent id back, as
   Harmonic's rule requires). Serve the file from `public/.well-known/`, the same place as the HEY Research record.
   Harmonic's `/erc8004 <id>` bot command and `/api/erc8004` then resolve Kyte. Cost: one mint, gas only.
2. **Kyte MCP page: "Pair it with Harmonic".** A section beside "Run it under HOL Guard" in
   `src/components/mcp/McpPage.tsx`: the one-line config for `harmonic-registry`, and three example prompts that
   use both servers ("Is NVDA open right now, and what NVDA calls are on Kyte?"). Both servers are keyless and
   read-only at the default, so the pairing needs no account.
3. **Atlas listing.** Ask Harmonic (X `@HarmonicAgents`, Telegram `@HarmonicAgent_Bot`) to add an `options` flag
   and link per token to the atlas rows, the way `borrow`, `depth` and `perps` are there today. Give them one
   stable JSON route to read: add `GET kyte.sh/api/indexer/options/<SYMBOL>` returning open calls, open puts, best
   premium and a link to `kyte.sh/market?token=<SYMBOL>`. The existing `/api/indexer/assets` already lists every
   token we cover, so they can build the column without us.
4. **Agent registry.** Register the name `Kyte` (`kind: mcp`, url `https://kyte.sh/api/mcp`) with
   `registry_register`. It puts Kyte on their public board of agents, but the registry grades directional calls
   and Kyte files none, so it stays "in process with its counts" forever. Do it for the listing, expect nothing
   from the rank.

Effort: one day, plus the outreach.

## Phase 3: on-chain reads, only where Kyte needs a price on chain

- **Autopilot mode B** (`AUTOPILOT_SPEC.md`, open decision 2: "per-pool TWAP source for tokens other than $KYTE").
  Stock tokens have no Kyte pool and no TWAP. `IHarmonicRiskFeed.markOf(token, 9)` is the per-token on-chain mark
  that decision needs. Two blockers, both on Harmonic's side: the feed is not live-priced today (writes are paid
  and nobody pays), and a contract must be a paid reader of the oracle seat at 100 USDG a month. Revisit when the
  vault is real. Also note the unit mismatch: their mark is USD 1e8, Kyte strikes are wei of ETH, so the vault would
  need an ETH/USD feed on chain as well.
- **Halt gate in KyteHook.** Not applicable now: our hook sits on KYTE/WETH and test pools, not stock tokens. If
  Kyte ever runs a stock-token pool, inherit `HarmonicHaltGate` and call `_requireOpen(token)` in `beforeSwap`.
- **Gating exercise during a halt.** Deliberately not planned. Exercise settles at a fixed strike and does not read
  a price, and holders should always be able to exercise. Session awareness in Phase 1 is a warning, not a block.

## Not worth doing

- **Seals** as a wallet for Kyte agents: ETH sends only, no contract calls, so an agent cannot buy or write an
  option from a sealed wallet. Watch for a `call` route.
- **Harmonic's rail**: a proxy for Robinhood brokerage MCP accounts that refuses options orders. Unrelated to
  on-chain options.
- **Solve or World**: posting a bounty problem or entering a season is marketing, not integration. Skip unless
  there is a specific question we want a Lean-checked answer to.
- **`rehearse` of Kyte transactions**: 0.25 USDG per rehearsal of a prepared tx on their node. Our prepare tools
  already simulate with viem for free.

## Order and checkpoints

| # | Deliverable | Check |
|---|---|---|
| 1 | Indexer polls the session oracle and the weekend mark; `/prices` and `/assets` carry `session` | `curl kyte.sh/api/indexer/prices` shows `session: "held"` for every stock token on a weekend |
| 2 | Badges and Sell-page warning on the site | Open Sell for NVDA on a Saturday: "Weekend hold" badge, weekend mark shown |
| 3 | MCP warnings and Autopilot gating | `get_prices` for AAPL returns `session`; a `list_call` rule on AAPL does not fire while held |
| 4 | ERC-8004 identity and `.well-known` file | `GET harmonicagent.solutions/api/erc8004?id=<ours>` reads back `namesItBack: true` |
| 5 | MCP page section and atlas outreach | Section live on kyte.sh/mcp; message sent to Harmonic |
| 6 | Webhook subscription for the top 20 tokens | A halt on one of them lands in the indexer log within a minute |

## Open questions for Harmonic

- Will the atlas take a third-party `options` column, and from which route?
- Is `/api/oracle/equities` rate-limited for a 5-minute poll from one server?
- Any plan to turn the risk feed's on-chain writes back on without a paying reader? That decides Phase 3.
