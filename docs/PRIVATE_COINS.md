# Private coins on Kyte: ZEC and XMR integration plan

Written 9 Nov 2026. Supersedes section 4 of `docs/INTEGRATIONS_PLAN.md`, whose WZEC assumption turned out to be
wrong (see "What changed" below). Everything on chain was read live today; items marked *unverified* were not
confirmed from a primary source.

---

## 0. Summary

| | ZEC | XMR |
|---|---|---|
| Wrapped token on Robinhood Chain (4663) today | none | 0.0148 WXMR test-bridged from BTSE's dead 2021 wrapper (`0x6c989d6c9532dbc0397f180e5c6bbccadf8b9c4d`); unusable |
| Credible wrapper anywhere | **cbZEC** on Base only (`0xB2000000000000000000008501b13360000cb2EC`, 8 dec, 17.9k ZEC backed by Coinbase Custody) | none, anywhere on EVM |
| Price feed on 4663 | **Pyth** ZEC/USD (pull) yes; Chainlink no | **Pyth** XMR/USD (pull) yes; Chainlink no |
| Physical market (today's contracts) | blocked until a wrapper lands on 4663 | blocked indefinitely |
| Cash-settled market (new contract) | possible now | possible now |

Decision proposed:

1. **Track A (ZEC physical, ~half a day of code + outreach):** prepare the existing listing path so a wrapped ZEC
   can be listed the day it reaches 4663, and ask Coinbase and the Robinhood Chain team for cbZEC on Robinhood
   Chain. Nothing to deploy today.
2. **Track B (ZEC + XMR cash-settled, ~3 weeks + audit):** a separate product line, "Kyte Index", fully
   collateralised in WETH, settled against Pyth at expiry. Only start if we want privacy coins badly enough to
   accept an oracle in one market family. XMR has **no other path**.
3. Do not list the legacy WZEC (430 tokens, trades at ~40% of ZEC) or BTSE WXMR (off peg, no 2026 redemption proof).

---

## 1. What changed since the 9 Nov integrations plan

- **wrappedz.cash WZEC never launched.** It was a Cyfrin team grant application to Zcash Community Grants
  (Feb to Apr 2026, BitGo custody, Chainlink PoR planned, Arbitrum in milestone 3). ZCG rejected the grant on
  20 Mar 2026; no mainnet contract, supply or launch exists. Source: forum.zcashcommunity.com thread 54575.
- **The 2020 WZEC** (Tokensoft + Anchorage, `0x4A64515E5E1d1073e83f30cB97BEd20400b66E10` on Ethereum) has
  430 tokens outstanding, no proof of reserve, and quotes far below ZEC on CoinGecko. Its canonical bridged
  address on 4663 (`0x42275edca9512c70ad36e56931d80d417883f1f8`) has no code: nobody bridged it.
- **cbZEC exists** (Base, since early Sep 2026, Coinbase Custody 1:1, 8 decimals like cbBTC). It is Base-native,
  not an Ethereum token, so the Arbitrum canonical bridge cannot move it to 4663. Getting it here needs Coinbase to
  issue on Robinhood Chain (as they did cbBTC on several chains) or a third-party route that holds inventory.
- **Pyth is live on Robinhood Chain** (Pyth Core `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`, verified today:
  `getValidTimePeriod()` returns 60; `priceFeedExists(ZEC)` is false only because nobody has pushed a ZEC update yet,
  which is normal for a pull oracle) and publishes
  Crypto.ZEC/USD (`0xbe9b59d1…bb24`) and Crypto.XMR/USD (`0x46b8cc93…321d`). Chainlink's 62 feeds on 4663 include
  neither.
- **The canonical bridge has no whitelist** (`whitelist()` on the L1 ERC20 Gateway returns zero). cbBTC, LINK,
  PENDLE and VIRTUAL on 4663 are plain canonical-bridge tokens in dust amounts (cbBTC supply is 1 satoshi).
- **XMR**: THORChain's XMR pool is still not live after the May 2026 exploit; Wrapsynth wsXMR is a hackathon
  project with no addresses; Maya has ZEC but not XMR. No credible wrapped XMR exists.
- Demand side: ZEC ≈ $1,218, market cap ≈ $20.7 B, Grayscale spot ETF (ZCSH) since 25 Aug 2026, NU7 upgrade
  live 6 Nov 2026. XMR ≈ $599, ≈ $11.3 B, listed in the US only on Kraken plus KuCoin/MEXC/Bitfinex.

---

## 2. Track A: ZEC physical market, ready-when-the-token-lands

### 2.1 Why prepare now
Our listing path assumes a DexScreener price (`scripts/mainnet/v2-plan.mjs` throws without one) and the indexer
prices non-pooled crypto from DexScreener only (`indexer/src/index.mjs`, `pollQuotes()`). A freshly bridged
cbZEC/WZEC will have no DEX pair on 4663 for days. Two small, generic changes make any CEX-quoted token listable
on day one, and they are useful beyond ZEC (any bridged blue chip with no local pool).

### 2.2 Code changes (half a day)

| File | Change |
|---|---|
| `scripts/mainnet/v2-extra-tokens.json` | allow an optional `"quote": "ZEC-USD"` per token. |
| `scripts/mainnet/v2-plan.mjs` | when DexScreener has no pair and `quote` is set, price = Coinbase `/v2/prices/<quote>/spot`, Kraken fallback (same pattern as `ethUsd()`). Keep the throw when neither works. |
| `indexer/src/index.mjs` | new map `CEX_QUOTES = { cbZEC: 'ZEC-USD', WZEC: 'ZEC-USD' }` (env-overridable, JSON). In `pollQuotes()`, after the DexScreener pass, for leftovers with a mapping fetch Coinbase spot (Kraken fallback), write `q:<symbol>:<time>` with `quoteSource = 'cex'`. |
| `src/app/market/page.tsx` | label `quote.source === 'cex'` as "Exchange price"; add a one-line note for wrapped assets: "cbZEC is a transparent, Coinbase-custodied claim on ZEC. Shielded-pool privacy does not carry over." Drive it from a small `WRAPPED_NOTES` map keyed by symbol in `src/lib/config.ts`. |
| MCP `get_prices` / `get_chart` | pass the `source` through unchanged (already generic). |
| `contracts/deployments/4663.json` | nothing until a token exists; 8-decimal tokens already work (cbBTC). |

No contract change. The AssetRegistry reads `decimals()` at listing, the markets store totals, and physical
settlement is oracle-free, so the CEX price is UI-only.

### 2.3 Listing procedure, when a wrapper is on 4663
1. Confirm the token: `cast call <addr> "name()(string)"`, `symbol()`, `decimals()`, `totalSupply()`; confirm the
   issuer's own announcement names that address (not a copycat).
2. Add to `v2-extra-tokens.json`: `{ "symbol": "cbZEC", "address": "...", "capUsd": 25000, "quote": "ZEC-USD" }`.
3. `scripts/mainnet/list-trending.sh` (timelock, 10 min, Safe). Puts on by default in the plan.
4. Optional: seed a cbZEC/ETH v4 pool (1 to 2 ETH) so a DEX price and Uniswap chart exist; then add the pool key
   under `pools` and `pnpm sync`. Not required for listing.
5. Prelaunch checklist in memory applies: indexer proxy allowlist, live keeper address, verify on Render.
6. Announce only after step 7 in section 4 (compliance).

### 2.4 Outreach (start this week, zero code)
- **Coinbase**: ask for cbZEC on Robinhood Chain. Angle: Robinhood Chain already has Chainlink feeds for cbBTC and
  the ecosystem is live; Kyte would list ZEC options on day one. Route through the Robinhood Chain ecosystem
  contact, who has more pull than we do.
- **Cyfrin / wrappedz.cash**: ask whether a smaller launch is still planned and whether Arbitrum Orbit chains are in
  scope. If WZEC launches on Ethereum, the Arbitrum portal bridges it to 4663 in ~10 minutes, permissionlessly.
- **Universal (uZEC)** and **Zenrock (zenZEC)**: both custodial, Solana-first; ask if an EVM issuance is planned.
  Low priority.

---

## 3. Track B: "Kyte Index", cash-settled ZEC and XMR options on Pyth

This is the only path to XMR, and the fastest path to ZEC. It deliberately breaks Kyte's "no oracle" rule, so it
must be a visibly separate product: separate contracts, separate page, separate fee accounting line, and the
existing CallMarket/PutMarket stay untouched.

### 3.1 Product
- Underlying: a Pyth price id (ZEC/USD, XMR/USD; later anything Pyth publishes).
- European, cash-settled in WETH, **fully collateralised with a payout cap**. The writer chooses the cap, so the
  market keeps Kyte's "a position can never go below zero" property for both sides.
- Strike and cap are in USD (8 decimals, Pyth convention). Premium and collateral in WETH. Conversion USD → WETH
  uses Pyth ETH/USD from the **same** settlement update, so no second oracle.
- Payoff at expiry: call `min(cap, max(0, P − K)) × size`, put `min(cap, max(0, K − P)) × size`, in USD, paid in
  WETH at the settlement ETH/USD. Writer locks `cap × size / ethUsdAtCreate × (1 + buffer)` WETH; a 25% buffer
  covers ETH moving against the writer between creation and expiry. If the payoff in WETH exceeds the locked
  amount (ETH fell more than the buffer), the holder gets the whole lock and no more. State this on the page.
- Fees: same 3% on premium, 0.1% on settlement value, routed to the existing FeeVault so stakers and burn see it.

### 3.2 Contracts (`contracts/src/index/`)
| Contract | Role |
|---|---|
| `IndexRegistry.sol` | timelock-governed list of `(priceId, symbol, maxExpiry, maxConf bps, cap per writer)`. Mirrors AssetRegistry. |
| `IndexMarket.sol` | `createOffer(priceId, isCall, strikeUsd, capUsd, size, premium, expiry, deadline)` locks WETH; `buy(id)` mints an OptionNFT (reuse `OptionNFT.sol` with a new market role); `settle(id, bytes[] pythUpdate)` anyone, after expiry; `cancel`, `reclaim`, as today. |
| Settlement rule | `pyth.parsePriceFeedUpdatesUnique(update, [priceId, ethUsdId], expiry, expiry + SETTLE_WINDOW)` so the price used is the first Pyth publish at or after expiry. Reject if `conf / price > maxConf`. If no acceptable price within `SETTLE_WINDOW` (1 h), a second path `settleLate` accepts any publish in `(expiry + 1 h, expiry + 24 h]`. If still nothing after 24 h, `void(id)`: collateral back to the writer, premium is **not** refunded (document it; premiums are earned at fill like today). |
| `Router.sol` | add `createIndexOfferWithETH`, `buyIndexWithETH` so users keep paying in ETH. |
| Guardian | `KyteHaltGate` pause applies; the gate already exists. |

Pyth pull cost: the settler pays `pyth.getUpdateFee(update)` (a few wei on Orbit chains) plus gas; the keeper
fetches the update from Hermes (`hermes.pyth.network/v2/updates/price/<ts>?ids[]=…`) and calls `settle`. Anyone
can do it, as with `expire` today.

Tests: unit tests with a MockPyth (Pyth ships one in `@pythnetwork/pyth-sdk-solidity`), covering cap, buffer
shortfall, conf rejection, both settle windows, void, and fee routing; a fork test against the live Pyth contract
on 4663 with a real Hermes payload.

### 3.3 Indexer, keeper, UI, MCP
- Indexer: new `indexer/src/indexmarket.mjs` watching `IndexMarket` events; price rows for `ZEC`/`XMR` from
  Pyth Hermes (`/v2/updates/price/latest`) every 30 s, `quoteSource = 'pyth'`; endpoints `/index/offers`,
  `/index/positions`. Add to the proxy allowlist.
- Keeper: settle loop (fetch Hermes update for `expiry`, call `settle`; retry into the late window; `void` after
  24 h). Lives next to the expire loop in `keeper/`.
- UI: `/index` page (or a tab on `/market`) with a clear banner: "Cash-settled against Pyth ZEC/USD. Not physical.
  Payout capped at the writer's cap." Sell form has cap and shows the max payout and the ETH buffer. Positions
  page shows "settles at first Pyth print after expiry".
- MCP: `find_offers` / `prepare_*` gain `market: 'index'`; new `get_index_price`. Autopilot excluded at first.
- Docs: `HOW_IT_WORKS.md` section "Kyte Index: the one place Kyte reads an oracle" and a risk paragraph.

### 3.4 Effort and order
| Step | Days |
|---|---|
| Contracts + MockPyth tests | 5 |
| Fork test, deploy script, timelock plan (`scripts/mainnet/index-plan.mjs` from `v2-plan.mjs`) | 2 |
| Indexer + keeper | 3 |
| UI + MCP + docs | 4 |
| External review of `IndexMarket` (small, one settlement path) | 1 to 2 weeks calendar |

### 3.5 Risks specific to this track
- **Oracle**: Pyth is pull-based and first-party; the main risk is a thin XMR market printing a wide `conf`. The
  `maxConf` check plus the late window handle this; a `void` is the last resort and must be explained up front.
- **ETH/USD mismatch**: the buffer can be exhausted in a crash; the holder is then paid less than the formula. Show
  the exact WETH lock in the buy dialog so the cap is visible before purchase.
- **Narrative**: the whole Kyte pitch today is "no oracle, physical settlement". Keep the Index line visibly
  separate so the main markets' claim stays true.

---

## 4. Compliance and messaging (both tracks)
1. Robinhood Chain positions itself around tokenized stocks and RWAs. A wrapped privacy coin is permissionless on
   our side, but **ask the Robinhood Chain ecosystem contact before announcing**, so a ZEC listing does not cost
   us the stock-token relationship.
2. Say plainly on the market page that a wrapped claim is transparent: holding cbZEC on an L2 has none of Zcash's
   shielded privacy. For the Index line, say it is a price bet, not ZEC/XMR exposure.
3. XMR is delisted on Coinbase, Binance and most EU/UK venues. A cash-settled XMR index is legally a derivative on
   a price, not Monero custody, which is the point; still mention it to counsel before launch.

---

## 5. Price feeds, for reference (all returned live data on 9 Nov 2026, no auth)

| Source | ZEC | XMR |
|---|---|---|
| Coinbase | `https://api.coinbase.com/v2/prices/ZEC-USD/spot` | not listed |
| Kraken | `https://api.kraken.com/0/public/Ticker?pair=ZECUSD` (key `XZECZUSD`) | `…?pair=XMRUSD` (key `XXMRZUSD`) |
| Binance | `…/ticker/price?symbol=ZECUSDT` | **stale since Feb 2024, do not use** |
| KuCoin | | `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=XMR-USDT` |
| Bitfinex | `https://api-pub.bitfinex.com/v2/ticker/tZECUSD` | `…/tXMRUSD` |
| Pyth Hermes | `be9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24` | `46b8cc9347f04391764a0361e0b17c3ba394b001e7c304f7650f6376e37c321d` |
| Chainlink on 4663 | none | none |

Indexer rule for Track A: Coinbase first, Kraken second, as `ethUsd()` already does. For XMR in Track B use Pyth
only; the CEX endpoints are for a sanity check in the keeper (refuse to settle if Pyth and Kraken differ > 5%,
retry in the late window).

---

## 6. Open decisions
1. Start Track B at all? It is 2 to 3 weeks of work plus review for a product line that contradicts the headline
   pitch. Recommended answer: **not before FOBO, Factor and USDG rewards are live and the Index demand is visible**
   (for example, people asking for ZEC on the Pons/FOBO Telegram, or ZCSH flows staying positive).
2. If Track B starts: ZEC only first, XMR second (XMR Pyth confidence is wider and the compliance question is louder).
3. Cap buffer (25%) and settle windows (1 h, 24 h) are proposals; confirm before writing the contract.
