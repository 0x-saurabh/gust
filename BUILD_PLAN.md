# Kyte (options) on Robinhood Chain: Build Plan

> **Kyte**, a Gust-style **covered options market** (covered calls + cash-secured puts, staking, on-chain fee split and buyback proof),
> rebuilt for **Robinhood Chain** (mainnet 4663, testnet 46630).
> This project is **separate from Kyte** (`../rh-rewards`). Nothing is shared between them.
>
> Sources, in this folder's parent: `SPEC.md` (contract logic + security), `BUILD_PLAN.md` (contract steps),
> `GUST_REVERSE_ENGINEERING.md` (what Gust does on Solana and where we improve on it).

---

## 1. Product in one paragraph

A seller locks ERC-20 tokens and lists a **call** (strike in ETH, expiry, premium), or locks ETH and lists a **put**.
A buyer pays the premium and gets an **Option NFT**. Before expiry the holder can exercise. After expiry anyone can
expire it and the collateral returns to the seller. Fees are **3% of the premium + 0.1% of the strike**, split **by
the contracts** as **30% stakers / 20% buy-and-burn / 50% ops**. Gust does the burn by hand from a team wallet. We do
it on-chain, and the Proof page reads the events.

## 2. What we copy from Gust, and what we change

| Gust (Solana) | Ours (Robinhood Chain) |
|---|---|
| Calls + puts, physical settlement, no oracle | Same |
| Premium fee 3%, exercise fee 0.1% | Same, **snapshotted per position** |
| 1 h – 90 d duration, separate offer deadline | Same |
| Whitelist of ≤ 7 assets | Whitelist with per-asset TVL caps |
| 30% to stakers on-chain, 70% to the admin wallet | **30 / 20 / 50 split on-chain**; buyback swaps and burns in-contract |
| Manual "Proof" page | Proof page built only from `FeesSplit` and `Burned` events |
| Upgradeable program, single admin | Immutable core, 48 h timelock, guardian can only pause new positions |
| SOL strikes | ETH strikes (WETH inside the markets, Router wraps) |

## 3. Site map

| Route | Purpose | Data source |
|---|---|---|
| `/` | Landing: what it is, how it works, fee split, live stats, CTA | indexer stats |
| `/market` | Open offers (calls / puts), filters by token, strike, expiry; Buy | indexer + `buy` tx |
| `/sell` | Create a call (lock tokens) or put (lock ETH); premium suggestion; fee preview | registry + `createOffer` tx |
| `/positions` | My offers, my options, my puts: exercise, cancel, reclaim, unwrap WETH | indexer by wallet |
| `/stake` | Stake / unstake `$TOKEN`, claim WETH rewards, epoch timer | StakingPool reads |
| `/proof` | Every fee split and burn with explorer links, totals | `FeesSplit`, `Burned` events |
| `/docs` | How it works, fees, risks, contract addresses | static + registry |

## 4. Phases

Each phase has an exit check. The website ships with a **demo data layer**, so the UI can be built and reviewed
before the contracts exist. Each page swaps to live data once its contracts and indexer are deployed.

### Phase W0: Scaffold + theme ✅ (this commit)
- Next.js 16, React 19, Tailwind 4, wagmi 2, viem 2. Browser wallets only (injected), Robinhood Chain only.
- Design tokens in `src/app/globals.css` (one `@theme` block). Brand name in `src/lib/config.ts`.
- All seven routes built against `src/lib/demo-data.ts`, with a visible **Demo data** banner.
- Sell form validates every rule from `SPEC.md` §3.3 (duration, deadline ≤ expiry, min premium) and previews fees.
- Black-Scholes premium hint (`src/lib/pricing.ts`), display only.
- ✅ Exit: `pnpm build` passes and every route renders.

### Phase W1: Theme parity with getgust.fun
- getgust.fun was unreachable on 2026-10-30. It serves a Railway certificate that doesn't match the domain.
  **Send screenshots** (landing, market, sell, stake, proof), or tell us when the site is back, and we'll match
  colors, type, spacing and components by editing only the token block + components.
- Don't copy Gust's name, logo or artwork. Pick our own brand (see §6).
- ✅ Exit: side-by-side review is signed off.

### Phase C1: Contracts M1 (in `contracts/`, Foundry) ✅ (+ PutMarket)
`lib/` types, errors, events, constants → `AssetRegistry` → `OptionNFT` → `CallMarket` → `FeeVault`.
Follow `../BUILD_PLAN.md` Steps 1–5 and `../SPEC.md` §3, §5, §6, §7.
- ✅ Exit: unit and fuzz tests pass; invariants 1, 3, 4 and 5 hold.
- Done 2026-10-30: 71 tests pass (unit, fuzz, handler invariants 1–5 and 7). PutMarket is done too; see `contracts/README.md`.

### Phase C2: Contracts M2 + M3 ✅
`StakingPool`, `BuybackBurner`, `UniswapV4Adapter` (direct PoolManager swap, same pattern Kyte-rewards verified on Robinhood Chain), `Router` (ETH wrap + refund, zero-balance check).
- ✅ Exit: invariants 2, 6 and 7 hold; swaps tested on a real v4 PoolManager (both directions, partial fill). 97 tests.
- Not in v1: Router `multicall`/permits (users approve the markets directly), TWAP bound (no TWAP source on Robinhood Chain yet; slippage is bounded against the last executed price + per-call cap).

### Phase W2: Wire the site to contracts (testnet 46630)
- `src/lib/contracts.ts`: fill addresses from `contracts/deployments/46630.json`.
- Replace demo writes with `simulateContract` → `writeContract` for: approve, createOffer, cancelUnfilled,
  buy, exercise, expire, put equivalents, stake, unstake, claim, WETH unwrap.
- Always simulate before signing. Show the exact fee and what the user receives.
- ✅ Exit: every flow works by hand on testnet with a funded wallet.

### Phase W3 (backend half) ✅: Indexer + keeper
- `indexer/`: viem log follower → SQLite (`node:sqlite`) → JSON API (`/offers`, `/positions/:addr`, `/stake/:addr`, `/proof`, `/stats`, `/assets`, `/expirable`, `/health`). Positions are re-read from the contracts on every touch; last 8 blocks re-scanned (reorg-safe); chain time, not wall clock.
- `keeper/`: `expireMany` (batches of 50), `split()` once per epoch, `buyAndBurn` tranches with adapter quote − slippage. Alert webhook.
- Local devnet (`pnpm devnet`, `pnpm devnet:deploy`): whole protocol + real Uniswap v4 PoolManager and WETH/KYTE pool, 3 listed tokens, seeded offers and stakes. Verified end to end: fill → split → stakers notified → buyback through v4 → burn; fast-forward → keeper expiry.
- ✅ Exit met on devnet. Remaining for W3: the website reads the indexer API (frontend phase).

### Phase W4: Launch hardening
- Strict CSP (`script-src 'self'`), pinned deps, no remote scripts. Contract addresses on `/docs`.
- Terms of Service acceptance + geoblocking (`SPEC.md` §11). Risk warnings: exercising near expiry, token risks.
- Public testnet beta for 2 weeks → audits (`SPEC.md` §9.4) → mainnet with 3 assets and low caps.

## 5. Chain facts (verified for Robinhood Chain; also used by Kyte's registry)

| Item | Mainnet 4663 | Testnet 46630 |
|---|---|---|
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | **TBD** |
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | same |
| Universal Router | `0x204FAca1764B154221e35c0d20aBb3c525710498` (v2.1.2) | `0x8876789976dEcBfCbBbe364623C63652db8C0904` (v2.1.1) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | same |
| Cancun / transient storage | Yes (Uniswap v4 needs it) | Yes |

These are constructor arguments, never hard-coded in contracts.

## 6. Open decisions (need you)

1. **Brand name.** **Kyte** / `$KYTE` (set in `src/lib/config.ts`). Don't use Robinhood trademarks.
2. **Theme reference.** Screenshots of getgust.fun, since the site is down.
3. **`$TOKEN` launch.** Through Bags or a direct v4 pool? This decides the buyback pool.
4. **Initial asset list.** 3 tokens for mainnet launch, each passing the `SPEC.md` §6 checklist.

## 7. Run it

```bash
cd gust-website
pnpm install
pnpm dev        # http://localhost:3010
pnpm build
```
