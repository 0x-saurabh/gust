# Kyte: Project Docs (end to end)

> **Kyte**, token **`$KYTE`**. A covered-options market on Robinhood Chain, built from `../../SPEC.md`,
> `../../BUILD_PLAN.md` and `../../GUST_REVERSE_ENGINEERING.md`. Status as of **2026-10-30**.

---

## TL;DR

- **What it is:** sellers lock tokens (calls) or ETH (puts) and earn a premium. Buyers pay the premium and get an
  **Option NFT** they can exercise before expiry. Physical settlement, no oracle.
- **Money:** 3% fee on premiums, 0.1% on strikes. The contracts split fees **30% stakers / 20% buy-and-burn / 50% ops**.
  The buyback swaps on **Uniswap v4** and burns in the same transaction; the Proof page is built only from events.
  (Gust does its burn by hand from a team wallet. Ours is trustless.)
- **Safety:** no admin can touch user funds; pausing only stops *new* positions; fees are locked per position;
  48 h timelock for settings; guardian can only pause/disable.
- **Built and working end to end on a local devnet:**
  - 13 contracts incl. a **Uniswap v4 hook**, **106 tests** (unit, fuzz, invariants, swaps and the hook on a real v4 PoolManager);
  - indexer + JSON API (SQLite), keeper bot (expire / split / buyback);
  - website wired to real transactions: sell, buy, exercise, cancel, expire, stake, claim, unwrap, faucet;
  - e2e script runs all 19 user actions against the chain and checks the indexer agrees.
- **Not done:** testnet/mainnet deploy (needs your key + multisigs), CSP/ToS/geoblock, audits, the real `$KYTE`
  token and its v4 pool, testnet WETH address.
- **Run:** `pnpm devnet` → `pnpm devnet:deploy` → `pnpm indexer` → `pnpm keeper` → `pnpm dev` → http://localhost:3010

---

## 1. What the product does

| Role | What they do | What they get |
|---|---|---|
| **Call seller** | Locks ERC-20 tokens, sets strike (ETH), expiry, premium | The premium. If exercised, the strike too. Otherwise the tokens come back |
| **Put seller** | Locks the strike in ETH (held as WETH) | The premium. If exercised, the tokens; otherwise the WETH comes back |
| **Buyer** | Pays the premium, receives an Option NFT | The right to exercise until expiry. The NFT can be transferred |
| **Staker** | Stakes `$KYTE` | 30% of all protocol fees, in WETH, from the next epoch on |
| **Keeper / anyone** | `expire` after expiry, `split` once a day, buyback tranches | Keeps the system moving |

```
              createOffer                 buy (before fill deadline)
 (nothing) ──────────────►  OPEN  ───────────────────────────►  FILLED ──┬─ exercise (now < expiry) ─► EXERCISED
                              └─ cancelUnfilled (seller) ─► CANCELLED    └─ expire (now ≥ expiry, anyone) ─► EXPIRED
```

**Worked example (from the e2e run):** seller locks 100,000 ZEPH, strike 3 ETH, premium 0.1 ETH. Buyer sends
0.15 ETH to `router.buyWithETH`: 0.1 is wrapped and paid (0.097 to the seller, 0.003 to the FeeVault), 0.05 is
refunded. Buyer calls `router.exerciseWithETH` with 3 ETH: seller gets 2.997 WETH, vault 0.003, buyer gets the ZEPH.

---

## 2. Architecture

```
 Browser (Next.js) ──reads──► Indexer API :4200 ──follows──► Robinhood Chain
        │ wallet tx                                             │
        ▼                                                       │
   Router (ETH⇄WETH) ──► CallMarket / PutMarket ──mint/burn──► OptionNFT
                              │ reads AssetRegistry ◄── timelock / guardian
                              │ fees (WETH)
                              ▼
                          FeeVault ── split() per epoch ─► StakingPool (30%)
                                                        ├─► BuybackBurner (20%) ─► UniswapV4Adapter ─► PoolManager ─► burn
                                                        └─► Ops Safe (50%)
 Keeper bot: expireMany · split · buyAndBurn
```

**Roles:** `TIMELOCK` (48 h `TimelockController`, run by the admin Safe) lists tokens, sets caps/fees/split/router/
adapter/keeper, unpauses. `GUARDIAN` can pause new activity and disable tokens, nothing else. `KEEPER` can only
run buybacks within the timelock's bounds. No role can move collateral.

---

## 3. Repository

```
gust-website/
├── contracts/           Foundry. src/: AssetRegistry, OptionNFT, OptionMarketBase, CallMarket, PutMarket, FeeVault,
│                        StakingPool, BuybackBurner, Router, adapters/UniswapV4Adapter, lib/, interfaces/
│                        script/Deploy.s.sol (testnet/mainnet), script/DeployDevnet.s.sol (local, real v4 pool)
│                        test/: 97 tests. deployments/<chainId>.json after deploy
├── indexer/src/index.mjs   chain follower → SQLite → JSON API
├── keeper/src/index.mjs    expire / split / buyback bot
├── scripts/sync-contracts.mjs   ABIs + addresses → src/lib/generated/
├── scripts/e2e-devnet.mjs       every UI action against the devnet + indexer check
├── src/app/             pages: / market sell positions stake proof docs
├── src/components/      Nav, ConnectButton, Faucet, BuyDialog, TxStatus, AsciiField, FeeSplitBar, TimeLeft, ui
├── src/lib/             config (brand, fees), chains (networks, addresses), data (indexer→chain→demo),
│                        tx (simulate→sign→wait, approvals, faucet), pricing (Black-Scholes hint), demo-data
├── BUILD_PLAN.md · README.md · docs/PROJECT_DOCS.md · .github/workflows/ci.yml
```

---

## 4. Contracts

| Contract | What it does |
|---|---|
| `AssetRegistry` | Whitelist (max 25). Per-token cap, min strike, puts flag. Guardian can only disable |
| `OptionNFT` | ERC-721 per filled option; ids `(tag<<248)|local`, tag 1 call / 2 put; on-chain SVG; markets set once |
| `OptionMarketBase` | create (exact balance-delta check), `buy`/`buyFor`, `cancelUnfilled`, `expire`, `expireMany`(≤50), fee snapshot, caps, 200 open/seller, pause |
| `CallMarket` | `createOffer`, `exercise`, `exerciseFor` (router) |
| `PutMarket` | `createPutOffer`, `createPutOfferFor` (router), `exercisePut` |
| `FeeVault` | `split()` once per 24 h epoch; shares sum to 100%, stakers ≥ 20%; `setDestinations` |
| `StakingPool` | `stake` (active next epoch), `unstake` (pending first), `claim`, `notifyReward` (vault only), `undistributed` bucket, `minClaim` ≤ 0.1 ETH |
| `BuybackBurner` | `buyAndBurn` (keeper), `maxPerCall`, slippage ≤ 20% vs last price, burns to `0x…dEaD`, `Burned` event |
| `UniswapV4Adapter` | PoolManager `unlock → swap → settle/take`, partial-fill refund; `quote` uses KyteHook's 10 min TWAP when the pool is hooked, else spot (solc 0.8.26) |
| `hooks/KyteHook` | **Uniswap v4 hook** on the $KYTE/WETH pool: tick observation ring buffer (128) after every swap → `consult(secondsAgo)` / `twapSqrtPriceX96`; takes `feeBps` (10, max 100) of the WETH side of each swap via `afterSwapReturnDelta` and sends it to the FeeVault. Owner = timelock. Deployed at a mined CREATE2 address (`script/HookDeployer.sol`) |
| `Router` | `buyWithETH`, `exerciseWithETH`, `buyPutWithETH`, `createPutOfferWithETH`; wraps exactly, refunds, must end empty |

**Rules on create:** listed+enabled (puts: puts enabled), amount > 0, strike ≥ min, premium ≥ 0.0005 ETH, expiry in
[1 h, 90 d], now < deadline ≤ expiry, exposure ≤ cap, < 200 open, exact balance delta, not paused.
**Security:** CEI + `nonReentrant` (transient); terminal status before transfers; `_mint` not `_safeMint`; separate
escrows per market; no sweep/rescue; hard fee caps (10% / 1%).

**Tests (106):** every function and revert; fuzz (fee conservation, exercise-xor-expire ±10 s, decimals 0–24, vault
and pool solvency); handler invariants (collateral ledgers, forward-only status, NFT iff Filled, Router empty) incl.
ETH flows; v4 adapter on a real PoolManager (both orders, partial fill).

---

## 5. Indexer, keeper, devnet

- **Indexer** (`pnpm indexer`, :4200): also decodes Uniswap v4 `Swap` events for the configured pools into a price feed (`/prices`, `/candles?token=&interval=`, `/markers?token=`). Polls every 2 s, re-scans the last 8 blocks, re-reads touched positions from
  the contracts (reorg-safe), uses chain time. Routes: `/health /assets /offers /offers/:id /positions/:addr
  /stake/:addr /proof /stats /expirable`. See `indexer/README.md`.
- **Keeper** (`pnpm keeper`): `expireMany` batches, `split` per epoch, `buyAndBurn` with `quote × (1 − slippage)`.
  Alert webhook. Key via `KEEPER_PRIVATE_KEY` (anvil #0 on devnet). See `keeper/README.md`.
- **Devnet** (`pnpm devnet` on :8547, `pnpm devnet:deploy`): whole protocol + mock WETH + ZEPH/GALE/NIMB + `$KYTE` +
  a real v4 PoolManager with WETH pools for KYTE, ZEPH, GALE and NIMB (full range liquidity) + swap router + adapter, seeded offers and stakes. `pnpm trader` makes random swaps so charts move. Verified:
  fill → split (0.006 WETH → 30/20/50) → buyback through v4 (0.0012 WETH → 1,196 KYTE burned) → keeper expiry after
  fast-forward. `node scripts/e2e-devnet.mjs` runs all 19 UI actions.

---

## 6. Website

Next.js 16, React 19, Tailwind 4, wagmi 2, viem 2, Privy (wallet picker), Framer Motion 12, GSAP 3 + ScrollTrigger, Lenis smooth scroll, Three.js / react-three-fiber (WebGL aurora shader), TradingView Lightweight Charts, Phosphor icons. Browser wallets; Robinhood Chain or the devnet.

| Page | Live behaviour |
|---|---|
| `/` | Landing page per the `landing-page-design` skill: WebGL aurora hero (custom GLSL, mouse reactive) with GSAP scrolltelling (frame tilts and settles, copy parallax), split-text headings, kinetic offer marquee driven by scroll velocity, split hero (one CTA + proof line, white→gray heading), "Built on" strip, problem → solution, four benefits, word by word **tagline reveal**, three steps + the scroll driven **flow story** (assets travel between parties with Framer Motion), proof bento (live activity, typewriter command, epoch countdown, offer stream, fee bars), numbers, FAQ accordion, risk reversal + final CTA. Floating pill nav with animated mobile menu |
| `/market` | **TradingView Lightweight Charts** candles + volume per token from Uniswap v4 swaps (indexer `/candles`), every open strike drawn as a price line, fills/exercises as markers, live price + 1h change; fillable offers with "vs spot"; Buy → `router.buyWithETH` / `buyPutWithETH` |
| `/sell` | Call: approve + `createOffer`; put: `router.createPutOfferWithETH`. Contract rules checked before signing; balance checks; fee preview; Black-Scholes hint |
| `/positions` | Holding: Exercise (`exerciseWithETH` / approve + `exercisePut`). Selling: Cancel / Reclaim / Expire. WETH → ETH unwrap. History |
| `/stake` | approve + `stake`, `unstake`, `claim`; epoch countdown; your active/pending/claimable |
| `/proof` | `FeesSplit` and `Burned` events with tx links |
| `/docs` | Rules, fees, risks, every deployed address |
| Hero frame | Tab **Trending on Robinhood Chain**: real mainnet assets (PONS, CASHCAT, USDG, WETH, CBBTC, Ondo tokenized stocks…) from a dated Blockscout snapshot (`src/lib/rh-mainnet-tokens.json`, verified addresses, holders, price, 24h volume) merged with live last-hour swap counts from `/api/rh-tokens` (Uniswap v4 `Swap` logs via the public RPC, 5 min cache). Tab **Open offers · devnet**: premium live order book (`LiveOffers`): live strip (open offers, premium on offer, nearest expiry), per-row 1h sparklines from the v4 price feed, distance-to-spot bars, 1h change chips, ticking expiries, expandable detail rows (seller, collateral, break even, spot, fee), pill Buy |
| Buttons | Optivio-style pill CTA (label rolls, dotted arrow slides out of the dark circle) and circular social buttons; footer is an inset dark panel. App pages enter with a fade + slide-down page switch; connecting a wallet on the landing routes into the app |
| Nav | **Privy** wallet picker (only wallets installed in the browser, EIP 6963 detected; app id in `NEXT_PUBLIC_PRIVY_APP_ID`), devnet chip, **Faucet** (devnet: ETH + WETH + $KYTE + tokens) |
| `/terms`, `/privacy`, 404 | Legal pages and a branded not found page |

Every write: `simulateContract` → wallet sign → `waitForTransactionReceipt`, with a status card and friendly
messages for every custom error. Data: indexer → direct chain reads → demo (`NEXT_PUBLIC_DEMO=1`).
Theme: `src/app/globals.css` (flat black `#000000` / `#181818` surfaces per the landing skill, white Geist type, mint `#4DFCA9` accent, mono for labels/numbers, pill buttons, `cubic-bezier(0.22,1,0.36,1)` motion, focus rings, skip link, OG image, favicon).

---

## 7. Chain facts

| Item | Mainnet 4663 | Testnet 46630 |
|---|---|---|
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | **not confirmed** |
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | same |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | same |

Deploy: `GUARDIAN= ADMIN_SAFE= WETH= KYTE_TOKEN= KEEPER= OPS_SAFE= forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --account <keystore>`
then `node scripts/sync-contracts.mjs`, set `NEXT_PUBLIC_CHAIN_ID=46630`, run the indexer with `CHAIN_ID=46630 START_BLOCK=<deploy block>`.

---

## 8. Status

| Phase | Status |
|---|---|
| W0 scaffold + pages | ✅ |
| W1 theme | ✅ black + mint/cyan aurora from the user's reference banner (`kyte.sh`, "Options, on your terms") |
| C1 core contracts | ✅ |
| C2 staking, buyback, v4 adapter, router | ✅ |
| W2 site wired to contracts | ✅ on devnet |
| W3 indexer + keeper | ✅ |
| W4 launch hardening | ⏳ Done: CSP with per-request nonces + security headers, indexer/keeper hardening, buyback TWAP floor, staking lock, mainnet deploy guards. Open: ToS + geoblock, testnet beta, audits, bug bounty, mainnet with 3 tokens |

## 9. Open items (need you)

1. Deployer key + admin/guardian/ops Safes for the testnet deploy.
2. The real `$KYTE` token (Bags or direct v4 pool) and its pool, for the mainnet adapter.
3. First 3 tokens to list (listing checklist, `SPEC.md` §6).
4. Testnet WETH address.
5. Legal review (`SPEC.md` §11) before mainnet.
