# Integrations plan: FOBO, Factor, USDG rewards, private coins

Written 9 Nov 2026. Priority order as decided: (1) FOBO, (2) Factor, (3) USDG rewards, (4) ZEC / XMR.
Each section: what the partner is, what Kyte builds, files, open questions, a go/no-go line.

Grounding used: Kyte today lists 247 assets, 19 Pons tokens via the permissionless `PonsLister`, has a 20-tool
prepare-only MCP at `kyte.sh/api/mcp`, Autopilot mode A (watch and prepare), ERC-8004 agent #22541, fee split
30/20/50 (stakers / burn / ops). Protocol volume so far is tiny (0.0057 ETH, 13 offers), so every item below is
judged first on "does it bring order flow", second on effort.

---

## 1. FOBO (fobo.fun) — must do

**Status 9 Nov 2026: built.** `FoboLister.sol` (16 unit tests, fork test on mainnet), `indexer/src/fobo.mjs`, keeper job, Launchpad FOBO tab, floor line and below-floor badges, MCP `list_graduated launchpad=fobo`. Left: run `scripts/mainnet/fobo-lister.sh` (deploy + Safe role grant), then push so Render redeploys. Details: `docs/FOBO_LISTER.md`.

### What FOBO is
Token launchpad on Robinhood Chain built on Uniswap v4 (`FoboHook` owns every pool). Facts from
`github.com/fobodotfun/contracts` (MIT, Coinsult audit 30 Oct 2026, 377 tests):

- One `FoboToken` per launch, fixed 1e9 supply, 18 decimals. `FoboFactory.TokenLaunched(token, poolId, creator, quote, name, ticker, uri)`.
- **No bonding curve, no graduation.** Full supply is placed as v4 liquidity at launch; no LP token; hook has no owner/withdraw.
- **Rising floor:** a single-tick wall under price, sized to buy back every token outside the pool, raised once per block, only up. Events `FoboHook.FloorRaised`, `FoboHook.BoughtBack`.
- Swap tax 2.5% on the quote side (1.5 floor / 0.6 creator / 0.4 protocol). First 60 s: tax decays 90% to 2.5%.
- Quote assets: ETH, $FOBO, USDG, and stock tokens MSFT TSLA SPCX GOOGL AMZN AAPL NVDA META.
- `FoboRevenue` splits the protocol fee between **partners, referrers and team**. Referral = `tx.origin`.
- Governance: 2-of-3 Safe, 48 h timelock on buyback funds, `FoboFactoryGate` gates quote tokens.
- Sells fill fully or revert `PartialFill`. First swap in a floor-raise block needs ~1.2M gas.

Mainnet (4663): FoboHook `0x0Af57F62982D03066ef917AcAd87F771c06528Ec`, FoboFactory `0xd7e538e98A208fD19e46bc549FF4710C33664e18`,
PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`, FoboRevenue `0x8819036A0f6940285b6ea6D6B80cdC702ce8CB54`,
FoboLimitOrders `0x3126f62d604a0AA2de8788e3eC21dDd8F2a2f82a`, $FOBO `0x000de658153f47f23e92973c8eb1e89762703676`.

### Why it fits Kyte
Pons tokens are already on Kyte (24 h options). FOBO is the second launchpad on the chain and its floor is a
feature no other underlying has: **a put struck at or below the floor can never finish in the money**, and a put
struck just above the floor has bounded downside for the writer. That is a story only Kyte can tell, and it is a
reason for FOBO traders to come to kyte.sh.

### What we build (mirror the Pons path)

| Layer | Pons today | FOBO |
|---|---|---|
| Indexer | `indexer/src/pons.mjs` watches factories, graduation, quotes; `/pons/tokens` | new `indexer/src/fobo.mjs`: watch `TokenLaunched`, PoolManager `Initialize`/`Swap` where hook = FoboHook, `FloorRaised`; `/fobo/tokens` with price, floor, quote asset, age, quote liquidity |
| Listing contract | `contracts/src/PonsLister.sol` (graduated + WETH pair + locker) | new `contracts/src/FoboLister.sol`: same timelock-role pattern, checks (a) pool exists in FoboHook for the token, (b) quote is native ETH, (c) age ≥ 24 h, (d) quote-side liquidity ≥ 4.2 ETH equivalent (same bar as Pons graduation), (e) 18 decimals, (f) not listed. Cap 2% of supply, minStrike 1e12. |
| Keeper | lists and executes Pons automatically | same loop for `/fobo/tokens` eligible set |
| Asset rule | `assetRule()` → `source: 'pons'`, 24 h max expiry | `source: 'fobo'`, 24 h max expiry at launch (can be raised to 7 d later because the floor bounds put risk) |
| MCP | `list_graduated` (Pons only) | extend to `launchpad: 'pons' | 'fobo'` and return `floorEth`; add `floor` to `get_prices` and `get_chart` for fobo tokens |
| UI | `/launchpad` Pons cards | second tab FOBO; chart shows the floor line; put offers with strike ≤ floor get a "below floor, cannot finish ITM" badge; the Sell page refuses to list a put at or below the floor (UI only, contracts stay oracle-free) |
| Autopilot | Pons tokens limited to 24 h | same; new optional param on `list_put`: `strikeAboveFloorPct` |

Price source: v4 `Swap` events, same as the pools already in `deployments.pools`, so no new quote code.
Floor source: `FloorRaised` (confirm the tick/price field in `abi/FoboHook.json`).

Verified on chain (Sourcify ABIs for FoboHook and FoboFactory, 9 Nov 2026), so `FoboLister` needs no allowlist:
- `FoboHook.keyFor(quote, token) -> PoolKey` and `FoboHook.pools(poolId) -> (token, creator, launchedAt, tickStart, tickF, …, pot, reserve)`.
  Proof of origin = `pools(keccak(keyFor(address(0), token))).token == token`; age = `launchedAt`; quote-side depth = `reserve` / `pot` (confirm which is the floor reserve in source).
- `FoboHook.floorOf(key) -> (tickF, sqrtPriceX96, circulating)`: the floor price for the UI line and the "below floor" badge; also the one view the indexer polls per block batch instead of replaying `FloorRaised`.
- `FoboFactory.quotes(quote) -> (allowed, bandLow, bandHigh, decimals)`, `FoboFactory.predictToken(...)`, `hook()`, `poolManager()`.
- Native ETH quote is `address(0)` in the key; PonsLister's "WETH pair" check becomes `key.currency0 == address(0)`.

Still open:
1. USDG / stock-token quoted pools: phase 2. Price = pool price × quote/ETH (USDG/ETH from Coinbase, stock from the Robinhood quote API already in `pollQuotes()`).
2. Whether `pools().reserve` is in quote units (needed for the 4.2 ETH depth check); read `FoboHook.sol` once.

### Business side (ask FOBO)
- A **partner slot in `FoboRevenue`** for Kyte, since referral goes to `tx.origin` and cannot credit a frontend. Pitch: kyte.sh/launchpad sends buy/sell flow into FOBO pools.
- A "Kyte options" link on each fobo.fun token page (as Pons has).
- Co-post when live. We do not know yet what their DM asked for; read it and map it onto the table above before replying.

### Effort and order
~4 to 6 days. Order: indexer feed (1 d) → UI floor line + badge (1 d) → FoboLister + 14 unit tests + fork test (2 d) → roles via Safe, keeper, MCP (1 d). Ship the indexer/UI read-only parts first; listing can run manually through the existing `v2-extra-tokens.json` timelock path on day 2 so the first FOBO tokens are tradeable before the lister is audited.

Go: yes. Zero custody change, reuses a shipped pattern, new story (floor puts).

---

## 2. Factor (factoragents.fun) — they reached out

### What Factor is
Credit layer and job desk for AI agents on Robinhood Chain. Facts from factoragents.fun/docs and `github.com/FactorAgents/factor`
(MIT, **no outside audit**, contracts have no owner/pause/upgrade):

- Customer `hire({agent, price, title, brief, dueInHours})` locks ETH on `FactorDesk`. Agent `deliver(jobId, proof)` records a hash. Customer has 24 h to `accept` / `reject` (reject settles at half). Anyone can `settle` after 24 h. Refund after `dueAt + 12h` if undelivered.
- Agent may `draw` up to 50% as an advance (we will not; nothing to pre-fund).
- Fees: 2% desk fee, +1% burn paid by customer. Payments in ETH only.
- SDK `factor-kit` (TypeScript): `Factor.connect({privateKey, gasless})`, `register()`, `profile({name, does})`, `jobsForMe()` async iterator, `deliver()`. Gasless mode lets a key with no ETH register and act through a `FactorAccount`; Factor pays gas, 40 calls/day.
- MCP: 93 tools locally, remote read-only at `https://factoragents.fun/mcp` with `factor_ask` (turns a sentence into a job and links to hire). This is the "shows up inside Claude/Cursor" part.
- **ERC-8004:** `linkErc8004(agentId)` links an existing identity with one signature, no gas. Factor then writes one reputation entry per settled job (score 100 full / 50 half, tag `factor`). We are already agent #22541, so Kyte's on-chain reputation starts accruing from job one.
- Factor Score 0–1000 from fees, distinct customers, jobs paid, age, advances repaid.
- "Factor everywhere": `GET /api/v1/everywhere/agent/8004:22541` returns a signed score card; `embed.js` badge.

### The Kyte options agent (design)
Principle unchanged: **the agent never holds customer funds and never signs for a customer.** A Factor job's
deliverable is a research + prepared-action package: ranked offers, a plain-English rationale, and kyte.sh links
the customer signs in their own wallet. That is exactly what the MCP prepare tools already produce.

Job menu (the `does` string on the Factor profile, and what `factor_ask` matches on):
1. "Find the best put/call offers on <token>" → `find_offers` + `compare_offers` + `explain_offer`.
2. "Set up a covered call on my <token>" → `get_positions(address)` + `prepare_covered_call` (strike/expiry heuristics from `design_strategy`).
3. "Cash-secured put on <token> at <x>% below spot" → `prepare_cash_secured_put`.
4. "Explain my Kyte positions / what expires" → `get_positions` + `get_activity`.
5. "Autopilot rule for <intent>" → `design_strategy` → `/autopilot?rule=` link.
6. Out of scope → `decline(jobId)` before any draw (no penalty).

Runtime:
- New dir `agents/factor/` (Node 22, ESM): `index.mjs` loop over `jobsForMe()`, `brief.mjs` (classify the brief into one of the six jobs; use the existing Claude call path from `src/app/api/agent/route.ts` extracted into a shared lib, or Factor's `askModel` as fallback), `run.mjs` (calls the Kyte tool functions from `src/lib/agent/tools.ts` directly, no HTTP hop), `deliver.mjs` (markdown + JSON, `keccak256` on chain, full text stored by Factor's `deliver`).
- Hosted as a Render worker `kyte-factor-agent` next to `kyte-keeper-v2`. Env: `FACTOR_PRIVATE_KEY` (fresh key, `gasless: true`, holds only earned ETH), `FACTOR_MAX_JOB_ETH` unused (we never hire), `INDEXER_URL`.
- Sweep earned ETH to the ops Safe weekly (keeper job).
- Guard: reuse the HOL Guard policy (`scripts/hol/guard/`) as the prompt-injection boundary; a brief is untrusted text. Reject any brief that asks for signing, keys, or transfers.
- Link identity once: `linkErc8004(22541)` signed by the ERC-8004 owner key (the one in `scripts/mainnet/erc8004-register.sh`).
- Price: start 0.002 ETH per job (about the cost of one Claude call plus margin). Raise with Factor Score.

Marketing hooks:
- kyte.sh/mcp page: add a "Hire Kyte on Factor" card with the `embed.js` score badge.
- Kyte agent (Ask Kyte) answers "how do I hire you" with the Factor link.
- Joint post when the first job settles; Factor's `builder_record` tool can show it.

Effort: 2 to 3 days (agent loop 1 d, brief classifier + six jobs 1 d, Render + link + docs 0.5 d). Tests: `tests/factor-agent.test.ts` with recorded briefs.

Risks: Factor contracts are unaudited; our exposure is only unpaid jobs (we never deposit). A rejected job settles at half, so keep deliverables tight and refuse vague briefs. ETH-only pricing is fine.

Go: yes, after FOBO read-only parts land. Low effort, new distribution channel (every Factor MCP user), and it starts filling Kyte's ERC-8004 reputation.

### Draft reply to Factor (send from the Kyte account)
> Thanks, and yes. We'll put a Kyte options agent on the desk. It'll take jobs like "best puts on NVDA", "covered call on my TSLA", "cash-secured put 10% below spot", and deliver ranked offers plus pre-filled kyte.sh links the customer signs in their own wallet — same non-custodial model as our MCP, the agent never touches funds. We'll link it to our ERC-8004 identity (#22541) so reputation accrues on chain. Two asks: (1) confirm `profile().does` is what `factor_ask` matches on so we can word the job menu well, (2) a sample brief or two from real customers so we tune the classifier. Target: live within two weeks of your go-ahead; we'll co-post when the first job settles.

---

## 3. USDG rewards to users

**Status 9 Nov 2026: built.** `UsdgRewards.sol` (9 tests, JS tree verified on chain), `indexer/src/rewards.mjs` + `merkle.mjs` (3 tests), keeper publish/sweep job, `/rewards` page, MCP `get_rewards`. Left: `scripts/mainnet/usdg-rewards.sh`, set `REWARDS_POOL_USDG` on the Render indexer, Safe funds the contract. Details: `docs/USDG_REWARDS.md`.

### Framing
"USDG rewards" can mean two things. Both are covered; only the first is in scope now.

**(a) Kyte pays users USDG** for trading on Kyte. In scope.
**(b) Kyte earns USDG yield from Paxos** (Global Dollar Network partner rewards: monthly payout on USDG held at
registered monitoring addresses, requires institutional onboarding at dashboard.paxos.com with KYC and a commercial
agreement). Kyte holds no USDG today and settles in WETH, so this only matters once a USDG-collateral put market
exists. Parked; see the end of this section.

### Where the USDG comes from (for a)
- The ops 50% of fees (`FeeVault` split) is WETH. Swap a fixed slice (start: 50% of ops, i.e. 25% of fees) to USDG weekly. At today's volume that is nothing, so seed the first epochs from treasury: propose **2,000 USDG/week for 8 weeks**, announced as a fixed pool so the APR is visible.
- Apply for a Robinhood Chain / Paxos ecosystem grant in parallel; the pitch is "first options venue paying USDG".

### What earns points (per 24 h epoch, already the protocol epoch)
Weighted by **fees actually paid**, because fees are real cost and the simplest sybil filter:

| Action | Points |
|---|---|
| Premium paid as buyer | 1 per 0.0001 ETH of fee |
| Premium received as seller (offer filled) | 1 per 0.0001 ETH of fee |
| Open interest held through the epoch snapshot | 0.2 per 0.0001 ETH of collateral-equivalent fee |
| Cash-secured put written on a stock token (puts are what Kyte wants more of) | ×1.5 multiplier |
| Self-fill (buyer == seller, or same Privy user) | 0 |

Epoch pool is split pro rata. Points are computed in the indexer from events it already indexes, so no new
on-chain reads.

### Distribution contract
`contracts/src/UsdgRewards.sol`: Merkle distributor (OpenZeppelin `MerkleProof`), one root per epoch, `claim(epoch, amount, proof)`,
funded by the ops Safe, `setRoot` by the keeper key with a 24 h delay via the existing timelock so a bad root can
be stopped. USDG is 6 decimals (`0x5fc5360D…1d168`). Unclaimed after 90 days returns to the Safe.

- Keeper job `rewards-root`: compute points → build tree → store tree JSON in the indexer (`/rewards/epoch/:n`) and commit roots to `contracts/deployments/rewards-4663.json`.
- UI `/rewards`: claimable, history, this epoch's live estimate. Add to the proof page.
- MCP: `get_rewards(address)`; Autopilot badge "you earned X USDG".
- Dune: one query over `Claimed` events on the Kyte dashboard.
- Check the separate `../rh-rewards` app first; if it already has a points engine, reuse its schema instead of writing a second one.

Effort: contract + tests 1.5 d, keeper + indexer 1.5 d, UI 1 d. Go once FOBO and Factor are live, because rewards
without order flow just pay the four stakers.

### Parked: USDG as collateral
Strike and premium in USDG would need a second put market (`PutMarketUSDG`) with a USDG `FeeVault` leg. It is the
only route to GDN partner rewards and to dollar-denominated strikes for stock tokens. Scope it after rewards (a)
shows demand. Note: the seat on Harmonic's oracle is also priced in USDG, so a small USDG treasury is needed anyway.

---

## 4. Private coins: ZEC and XMR

### Constraint
Kyte settles physically and reads no oracle, so an underlying must be an **ERC-20 on Robinhood Chain with a
price feed the indexer can read** (a v4 pool, or an API in `pollQuotes()`). A wrapped asset is transparent on
chain; the privacy of the native coin does not carry over, and we should say so on the market page.

### ZEC: feasible via WZEC
`wrappedz.cash` runs WZEC (ERC-20, ZEC locked with a custodian, Chainlink proof-of-reserve, Cyfrin audit, live on
Ethereum, Arbitrum listed as supported). Steps:
1. Bridge WZEC Ethereum → Robinhood Chain through the Arbitrum bridge portal (Robinhood Chain is an Orbit L2 on Ethereum). This creates the canonical bridged ERC-20; record its address.
2. Seed a WZEC/WETH Uniswap v4 pool (even 1 to 2 ETH deep) so the indexer gets swap-event prices. Alternative for price only: add a Coinbase/Kraken `ZEC-USD` fetch to `pollQuotes()` next to the ETH/USD fetch; cheaper, and sufficient for the UI since settlement never uses it.
3. List through the timelock: add to `scripts/mainnet/v2-extra-tokens.json` (`WZEC`, address, capUsd ~25k) and run `list-trending.sh`; enable puts.
4. Add the pool key under `pools` in `contracts/deployments/4663.json`, `pnpm sync`.
5. Market page note: "WZEC is a transparent wrapped claim on ZEC held by the WZEC custodian."
Effort: 1 day of work plus bridge time, assuming WZEC redeem/mint minimums are reachable. Confirm first that no
WZEC is already bridged to 4663 (check the explorer for the token name).

### XMR: not feasible as a physical market today
There is no credible, live wrapped Monero on EVM in 2026: BTSE's WXMR (2021, custodial) is dormant; the rest are
hackathon projects (Hooked Monero, sXMR, xmrp2p). Options:
- **Wait** for a maintained wrapped XMR, then follow the ZEC steps. Recommended.
- **Cash-settled XMR index options** (strike and settlement in WETH against an XMR/USD price). This breaks "no oracle" and needs a separate market contract and an oracle source (Chainlink has no XMR feed on 4663; a Harmonic-style attestation or a 3-of-5 CEX median keeper would be needed). Only do this as a clearly separate product line, and only if there is demand we can see.

### Compliance note
Robinhood Chain positions itself around tokenized RWAs. Listing a wrapped privacy coin is permissionless on Kyte's side, but check with the Robinhood Chain ecosystem contact before announcing, so a listing does not cost us the stock-token relationship.

Go: ZEC yes (one day, low risk). XMR no for now; revisit quarterly.

---

## Sequencing summary

| Week | Work |
|---|---|
| 1 | FOBO indexer feed, floor line, badges, first FOBO tokens listed manually via timelock. Reply to Factor. |
| 2 | FoboLister + tests + Safe role grant; Factor agent loop + six jobs on Render; ERC-8004 link. |
| 3 | FOBO and Factor go-lives and co-posts. USDG rewards contract + keeper. WZEC bridge and listing. |
| 4 | Rewards UI + first epoch funded. Review `../rh-rewards` overlap. |

Decisions still needed from Saurabh: (1) what FOBO's DM actually asked for, (2) the USDG weekly pool size, (3) whether to price Factor jobs at 0.002 ETH.
