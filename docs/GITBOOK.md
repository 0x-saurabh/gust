# Kyte Documentation

> **Kyte** is a covered-options market on **Robinhood Chain**. Sellers lock tokens (covered calls) or ETH
> (cash-secured puts) and earn a premium. Buyers pay that premium and receive an **Option NFT** they can exercise
> before expiry. Protocol fees are split on-chain between `$KYTE` stakers, a `$KYTE` buy-and-burn, and operations.
>
> Website: **kyte.sh** · Network: Robinhood Chain mainnet (chain id `4663`) · Token: `$KYTE`

This single file is the complete reference for the product, the protocol, the codebase and its operations. Every
`#` heading is a natural GitBook page; the [suggested `SUMMARY.md`](#appendix-c-suggested-gitbook-summarymd) at the
end shows how to split it.

---

## Contents

**Part 1: Using Kyte**
1. [Overview](#1-overview)
2. [Quickstart](#2-quickstart)
3. [Core concepts](#3-core-concepts)
4. [Guide: buy an option](#4-guide-buy-an-option)
5. [Guide: sell a covered call](#5-guide-sell-a-covered-call)
6. [Guide: sell a cash-secured put](#6-guide-sell-a-cash-secured-put)
7. [Guide: manage your positions](#7-guide-manage-your-positions)
8. [Guide: stake $KYTE](#8-guide-stake-kyte)
9. [The Proof page](#9-the-proof-page)
10. [Fees](#10-fees)
11. [Rules and limits](#11-rules-and-limits)
12. [Risks](#12-risks)
13. [FAQ](#13-faq)
14. [Glossary](#14-glossary)

**Part 2: Protocol**

15. [Architecture](#15-architecture)
16. [Position lifecycle](#16-position-lifecycle)
17. [Smart contracts](#17-smart-contracts)
18. [Revenue: fee vault, split and buyback](#18-revenue-fee-vault-split-and-buyback)
19. [Staking mechanics](#19-staking-mechanics)
20. [Uniswap v4 integration and KyteHook](#20-uniswap-v4-integration-and-kytehook)
21. [Governance and roles](#21-governance-and-roles)
22. [Security model](#22-security-model)
23. [Markets v1 and v2](#23-markets-v1-and-v2)
24. [Deployed addresses](#24-deployed-addresses)
25. [Events reference](#25-events-reference)
26. [Errors reference](#26-errors-reference)

**Part 3: Developers**

27. [Repository layout](#27-repository-layout)
28. [Run everything locally](#28-run-everything-locally)
29. [Configuration (environment variables)](#29-configuration-environment-variables)
30. [Website architecture](#30-website-architecture)
31. [Indexer and API reference](#31-indexer-and-api-reference)
32. [Keeper bot](#32-keeper-bot)
33. [Testing and CI](#33-testing-and-ci)
34. [Integrating with Kyte](#34-integrating-with-kyte)

**Part 4: Operations**

35. [Mainnet deployment runbook](#35-mainnet-deployment-runbook)
36. [Timelock and Safe workflows](#36-timelock-and-safe-workflows)
37. [Listing and delisting tokens](#37-listing-and-delisting-tokens)
38. [Hosting in production](#38-hosting-in-production)
39. [Monitoring and incident response](#39-monitoring-and-incident-response)

**Appendices**
- [A. Chain facts](#appendix-a-chain-facts)
- [B. Protocol constants](#appendix-b-protocol-constants)
- [C. The $KYTE token](#appendix-c-the-kyte-token)
- [D. Every listed token](#appendix-d-every-listed-token)
- [E. KyteHook deep dive](#appendix-e-kytehook-deep-dive)
- [F. Option NFT metadata](#appendix-f-option-nft-metadata)
- [G. Scripts reference](#appendix-g-scripts-reference)
- [H. Website components](#appendix-h-website-components)
- [I. Terms of use](#appendix-i-terms-of-use)
- [J. Privacy policy](#appendix-j-privacy-policy)
- [K. Status and roadmap](#appendix-k-status-and-roadmap)
- [L. Changelog](#appendix-l-changelog)
- [M. Brand, links and contact](#appendix-m-brand-links-and-contact)
- [N. Suggested GitBook SUMMARY.md](#appendix-n-suggested-gitbook-summarymd)

---

# Part 1: Using Kyte

## 1. Overview

### What Kyte is

Kyte is a peer-to-peer market for **covered options** on Robinhood Chain, an Ethereum L2.

- A **call seller** locks ERC-20 tokens and lists a call: a strike in ETH, an expiry, and a premium.
- A **put seller** locks ETH (held as WETH) and lists a put on a token.
- A **buyer** pays the premium and receives an **Option NFT**. Until expiry, whoever holds that NFT can exercise.
- After expiry, anyone can **expire** the option and the collateral goes back to the seller.

Settlement is **physical**: on exercise, tokens and ETH actually change hands. There is **no price oracle** in the
option logic. The holder decides whether exercising is worth it.

### Why it is built this way

| Property | What it means for you |
|---|---|
| **Fully collateralised** | Every option is backed 100% by locked collateral. There is no leverage, no margin and no liquidation. |
| **Non-custodial** | Collateral can only ever go to its seller or to the option holder. No admin, guardian or multisig can move it. |
| **Fees fixed per position** | The fee rates are recorded on each position when it is created. A later fee change never affects it. |
| **Exits always work** | Pausing only stops *new* positions. Cancel, exercise, expire, unstake and claim always work. |
| **On-chain revenue split** | Fees are split by the contracts: 30% to stakers, 20% to buy and burn `$KYTE`, 50% to operations. |
| **Verifiable burns** | The buyback swaps on Uniswap v4 and burns in the same transaction. The Proof page is built only from on-chain events. |

### Who does what

| Role | Action | Gets |
|---|---|---|
| **Call seller** | Locks tokens, sets strike, expiry and premium | The premium. If exercised, the strike as well. Otherwise the tokens come back. |
| **Put seller** | Locks the total strike in ETH (as WETH) | The premium. If exercised, the tokens. Otherwise the WETH comes back. |
| **Buyer / holder** | Pays the premium, receives an Option NFT | The right to exercise until expiry. The NFT is transferable. |
| **Staker** | Stakes `$KYTE` | 30% of protocol fees, paid in WETH every epoch. |
| **Keeper (anyone)** | Expires options, triggers the daily split, runs buybacks | Keeps the system moving. |

### What you can trade

Kyte lists tokens through an on-chain **AssetRegistry**. Markets v2 has room for 300 assets, including
**Robinhood Stock Tokens** (tokenized equities such as AAPL, NVDA, TSLA and SPY), Ondo tokenized stocks, and a
curated set of Robinhood Chain native crypto tokens. Each token has its own exposure cap and minimum strike. The
**Market** page shows only tokens that are currently enabled.

As of 5 November 2026, **228 tokens** are listed in markets v2 (203 Robinhood Stock Tokens and ETFs, 11 Ondo
tokenized stocks, and 14 crypto tokens), all with puts enabled. The full list with addresses and limits is in
[Appendix D](#appendix-d-every-listed-token).

---

## 2. Quickstart

1. **Get a wallet.** Use any Ethereum browser wallet (MetaMask, Rabby, Coinbase Wallet and so on). Kyte's wallet
   picker shows only wallets it detects in your browser.
2. **Fund it on Robinhood Chain.** You need ETH on Robinhood Chain (chain id `4663`) for premiums and gas. To sell
   calls, you also need the token you want to write calls on.
3. **Connect.** Open kyte.sh and click **Connect**. The site asks your wallet to switch to or add Robinhood Chain.
4. **Pick what to do:**
   - **Buy** an option: [Market](#4-guide-buy-an-option)
   - **Sell** a call or a put: [Sell](#5-guide-sell-a-covered-call)
   - **Exercise, cancel, reclaim or expire**: [Positions](#7-guide-manage-your-positions)
   - **Earn fees**: [Stake](#8-guide-stake-kyte)
5. **Read the [risks](#12-risks).** Start with small amounts.

> **Note.** Kyte pays out in **WETH** (wrapped ETH) in several places: sellers' premiums, call sellers' strikes,
> put holders' exercise payouts and staking rewards. Unwrap WETH to ETH on the **Positions** page with one click.

---

## 3. Core concepts

### Calls and puts

| | Covered call | Cash-secured put |
|---|---|---|
| Seller locks | `amount` of the token | `strike` in WETH (sent as ETH, wrapped by the Router) |
| Buyer's right | Pay `strike`, receive `amount` tokens | Deliver `amount` tokens, receive `strike` |
| Buyer profits when | Token price per unit > strike per unit (+ premium) | Token price per unit < strike per unit (− premium) |
| Seller gives up | Upside above the strike | Must buy tokens at the strike even if they keep falling |

### Totals, not per-unit prices

On-chain, **`strike` and `premium` are totals for the whole lot**, in WETH. The website asks you for a
*strike per token* and multiplies by the amount, so you never have to think in totals. Storing totals means token
decimals can never cause per-unit rounding.

Example: 1,000 tokens at a strike of 0.002 ETH each is stored as `amount = 1000`, `strike = 2 ETH`.

### Expiry and fill deadline

Each offer has two times:

- **Expiry**: the moment the option stops being exercisable. It must be between **1 hour** and **90 days** away.
- **Fill deadline** (offer deadline): the last moment a buyer can fill the offer. It must be in the future and
  **no later than expiry**. After it passes, the seller can reclaim the collateral of an unfilled offer.

Exercise requires `now < expiry`. Expire requires `now ≥ expiry`. There is no moment when both or neither are
possible.

### Option NFT

Every filled option is an ERC-721 token (**OptionNFT**). Whoever holds the NFT holds the option: you can transfer
it or sell it elsewhere, and the new holder can exercise. The NFT is burned on exercise or expiry. Its artwork and
metadata (`tokenURI`) are generated fully on-chain as SVG.

Token ids encode the market: `id = (tag << 248) | localId`.

| Tag | Market |
|---|---|
| 1 | v1 calls |
| 2 | v1 puts |
| 3 | v2 calls |
| 4 | v2 puts |

### Epochs

Time is divided into **epochs of 24 hours**, aligned to 00:00 UTC (`epoch = block.timestamp / 86400`). Fees are
split once per epoch, and new stake becomes active at the start of the next epoch.

### ETH and WETH

The markets hold and pay **WETH** internally. A stateless **Router** lets you pay with plain ETH: it wraps exactly
what's needed, calls the market for you, refunds any excess in the same transaction, and never holds a balance.

---

## 4. Guide: buy an option

**Page: `/market`**

1. Pick a token. The chart shows its price in ETH from Uniswap v4 swaps (or a Robinhood quote feed for stock
   tokens), with every open strike drawn as a horizontal line and past fills and exercises as markers. Choose
   1m / 5m / 15m / 1h candles.
2. Browse open offers. Each row shows kind (call/put), amount, strike per token, premium, expiry, distance from
   spot ("vs spot"), and break-even.
3. Click **Buy** and review the dialog: premium, fee and what you receive.
4. Confirm in your wallet. The site sends one transaction:
   - Calls: `Router.buyWithETH(id, maxPremium)`
   - Puts: `Router.buyPutWithETH(id, maxPremium)`

   You pay the premium in ETH. `maxPremium` protects you if anything about the offer changed.
5. The Option NFT lands in your wallet, and the position appears under **Positions → Holding**.

**What happens to your premium:** 3% goes to the FeeVault and 97% goes to the seller, in WETH.

> **You cannot buy your own offer** (`SelfTrade`), and you cannot fill an offer after its fill deadline
> (`OfferExpired`).

---

## 5. Guide: sell a covered call

**Page: `/sell` → Covered call**

1. Choose the **token** and the **amount** to lock.
2. Set the **strike per token (ETH)**. The chart shows the current price and your strike as a line.
3. Choose **Expires in**: 1 day, 3 days, 1 week, 2 weeks, 30 days or 90 days.
4. Choose **Offer can be filled for**: 6 hours, 1 day, 3 days, or until expiry.
5. Set the **premium (total, ETH)**. The page shows a Black-Scholes premium hint for reference only. It is never
   enforced.
6. Review the summary: what you lock, the fee preview, and what you receive.
7. Sign:
   - an `approve` of the token to the CallMarket, if your allowance is too low, then
   - `CallMarket.createOffer(token, amount, strike, premium, expiry, offerDeadline)`.

Every contract rule is checked in the browser before you sign, and every transaction is simulated first.

**Outcomes**

| What happens | You receive |
|---|---|
| Filled | Premium − 3% fee, in WETH, at fill time |
| Exercised | Strike − 0.1% fee, in WETH. Your tokens go to the holder. |
| Expires unexercised | Your tokens come back (anyone can trigger `expire`) |
| Not filled by the deadline | Click **Reclaim** on Positions to get your tokens back |
| You cancel before a fill | Tokens come back immediately |

**Worked example.** You lock 100,000 ZEPH with a total strike of 3 ETH and a premium of 0.1 ETH.
- A buyer fills: you get **0.097 WETH**, the FeeVault gets 0.003.
- The buyer exercises with 3 ETH: you get **2.997 WETH**, the FeeVault gets 0.003, the buyer gets the 100,000 ZEPH.

---

## 6. Guide: sell a cash-secured put

**Page: `/sell` → Cash-secured put**

Puts must be enabled for the token (`putsEnabled`). The form is the same as for calls. The difference is what you
lock: **the total strike, in ETH**.

You sign **one** transaction: `Router.createPutOfferWithETH(token, amount, strike, premium, expiry, offerDeadline)`
with `value = strike`. The Router wraps your ETH to WETH and escrows it in the PutMarket on your behalf.

**Outcomes**

| What happens | You receive |
|---|---|
| Filled | Premium − 3% fee, in WETH |
| Exercised | `amount` tokens from the holder. The holder receives your strike − 0.1%. |
| Expires unexercised | Your WETH comes back |
| Not filled / cancelled | Your WETH comes back |

**Worked example.** You lock 2 ETH as the strike for 1,000 tokens (0.002 ETH each), premium 0.05 ETH.
- A buyer fills: you get **0.0485 WETH**.
- The holder exercises: they deliver 1,000 tokens to you and receive **1.998 WETH**; 0.002 goes to the FeeVault.

---

## 7. Guide: manage your positions

**Page: `/positions`**

### Holding (options you own)

| Action | When | Transaction |
|---|---|---|
| **Exercise a call** | Before expiry | `Router.exerciseWithETH(id)` with `value = strike`. You pay the strike in ETH and receive the tokens. |
| **Exercise a put** | Before expiry | `approve` the token to the PutMarket, then `PutMarket.exercisePut(id)`. You deliver the tokens and receive strike − 0.1% in WETH. |

> **Exercise early.** Robinhood Chain has a single sequencer. A transaction that lands at or after expiry fails
> with `OptionExpired`. Don't wait for the last minutes.

### Selling (offers you made)

| Action | When | Transaction |
|---|---|---|
| **Cancel** | Offer is open (not yet filled) | `cancelUnfilled(id)`: collateral returns immediately |
| **Reclaim** | Fill deadline passed, never filled | Same `cancelUnfilled(id)` |
| **Expire** | Filled, and expiry has passed | `expire(id)`: collateral returns to you. Anyone can call this; the keeper usually does it for you. |

### Wallet

- **Unwrap WETH → ETH** calls `WETH.withdraw(amount)` on your full WETH balance.
- **History** lists your exercised, expired and cancelled positions.

---

## 8. Guide: stake $KYTE

**Page: `/stake`**

Stakers receive **30% of all protocol fees**, paid in **WETH** once per epoch.

1. **Stake.** Approve `$KYTE` to the StakingPool, then `stake(amount)`. Your stake is **pending** until the
   current epoch ends (00:00 UTC).
2. **Earn.** From the next epoch, your stake is **active** and earns a share of every fee split.
3. **Claim.** `claim()` sends your accrued WETH to your wallet at any time.
4. **Unstake.** `unstake(amount)` is immediate. It takes pending stake first, then active stake.

**The activation lock.** Stake that has just become active is locked for the epoch it activates in. Staking in
epoch *N* means:

| Epoch | Your stake |
|---|---|
| *N* (when you stake) | Pending. Can be withdrawn at any time. Earns nothing yet. |
| *N + 1* | Active and earning. **Locked**: it can't be unstaked this epoch. |
| *N + 2* onward | Active, earning, and free to unstake. |

This blocks "stake one second before the split, collect, leave". Every reward is earned by stake that stayed
through a full epoch.

The page shows your active, pending, locked and claimable amounts, plus a countdown to the next epoch.

---

## 9. The Proof page

**Page: `/proof`**

The Proof page is built **only** from on-chain events, with a link to every transaction on the explorer:

- **`FeesSplit`**: each epoch's split into stakers / buyback / ops.
- **`Burned`**: each buyback (WETH in, `$KYTE` burned).
- Totals: fees split, paid to stakers, WETH spent on buybacks, `$KYTE` burned, plus a burn curve over time.

Nothing on this page comes from an off-chain database you have to trust. You can rebuild it yourself from the
FeeVault and BuybackBurner events.

---

## 10. Fees

| Fee | Rate | Charged on | Paid by | Hard cap (immutable) |
|---|---|---|---|---|
| Premium fee | **3%** (300 bps) | The premium, when an offer is filled | Deducted from what the seller receives | 10% |
| Exercise fee | **0.1%** (10 bps) | The strike, when an option is exercised | Deducted from what the strike receiver gets | 1% |
| Swap fee (KyteHook) | **0.1%** (10 bps) | WETH side of swaps in the `$KYTE`/WETH Uniswap v4 pool, when WETH is the swap's unspecified side ([details](#appendix-e-kytehook-deep-dive)) | Traders in that pool | 1% |
| Cancel / expire | Free | | | |

- Fees are **snapshotted per position** at creation. A later fee change only applies to new positions.
- All fees flow to the **FeeVault** in WETH and are split once per epoch:

| Destination | Share | Notes |
|---|---|---|
| `$KYTE` stakers | **30%** | Can never be set below 20% |
| Buy-and-burn | **20%** | Swapped for `$KYTE` on Uniswap v4 and burned |
| Operations | **50%** | Ops Safe (multisig) |

---

## 11. Rules and limits

| Rule | Value |
|---|---|
| Expiry | 1 hour to 90 days from creation |
| Fill deadline | In the future, and ≤ expiry |
| Minimum premium | 0.0005 ETH (total) |
| Minimum strike | Per token, set in the registry (total strike, in WETH) |
| Exposure cap | Per token, per market: total underlying in open + filled positions |
| Open offers per seller | At most 200 at a time, per market |
| Tokens | Only listed and enabled tokens; puts need puts enabled as well |
| Fee-on-transfer / rebasing tokens | Rejected: the escrow must receive exactly the stated amount |
| Self-trade | You can't buy your own offer |
| Pause | Blocks only new offers, fills, new stake and buybacks. Exits always work. |

---

## 12. Risks

- **Sellers** give up upside above the strike (calls), or must buy tokens that may keep falling (puts).
- **Buyers** can lose the entire premium if the option isn't worth exercising.
- **Exercise early.** Robinhood Chain has a single sequencer. A transaction that lands at or after expiry fails.
- **Token risk.** Listed tokens can be volatile or illiquid, or have admin controls such as pausing or blocklists.
  Tokenized stocks follow their own issuer's rules and trading hours.
- **Price display.** Charts and "vs spot" use Uniswap v4 swaps or external quotes. The option itself never uses a
  price feed, so check the price yourself before exercising.
- **Smart contract risk.** Contracts can have bugs. Only use funds you can afford to lose.
- **Governance risk.** The timelock can change settings for *new* positions (fees within hard caps, listings,
  caps). Check the current timelock delay on-chain ([section 21](#21-governance-and-roles)).

There is no leverage, no margin and no liquidation. A position can't go below zero.

---

## 13. FAQ

**Is Kyte live?**
Yes, on Robinhood Chain mainnet. Start small and read the risks first.

**Can I lose more than I put in?**
No. There is no leverage and no margin. A buyer can lose the full premium. A seller can give up upside (calls) or
be assigned tokens worth less than the strike (puts), but no position can be liquidated or go below zero.

**Who can touch my collateral?**
Only you, as seller, or the holder of the option you sold, according to the rules of the contract. No admin,
guardian or multisig can move it. There is no sweep or rescue function.

**What is `$KYTE` for?**
Stakers receive 30% of all protocol fees in WETH, once per epoch. New stake starts earning from the next epoch and
is locked through it. 20% of fees buy `$KYTE` on Uniswap v4 and burn it.

**Why did I receive WETH instead of ETH?**
The markets settle in WETH. Unwrap it on the Positions page.

**What happens if nobody expires my option?**
Nothing bad. An expired option can't be exercised. The keeper normally calls `expire` within minutes, and anyone
(including you) can call it at any time after expiry to return the collateral to the seller.

**Can I sell my option before expiry?**
Yes. The option is an NFT. Transfer or sell it, and the new holder can exercise.

**What if the market is paused?**
You can still cancel, exercise, expire, unstake and claim. Only new offers, fills, new stake and buybacks stop.

**Is Kyte affiliated with Robinhood?**
No. Kyte is built on Robinhood Chain, an Ethereum L2. The name is used only to identify the network. Kyte is not
affiliated with or endorsed by Robinhood.

**Which wallets work?**
Any Ethereum wallet installed in your browser. The picker shows only wallets it detects.

**How do I report a vulnerability?**
Email contact@kyte.sh or send a direct message to @useKyte on X. Please do not disclose publicly until we have
responded.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Covered call** | A call option fully backed by the seller's locked tokens |
| **Cash-secured put** | A put option fully backed by the seller's locked ETH (WETH) |
| **Strike** | Total WETH exchanged on exercise, for the whole lot |
| **Premium** | Total WETH the buyer pays to fill the offer |
| **Expiry** | Last moment (exclusive) the option can be exercised |
| **Fill deadline** | Last moment an offer can be bought |
| **Exercise** | Using the option: swap at the strike before expiry |
| **Expire** | Closing a filled option after expiry; collateral returns to the seller |
| **Option NFT** | ERC-721 representing a filled option; the holder can exercise |
| **Epoch** | 24-hour period aligned to 00:00 UTC |
| **FeeVault** | Contract that collects all fees and splits them each epoch |
| **Keeper** | Bot (or anyone) that runs expiries, splits and buybacks |
| **Timelock** | Delayed-execution contract that owns protocol settings |
| **Guardian** | Multisig that can only pause and disable, never enable or move funds |
| **TWAP** | Time-weighted average price, here from KyteHook over 10 minutes |
| **WETH** | Wrapped ETH (ERC-20). Mainnet: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

---

# Part 2: Protocol

## 15. Architecture

```
 Browser (Next.js, kyte.sh) ──reads──► Indexer API ──follows──► Robinhood Chain
        │ wallet transactions                                        │
        ▼                                                            │
   Router (ETH ⇄ WETH) ──► CallMarket / PutMarket ──mint/burn──► OptionNFT
                                 │  reads AssetRegistry ◄── Timelock (settings) / Guardian (pause, disable)
                                 │  fees (WETH)
                                 ▼
 KyteHook (v4 swap fee) ───► FeeVault ── split() once per epoch ─┬─► StakingPool    (30%) → stakers claim WETH
                                                                 ├─► BuybackBurner  (20%) → UniswapV4Adapter → PoolManager → burn $KYTE
                                                                 └─► Ops Safe       (50%)

 Keeper bot: expireMany · split · buyAndBurn
```

**Components**

| Layer | What | Where |
|---|---|---|
| Contracts | Solidity 0.8.28 (Foundry), Uniswap v4 hook and adapter on 0.8.26 | `contracts/` |
| Indexer | Node 22 chain follower → SQLite → JSON API | `indexer/src/index.mjs` |
| Keeper | Node bot: expire, split, buyback | `keeper/src/index.mjs` |
| Website | Next.js 16, React 19, wagmi 2, viem 2, Privy | `src/` |
| Ops | Render Blueprint, Docker Compose, macOS launchd services, mainnet scripts | `render.yaml`, `ops/`, `scripts/mainnet/` |

---

## 16. Position lifecycle

```
              createOffer                     buy (before fill deadline)
 (nothing) ─────────────►  OPEN  ────────────────────────────────►  FILLED ──┬─ exercise (now < expiry) ─► EXERCISED
                             │                                              └─ expire (now ≥ expiry, anyone) ─► EXPIRED
                             └─ cancelUnfilled (seller, any time while open) ─► CANCELLED
```

`Status` only moves forward: `None → Open → {Cancelled | Filled → {Exercised | Expired}}`. Terminal status is
written **before** any token transfer.

| Transition | Who | Checks | Effects |
|---|---|---|---|
| **create** | Seller (or Router for ETH puts) | Not paused; asset enabled (puts: puts enabled); amount > 0; strike ≥ min strike; premium ≥ 0.0005 ETH; 1 h ≤ duration ≤ 90 d; now < deadline ≤ expiry; exposure + amount ≤ cap; < 200 open offers | Fee rates snapshotted; collateral pulled with exact balance-delta check; `OfferCreated` |
| **buy** | Anyone but the seller (Router: on behalf of a beneficiary) | Not paused; Open; now ≤ deadline; premium ≤ maxPremium | Status Filled; NFT minted to buyer; premium fee → FeeVault, rest → seller; `OptionBought` |
| **cancelUnfilled** | Seller | Open | Status Cancelled; collateral → seller; `OfferCancelled` |
| **exercise** (call) | NFT holder (or Router for holder) | Filled; now < expiry; caller holds NFT | Status Exercised; NFT burned; holder pays strike: fee → FeeVault, rest → seller; tokens → holder; `Exercised` |
| **exercisePut** | NFT holder | Filled; now < expiry; caller holds NFT | Status Exercised; NFT burned; tokens pulled exactly from holder → seller; WETH strike: fee → FeeVault, rest → holder; `Exercised` |
| **expire** | Anyone | Filled; now ≥ expiry | Status Expired; NFT burned; collateral → seller; `Expired` |
| **expireMany** | Anyone (keeper) | ≤ 50 ids; skips ids that can't be expired instead of reverting | Same as expire, per id |

---

## 17. Smart contracts

All core contracts are **immutable** (no proxies). Settings that can change are owned by the timelock.

### AssetRegistry

Token whitelist. v1 holds at most 25 assets, v2 at most 300.

| Function | Access | Notes |
|---|---|---|
| `addAsset(token, cap, minStrike)` | Timelock | Lists and enables a token; reads its `decimals()` |
| `addAssets(tokens[], caps[], minStrikes[], putsOn)` | Timelock | Batch listing (v2), optionally with puts on |
| `setEnabled(token, bool)` | Enable: timelock · Disable: guardian or timelock | Disabling blocks new offers only |
| `setPutsEnabled(token, bool)` | Enable: timelock · Disable: guardian or timelock | |
| `setCap(token, cap)` / `setMinStrike(token, minStrike)` | Timelock | |
| `isEnabled`, `putsEnabled`, `cap`, `minStrike`, `getAsset`, `assetCount`, `listedTokens(i)` | View | `putsEnabled` requires both flags |

### OptionNFT

ERC-721, one token per filled option. `setMarkets(call, put)` can be called once, by the deployer. Only the matching
market can mint or burn ids with its tag (`marketOf(id)`). Uses `_mint`, not `_safeMint`, so there are no receiver
callbacks. `tokenURI` returns on-chain SVG and metadata.

### OptionMarketBase (shared by CallMarket and PutMarket)

| Function | Access | Paused? |
|---|---|---|
| `buy(id, maxPremium)` | Anyone | Blocked |
| `buyFor(id, maxPremium, beneficiary)` | Router only | Blocked |
| `cancelUnfilled(id)` | Seller | Works |
| `expire(id)` | Anyone | Works |
| `expireMany(ids[])` | Anyone, ≤ 50 | Works |
| `getPosition(id)`, `idOf(localId)`, `locked(token)`, `exposure(token)`, `openOffers(seller)`, `lastLocalId` | View | |
| `setFees(premiumBps, exerciseBps)` | Timelock, within hard caps; new positions only | |
| `setRouter(router)` | Timelock | |
| `pause()` / `unpause()` | Guardian or timelock / timelock only | |

**Position struct** (packed into 5 storage slots):

```solidity
struct Position {
    address seller;  uint64 expiry;  uint32 feeBpsPremium;        // slot 0
    address token;   uint64 offerDeadline; uint16 feeBpsExercise; Status status; // slot 1
    uint256 amount;  // underlying tokens
    uint256 strike;  // total WETH on exercise
    uint256 premium; // total WETH to fill
}
```

### CallMarket

- `createOffer(token, amount, strike, premium, expiry, offerDeadline)`: escrows `amount` tokens.
- `exercise(id)`: holder pays `strike` in WETH (approve first) and receives the tokens.
- `exerciseFor(id, holder)`: Router only. Router pays wrapped ETH, and the market still checks that `holder` owns the NFT.

### PutMarket

- `createPutOffer(...)`: escrows `strike` WETH from the caller.
- `createPutOfferFor(seller, ...)`: Router only. Escrows WETH the Router wrapped from the seller's ETH.
- `exercisePut(id)`: holder delivers exactly `amount` tokens (approve first) and receives `strike − fee` in WETH.

CallMarket and PutMarket are separate contracts, so each keeps its own escrow.

### Router

Stateless ETH periphery. Wraps exactly what's needed, refunds the excess, and reverts if it ends with any ETH or
WETH balance (`RouterHoldsBalance`).

| Function | `msg.value` must cover |
|---|---|
| `buyWithETH(id, maxPremium)` | premium |
| `buyPutWithETH(id, maxPremium)` | premium |
| `exerciseWithETH(id)` | strike |
| `createPutOfferWithETH(token, amount, strike, premium, expiry, deadline)` | strike |

### FeeVault

Receives every fee in WETH. `split()` can be called by **anyone**, at most once per epoch, while there is a balance
and the destinations are set. It works while paused. Rounding dust stays for the next split.

| Function | Access |
|---|---|
| `split()` | Anyone |
| `setDestinations(stakingPool, buybackBurner, opsSafe)` | Timelock |
| `setSplit(stakers, buyback, ops)` | Timelock; must sum to 10,000 bps and stakers ≥ 2,000 |
| `currentEpoch()`, `lastSplitEpoch`, `totalSplit`, `stakersBps`, `buybackBps`, `opsBps` | View |

### StakingPool

Stake `$KYTE` and earn WETH. See [Staking mechanics](#19-staking-mechanics).

| Function | Access | Paused? |
|---|---|---|
| `stake(amount)` | Anyone | Blocked |
| `unstake(amount)` | Staker | Works |
| `claim()` | Staker | Works |
| `notifyReward(amount)` | FeeVault only | |
| `setMinClaim(x)` | Timelock, ≤ 0.1 ETH | |
| `balancesOf`, `lockedOf`, `pendingRewards`, `stakeOf`, `currentEpoch`, `epochEndsAt`, `activeSupply`, `pendingSupply`, `undistributed`, `totalClaimed` | View | |

### BuybackBurner

Holds the buyback share. Its WETH can go nowhere except into a swap whose output is burned.

| Function | Access |
|---|---|
| `buyAndBurn(wethIn, minTokenOut, deadline)` | Keeper only; blocked while paused |
| `setKeeper`, `setAdapter`, `setBounds(maxPerCall, maxSlippageBps ≤ 2000)` | Timelock |
| `lastPrice`, `totalWethIn`, `totalBurned`, `maxPerCall`, `maxSlippageBps` | View |

Burns by calling `token.burn()`, or by transferring to `0x…dEaD` if the token has no burn function.

### UniswapV4Adapter

Swaps WETH → `$KYTE` directly on the Uniswap v4 PoolManager (`unlock → swap → settle/take`) and refunds any
partial fill. `quoteWethForToken` uses the **KyteHook 10-minute TWAP** when the pool is hooked; a hooked adapter
never falls back to spot. `quoteSpot` exposes the spot quote for comparison.

### KyteHook

A Uniswap v4 hook on the `$KYTE`/WETH pool. Details in [section 20](#20-uniswap-v4-integration-and-kytehook).

---

## 18. Revenue: fee vault, split and buyback

```
 premium fee (3%) ─┐
 exercise fee (0.1%)┼──► FeeVault (WETH) ── split() once per epoch, anyone ──► 30% StakingPool.notifyReward
 KyteHook swap fee ─┘                                                    ├─► 20% BuybackBurner
                                                                         └─► 50% Ops Safe
 BuybackBurner ── keeper: buyAndBurn(wethIn ≤ maxPerCall, minOut) ──► UniswapV4Adapter ──► v4 PoolManager ──► burn
```

**Buyback safety.** `buyAndBurn` enforces two on-chain price floors, so even a stolen keeper key can't hand the
WETH to a sandwich attack:

1. **TWAP floor**: `minTokenOut ≥ adapter.quoteWethForToken(wethIn) × (1 − maxSlippageBps)`. The quote is the
   10-minute KyteHook TWAP, checked in the same transaction.
2. **Last-price floor**: `minTokenOut ≥ wethIn × lastPrice × (1 − maxSlippageBps)`, so the floor can't be walked
   down faster than the TWAP moves.

The swap size per call is capped by `maxPerCall` (1 ETH at launch), so buybacks are spread over the epoch.
Current `maxSlippageBps` is 500 (5%), with a hard cap of 2,000 (20%).

The keeper adds its own off-chain checks: it skips a buyback when spot and TWAP disagree by more than 3%, and it
sets `minOut = quote × (1 − 1%)` by default.

---

## 19. Staking mechanics

The StakingPool uses a **reward-per-share accumulator** over *active* stake, plus a global **pending bucket**.

- `stake` adds to your pending balance for the current epoch. The tokens must arrive exactly (fee-on-transfer is
  rejected).
- When an epoch ends, the next interaction "rolls" the global pending batch into active supply and records the
  accumulator value at that moment (`activationAcc[epoch]`). The batch only earns rewards notified afterwards.
- `notifyReward` (FeeVault only) adds `amount × 1e36 / activeSupply` to the accumulator. If there is no active
  stake, the reward goes to `undistributed` and is added to the next notification.
- Newly activated stake is recorded as `recent` and is locked until `pendingEpoch + 2`. Pending stake is never
  locked.
- `unstake` takes from pending first, then from unlocked active stake (`StakeLocked` otherwise).
- `claim` pays all accrued WETH, if it is at least `minClaim` (currently 0; the timelock can raise it to at most
  0.1 ETH).

**Invariant:** the pool always holds enough WETH for every staker's accrued plus pending rewards (fuzz-tested
solvency).

---

## 20. Uniswap v4 integration and KyteHook

Kyte does not run its own exchange. Three parts of the protocol sit on Uniswap v4 on Robinhood Chain:

1. **Buyback and burn.** `UniswapV4Adapter` swaps the buyback WETH for `$KYTE` on the v4 PoolManager, and the
   BuybackBurner burns the output in the same transaction.
2. **KyteHook on the `$KYTE`/WETH pool** (pool key: fee 3000, tickSpacing 60, hooks = KyteHook):
   - **TWAP oracle.** After `afterInitialize` and every `afterSwap`, it writes a tick observation into a 128-slot
     ring buffer. `consult(poolId, secondsAgo)` returns the mean tick and `twapSqrtPriceX96` the TWAP price. The
     adapter uses a **10-minute** window.
   - **Protocol fee.** Through `afterSwapReturnDelta`, it takes `feeBps` (currently **10 = 0.1%**, max 100 = 1%) of
     the WETH side of each swap and sends it to the FeeVault, where it joins the 30/20/50 split.
   - Owner = the timelock (`setFee`, `setFeeVault`).
   - A v4 hook's permissions are encoded in its address, so KyteHook is deployed at a **mined CREATE2 address**
     (`contracts/script/HookDeployer.sol`) with the `afterInitialize`, `afterSwap` and `afterSwapReturnDelta`
     bits set.
3. **Price feed.** The indexer decodes v4 `Swap` events for the configured pools into prices and candles for the
   website's charts.

Without the hook on the pool there is no TWAP, and `buyAndBurn` refuses to run.

---

## 21. Governance and roles

| Role | Holder (mainnet) | Can | Cannot |
|---|---|---|---|
| **Timelock** | OpenZeppelin `TimelockController` `0xf8E6…2893`, proposer/executor = admin Safe `0x2220…220a` | List and enable tokens, set caps and min strikes, set fees (within hard caps), set split (stakers ≥ 20%), set router/adapter/keeper/bounds/destinations, set hook fee, unpause, change guardian | Move collateral; change hard caps; change fees on existing positions |
| **Guardian** | Safe `0x9F43…0EF0` | `pause()` markets, staking and burner; disable tokens and puts, **instantly** | Unpause; enable anything; move funds |
| **Keeper** | Dedicated EOA (see `BuybackBurner.keeper()`) | `buyAndBurn` within the timelock's bounds | Anything else (expire and split are permissionless anyway) |
| **Ops Safe** | Safe `0xd976…aDA5` | Receives 50% of fees | Anything in the protocol |

**Timelock delay.** The live delay is whatever `getMinDelay()` returns on the timelock. At the time of writing it
is **600 seconds (10 minutes)**:

```bash
cast call 0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893 "getMinDelay()(uint256)" --rpc-url https://rpc.mainnet.chain.robinhood.com
```

`Deploy.s.sol` supports a 48-hour delay (`TIMELOCK_DELAY=172800`). Raising the delay is a timelock operation
(`updateDelay`).

**Every setting change emits an event**: `ParamChanged(key, old, new)`, `AddressChanged(key, old, new)`,
`Paused`, `Unpaused`, `AssetAdded`, `AssetEnabled`, `PutsEnabled`.

---

## 22. Security model

**Design rules**

- No function moves collateral anywhere except to its seller or the option holder. There is **no sweep or rescue**.
- Checks → effects → interactions everywhere. Terminal status is set before any transfer.
- `nonReentrant` (OpenZeppelin `ReentrancyGuardTransient`, EIP-1153 transient storage) on every state-changing
  entry point.
- `_mint` instead of `_safeMint`: no receiver callbacks during a fill.
- **Exact balance-delta checks** on every pull, so fee-on-transfer and similar tokens revert (`FeeOnTransfer`).
- Separate escrows for calls and puts. `locked[token]` ledgers per market (invariant: balance ≥ locked).
- Fees are snapshotted per position; hard caps are compile-time constants (10% premium, 1% exercise, stakers ≥ 20%).
- Pause only blocks actions that open new exposure.
- Router: wraps exact amounts, refunds, and must end empty. Markets accept `*For` calls only from the timelock-set
  router, and still check NFT ownership.
- Buybacks: two on-chain price floors (TWAP + last price) and a per-call cap.
- Staking: activation delay plus activation lock against just-in-time staking.
- Mainnet deploy guards: guardian, ops, admin and timelock must be contracts (Safes); the deployer can't be the
  timelock.

**Website hardening**

- Strict Content-Security-Policy with a fresh nonce per request (`src/proxy.ts`): `script-src 'self' 'nonce-…'
  'strict-dynamic'`, `frame-ancestors 'none'`, and `connect-src` limited to the chain RPC, the indexer and the
  wallet providers.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict `Permissions-Policy`, no `X-Powered-By`, no production source
  maps.
- Every write is simulated before the wallet is asked to sign.

**Testing:** 106 Foundry tests covering every function and revert path, fuzzing (fee conservation, exercise-xor-expire
around expiry ±10 s, decimals 0–24, vault and pool solvency), handler invariants (collateral ledgers, forward-only
status, NFT exists iff Filled, Router never holds a balance) and swaps on a real Uniswap v4 PoolManager.

**Security self-assessment (9 November 2026, v1.1).** The team ran Slither 0.11.4 and Aderyn 0.6.8 on the
Sourcify-verified source of all 12 deployed contracts, reviewed every result by hand and read the live configuration
at block 109,974,684. Result: 0 critical, 0 high, 0 medium, 5 low and 5 informational findings, all acknowledged. It
is a self-assessment, not a third-party audit; an independent audit is planned. The report, a PDF and the raw tool
outputs are at [kyte.sh/audit](https://kyte.sh/audit).

**Reporting vulnerabilities:** contact@kyte.sh or a direct message to @useKyte on X.

---

## 23. Markets v1 and v2

Kyte runs **two market sets side by side** on mainnet. They share the same timelock, guardian, FeeVault,
StakingPool and BuybackBurner.

| | v1 | v2 |
|---|---|---|
| AssetRegistry capacity | 25 assets | 300 assets (Robinhood Stock Tokens + crypto) |
| Option NFT id tags | 1 (calls), 2 (puts) | 3 (calls), 4 (puts) |
| New offers from the website | No | **Yes** |
| Existing positions | Keep settling: buy, exercise, cancel, expire all work | |
| Deployed at block | Original deploy | `105677746` |

**How the software picks a market:** the website sends new offers and listings to v2. For an existing position it
reads the tag from the id (`id >> 248`): tags 1–2 go to the v1 contracts, tags 3–4 to v2 (`marketsFor` in
`src/lib/chains.ts`). The indexer and keeper watch all four markets.

**What v2 lists:** every active Robinhood Stock Token deployed on chain 4663 (from Robinhood's asset API), with an
exposure cap worth about $50,000 at listing and a minimum total strike of 0.0001 ETH; every token still enabled in
v1, with its v1 settings; and a screened list of trending Robinhood Chain tokens
(`scripts/mainnet/v2-extra-tokens.json`) with smaller caps. Puts are enabled for all of them. No two listed tokens
may share an on-chain symbol, because prices, charts and offers are keyed by symbol.

---

## 24. Deployed addresses

**Robinhood Chain mainnet (4663).** Explorer: https://robinhoodchain.blockscout.com

### Shared protocol

| Contract | Address |
|---|---|
| FeeVault | `0x78c569A1137B78cB78F42c42B4B6C2b8F1E3dDef` |
| StakingPool | `0x4eD46d734e3Ddd9BF21364B9DfFBb2Ee030CEf8b` |
| BuybackBurner | `0xAF341cFdaEB96c18784ba60b2fdd51A7153E42d9` |
| UniswapV4Adapter | `0x9376B2091e50A17ac14fc8dA2DE7e2368B3b0fa9` |
| KyteHook | `0x77e52E93Aa0892b29a4527Af4f3a79F01cfa9044` |
| `$KYTE` token | `0x3849DcF9FA77EC5c21D57d841a268E77830800aF` |
| Timelock | `0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893` |
| Admin Safe | `0x22201B8FdFC55e4A9e39Ac88480CC7018799220a` |
| Guardian Safe | `0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0` |
| Ops Safe | `0xd97693DF18dd20b8C7A542ea0E167c75F630aDA5` |

### Markets v2 (current)

| Contract | Address |
|---|---|
| AssetRegistry | `0x02f571e10B9c7303EB7A6284A7137b146e18658D` |
| CallMarket | `0x15B5d324960234B193246B122C555e88E341eD72` |
| PutMarket | `0x1025f5b1f7549a1192226ddC0D36E1359A8D1305` |
| OptionNFT | `0xFA459da73EF7a9764858B2FF2AF67c61D105ABdb` |
| Router | `0xf1648a2cDE31A2F80cb5Ba8c544f7FC7af826BCd` |

### Markets v1 (settling)

| Contract | Address |
|---|---|
| AssetRegistry | `0xcD076486FBd192e2E942dA9DB2B78817DF0d5235` |
| CallMarket | `0x459cF18A424271A417547F6B349e962c09e492EE` |
| PutMarket | `0xD1a3c2Fa0E7901437929B7518AD66d71B1d676a4` |
| OptionNFT | `0x71B515C3786bF8897368f548d5DbBc2423E73391` |
| Router | `0xe17887A4BA9a373ec94a00D5F0c812fa6a994Ad4` |

### External

| Contract | Address |
|---|---|
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| Uniswap Universal Router (v2.1.2) | `0x204FAca1764B154221e35c0d20aBb3c525710498` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

The source of truth is `contracts/deployments/4663.json`. The website's `/docs` page renders the live list from
the same file.

---

## 25. Events reference

| Event | Emitted by | Fields |
|---|---|---|
| `OfferCreated` | Markets | `id` (indexed), `seller` (indexed), `token` (indexed), `amount`, `strike`, `premium`, `expiry`, `offerDeadline` |
| `OfferCancelled` | Markets | `id` |
| `OptionBought` | Markets | `id`, `buyer`, `premium`, `fee` |
| `Exercised` | Markets | `id`, `holder`, `strike`, `fee` |
| `Expired` | Markets | `id`, `caller` |
| `FeesSplit` | FeeVault | `epoch` (indexed), `stakers`, `buyback`, `ops` |
| `Burned` | BuybackBurner | `wethIn`, `tokenOut` |
| `Staked` | StakingPool | `user`, `amount`, `activeFromEpoch` |
| `Unstaked` | StakingPool | `user`, `amount` |
| `Claimed` | StakingPool | `user`, `amount` |
| `ParamChanged` | Any governed contract | `key` (bytes32), `oldValue`, `newValue` |
| `AddressChanged` | Any governed contract | `key`, `oldValue`, `newValue` |
| `Paused` / `Unpaused` | Any governed contract | `by` |
| `AssetAdded` | AssetRegistry | `token`, `cap`, `minStrike` |
| `AssetEnabled` / `PutsEnabled` | AssetRegistry | `token`, `enabled` |
| `HookFee` | KyteHook | `id` (PoolId, indexed), `currency` (indexed), `amount` |
| `FeeChanged` / `FeeVaultChanged` | KyteHook | old and new value |

Calls and puts share the market events; the id's tag says which market emitted it.

---

## 26. Errors reference

Custom errors and the messages the website shows for them.

| Error | Meaning |
|---|---|
| `AssetNotEnabled` | This token is not listed or is disabled |
| `PutsNotEnabled` | Puts are not enabled for this token |
| `AmountZero` | Amount must be greater than zero |
| `StrikeTooLow` | Strike is below the minimum for this token |
| `PremiumTooLow` | Premium is below 0.0005 ETH |
| `BadDuration` | Expiry must be between 1 hour and 90 days away |
| `BadDeadline` | Fill deadline must be in the future and no later than expiry |
| `CapExceeded` | Token has reached its exposure cap (or a buyback exceeds `maxPerCall` / balance) |
| `FeeOnTransfer` | Token takes a fee on transfer and can't be used |
| `TooManyOpen` | Seller already has 200 open offers |
| `WrongStatus(status)` | Position is not in the right state for that action |
| `OfferExpired` | Offer's fill deadline has passed |
| `OptionExpired` | Option has expired; it can't be exercised |
| `NotExpired` | Option hasn't expired yet |
| `NotSeller` / `NotHolder` | Only the seller / NFT holder can do that |
| `SelfTrade` | You can't buy your own offer |
| `PremiumAboveMax` | Premium is above your `maxPremium` |
| `MarketPaused` | Paused for new positions |
| `BatchTooLarge` | More than 50 ids in `expireMany` |
| `SplitTooSoon` / `NothingToSplit` | Already split this epoch / vault is empty |
| `BadSplit` / `FeeAboveCap` | Governance value outside its hard bounds |
| `NotConfigured` | Destination or adapter not set yet |
| `BelowMinClaim` | Nothing to claim, or below the minimum claim |
| `InsufficientStake` | Unstaking more than you have |
| `StakeLocked` | Newly activated stake is locked until the end of this epoch |
| `SlippageTooHigh` | Buyback `minOut` below the TWAP or last-price floor |
| `NotKeeper` | Only the keeper can run buybacks |
| `InsufficientValue` / `RefundFailed` / `RouterHoldsBalance` | Router: not enough ETH / refund failed / balance left over |
| `NotTimelock` / `NotGuardian` / `NotRouter` / `NotMarket` / `NotDeployer` | Access control |
| `MarketsAlreadySet`, `LengthMismatch`, `ZeroAddress`, `AssetExists`, `UnknownAsset`, `TooManyAssets`, `UnknownId` | Configuration errors |

---

# Part 3: Developers

## 27. Repository layout

```
gust-website/
├── contracts/                  Foundry project
│   ├── src/                    AssetRegistry, OptionNFT, OptionMarketBase, CallMarket, PutMarket, Router,
│   │                           FeeVault, StakingPool, BuybackBurner, adapters/UniswapV4Adapter, hooks/KyteHook,
│   │                           lib/ (Types, Constants, Errors, Events, Governed), interfaces/
│   ├── script/                 Deploy, DeployAdapter, DeployDevnet, DeployMarketsV2, CreateSafes, HookDeployer
│   ├── test/                   unit, fuzz, invariant, v4 pool tests
│   └── deployments/<chainId>.json   addresses (+ archive/, safes-4663.json)
├── indexer/src/index.mjs       chain follower → SQLite → JSON API      (indexer/abis/ = ABIs it reads)
├── keeper/src/index.mjs        expire / split / buyback bot
├── src/                        website (Next.js 16 app router)
│   ├── app/                    pages: / market sell positions stake proof docs terms privacy, api/indexer, api/rh-tokens
│   ├── components/             UI, wallet, charts, landing effects
│   ├── lib/                    config, chains, data, tx, pricing, format, generated/ (ABIs + addresses)
│   └── proxy.ts                per-request CSP nonce
├── scripts/
│   ├── sync-contracts.mjs      copies ABIs + addresses into src/lib/generated/
│   ├── export-service-abis.mjs ABIs for indexer/abis
│   ├── e2e-devnet.mjs          runs every UI action against the devnet and checks the indexer agrees
│   ├── devnet-trader.mjs       random v4 swaps so devnet charts move
│   ├── check-hook.mjs          shows KyteHook fees landing in the FeeVault on devnet
│   └── mainnet/                deploy, launch, timelock/Safe tooling, v2 listing, guardian tools
├── ops/                        Dockerfiles, compose env, macOS launchd services, run scripts
├── render.yaml                 Render Blueprint (indexer, keeper, web)
├── docker-compose.yml          self-hosted production
└── .github/workflows/ci.yml    contracts + web CI
```

---

## 28. Run everything locally

**Requirements:** Node 22.5+ (for `node:sqlite`), pnpm 10, Foundry (`~/.foundry/bin`).

```bash
pnpm install && (cd contracts && pnpm install)

pnpm devnet            # 1. local chain: anvil on :8547, chain id 31337
pnpm devnet:deploy     # 2. deploys the protocol + a real Uniswap v4 PoolManager and pools, seeds offers and stakes,
                       #    writes contracts/deployments/31337.json and syncs ABIs into the site
pnpm indexer           # 3. API on :4200
pnpm keeper            # 4. expiries, daily split, buybacks (uses anvil account #0 on devnet)
pnpm trader            # 5. optional: random swaps so the price charts move
pnpm dev               # 6. website on http://localhost:3010
```

Set `NEXT_PUBLIC_CHAIN_ID=31337` in `.env.local` for local development (the default is mainnet). In MetaMask, add
the network "Kyte Devnet" (RPC `http://127.0.0.1:8547`, chain id `31337`), or let the Connect button add it. On
devnet, the **Faucet** in the nav funds your wallet with ETH, WETH, `$KYTE` and the test tokens (ZEPH, GALE, NIMB).

**What the devnet contains:** the whole protocol, mock WETH, three test tokens, `$KYTE`, a real Uniswap v4
PoolManager with full-range WETH pools for KYTE, ZEPH, GALE and NIMB, a swap router, the adapter, KyteHook, and
seeded offers and stakes.

**End-to-end check:** `node scripts/e2e-devnet.mjs` runs all 19 user actions against the devnet (sell, buy,
exercise, cancel, expire, stake, claim, unwrap, faucet and more) and checks that the indexer agrees.

---

## 29. Configuration (environment variables)

### Website (`.env.local`; see `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `4663` | `4663` mainnet, `46630` testnet, `31337` local devnet |
| `NEXT_PUBLIC_RPC_URL` | Official Robinhood RPC / `:8547` | RPC override |
| `NEXT_PUBLIC_DEMO` | Demo **on** unless `0` | `0` = read the chain; anything else shows demo data |
| `NEXT_PUBLIC_INDEXER_URL` | empty | Indexer base URL, or `/api/indexer` to use the built-in gateway. Empty = read the chain directly from the browser |
| `NEXT_PUBLIC_PRIVY_APP_ID` | | Privy app id for the wallet picker. Add the site origin to the app's allowed origins |
| `NEXT_PUBLIC_SITE_URL` | | Public URL, used for Open Graph images |
| `INDEXER_INTERNAL_URL` or `INDEXER_INTERNAL_HOSTPORT` | | Server only: where `/api/indexer` forwards to (a private indexer) |

### Indexer

| Variable | Default | Meaning |
|---|---|---|
| `CHAIN_ID` | `31337` | Picks `contracts/deployments/<id>.json` and the default RPC |
| `RPC_URL` | devnet / official RPC | |
| `HOST` / `PORT` | `127.0.0.1` / `4200` | Use `0.0.0.0` only inside a container |
| `POLL_MS` | `2000` | Poll interval |
| `START_BLOCK` | `0` | First block to scan; set to the deploy block |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `RATE_LIMIT_PER_MIN` | `240` | Per-IP limit; returns 429 above it |
| `TRUST_PROXY` | | `1` = take the client IP from `X-Forwarded-For` |
| `DEPLOYMENTS_FILE` / `DB_FILE` | `contracts/deployments/<id>.json` / `indexer/data/<id>.sqlite` | |
| `BACKFILL_DAYS` / `BACKFILL_SPAN` | `30` / `9000000` | One-time swap history backfill for price pools |
| `QUOTES_URL` / `QUOTE_MS` / `QUOTE_DAYS` | Robinhood prices API / `30000` / `30` | Stock token quote feed, poll interval, retention |

### Keeper

| Variable | Default | Meaning |
|---|---|---|
| `CHAIN_ID`, `RPC_URL`, `START_BLOCK`, `DEPLOYMENTS_FILE` | | As for the indexer |
| `KEEPER_PRIVATE_KEY` / `KEEPER_PRIVATE_KEY_FILE` | anvil #0 on devnet only | Required off devnet. Prefer the file (secret mount) |
| `INTERVAL_MS` | `30000` | Loop interval |
| `ONCE` | | Run a single pass and exit (cron style) |
| `BUYBACK_MIN_WETH` | `0.01` | Don't buy back below this balance |
| `BUYBACK_SLIPPAGE_BPS` | `100` | `minOut = quote × (1 − slippage)` |
| `MAX_SPOT_TWAP_DEVIATION_BPS` | `300` | Skip a buyback when spot and TWAP disagree by more |
| `MAX_GAS_GWEI` | `1` off devnet | Gas price ceiling; jobs are skipped and alerted above it |
| `KEEPER_MIN_ETH` | `0.02` | Alert when the keeper wallet runs low on gas |
| `ALERT_WEBHOOK_URL` | | POSTs `{text}` on failures (Slack/Discord compatible) |

### Mainnet scripts (`scripts/mainnet/.env`, gitignored; see `env.example`)

`RPC_URL`, `ACCOUNT` (Foundry keystore name), `ADMIN_SAFE`, `GUARDIAN`, `OPS_SAFE`, `KEEPER`, `WETH`,
`POOL_MANAGER`, `KYTE_TOKEN`, `KYTE_PER_ETH`, and optionally `TIMELOCK`, `TIMELOCK_DELAY`, `FEE_BPS_PREMIUM`,
`FEE_BPS_EXERCISE`. **No private keys**: signing uses Foundry keystores.

---

## 30. Website architecture

**Stack:** Next.js 16 (app router), React 19, Tailwind 4, wagmi 2, viem 2, TanStack Query 5, Privy (wallet
picker, EIP-6963 detection of installed wallets only), Framer Motion, GSAP + ScrollTrigger, Lenis, Three.js /
react-three-fiber (aurora shader), TradingView Lightweight Charts, Phosphor icons, Geist fonts.

> This project uses Next.js 16, which has breaking changes from earlier versions (for example, middleware is now
> `src/proxy.ts`). Read `node_modules/next/dist/docs/` before changing framework-level code.

### Pages

| Route | Purpose |
|---|---|
| `/` | Landing: hero, how it works, fee split, live stats, proof bento, FAQ, call to action. Hero tabs: "Trending on Robinhood Chain" (`/api/rh-tokens`) and live open offers |
| `/market` | Token chart (candles, strike lines, markers), open offers, Buy |
| `/sell` | Create a covered call or cash-secured put |
| `/positions` | Holding / Selling / History, exercise, cancel, reclaim, expire, unwrap WETH |
| `/stake` | Stake, unstake, claim; epoch countdown |
| `/proof` | Fee splits and burns from events |
| `/docs` | Rules, fees, risks, every deployed address |
| `/terms`, `/privacy` | Legal |

### API routes (server)

| Route | What |
|---|---|
| `GET /api/indexer/<path>` | Same-origin, read-only gateway to a private indexer. Allow-listed paths only, GET only, 15 s timeout |
| `GET /api/rh-tokens` | Robinhood Chain tokens ranked by Uniswap v4 swaps in the last ~hour, read from the public RPC; 5-minute in-memory cache, one refresh at a time |

### Key modules (`src/lib`)

| File | Role |
|---|---|
| `config.ts` | Brand, fees, split, limits, demo flag, Privy id |
| `chains.ts` | Chain selection, RPC, explorer links, contract addresses from `generated/deployments.json`, v1/v2 market selection (`contracts`, `legacyMarkets`, `marketsFor(id)`) |
| `data.ts` | One data layer for every page: indexer API → direct chain reads → demo data. Hooks: `useAssets`, `useOffers`, `usePositions`, `useBalances`, `useStake`, `useProof`, `useStats`, `useActivity`, `useCandles`, `useMarkers`, `usePrices`, `useHealth` |
| `tx.ts` | `useTx()`: every write goes **simulate → sign → wait**, with a status card (Checking… / Confirm in your wallet / Waiting… / Confirmed / Failed) and friendly messages for custom errors. `approvalIfNeeded`, devnet faucet |
| `pricing.ts` | Black-Scholes premium hint (display only) |
| `generated/` | ABIs and addresses written by `scripts/sync-contracts.mjs`. Don't edit by hand |

### Theme

Design tokens live in one `@theme` block in `src/app/globals.css`: black `#000000` / `#181818` surfaces, white Geist
type, mint `#4DFCA9` accent, mono for labels and numbers, pill buttons, `cubic-bezier(0.22,1,0.36,1)` motion.

---

## 31. Indexer and API reference

### How it works

- Polls the chain every `POLL_MS`, **re-scans the last 8 blocks** on every poll, and uses the latest block's
  timestamp as "now" (never the wall clock).
- Events only mark a position as *touched*. The row is then re-read from the market (`getPosition`) and the NFT
  (`ownerOf`), so a reorg or a missed log can't leave a stale row.
- Watches v1 and v2 markets, registries, FeeVault, StakingPool, BuybackBurner, and Uniswap v4 `Swap` events for
  every pool in the deployments file.
- **Prices**, in ETH per token:
  - `uniswap-v4`: decoded from `Swap` events of configured pools (with a one-time 30-day backfill per pool);
  - `robinhood`: Robinhood Stock Token mid quotes (USD) ÷ ETH/USD (Coinbase, Kraken fallback), every 30 s;
    Ondo tokens (`…on`) follow their underlying ticker;
  - `dexscreener`: other crypto tokens, from their deepest pair.
- Storage: SQLite through `node:sqlite` (WAL). Tables: `meta`, `assets`, `offers`, `splits`, `burns`,
  `stake_events`, `events`, `prices`.
- Hardening: GET/OPTIONS only, URL ≤ 2 KB, every query parameter validated (400), per-IP rate limit, short caches on
  RPC-backed routes, generic 500 bodies, request timeouts, and it refuses to start if the RPC's chain id differs from
  `CHAIN_ID`.

### Routes

Amounts come back in human units (`amount`, `strike`, `premium`) alongside raw wei strings (`*Raw`).

| Route | Query | Returns |
|---|---|---|
| `GET /health` | | `chainId`, `chainTime`, `lastBlock`, `latestBlock`, `offers`, `contracts` |
| `GET /assets` | | Listed tokens: `address`, `symbol`, `name`, `decimals`, `enabled`, `putsEnabled`, `cap`, `minStrike` |
| `GET /offers` | `status` = `open` (default, fillable only) / `filled` / `exercised` / `expired` / `cancelled` / `all`; `kind` = `call` / `put`; `token` = symbol | Positions sorted by expiry |
| `GET /offers/:id` | | One position (404 if unknown) |
| `GET /positions/:address` | | `{ holding, selling, history }`: options held (filled), the address's open and filled offers, last 50 closed |
| `GET /stake/:address` | | `myActive`, `myPending`, `claimable` (WETH), `epoch`, `epochEndsAt`, `minClaim`, `totalStaked`, `lastEpochRewards` |
| `GET /activity` | `limit` 1–100 (default 30) | Recent protocol events, human-readable |
| `GET /prices` | | `{ SYMBOL: { price, at, change1h, source } }` |
| `GET /candles` | `token` (symbol), `interval` 10–86400 s (default 60), `limit` 1–2000 (default 300) | OHLC + volume (ETH) buckets |
| `GET /markers` | `token` | Offer events for the chart: `time`, `name`, `kind`, `tx`, `strikePerToken` |
| `GET /proof` | | `{ splits, burns, totals }` |
| `GET /stats` | | Volume, fees, open interest, burned, staked tokens, stakers, active offers |
| `GET /expirable` | | Filled positions past expiry: `{ id, market }` |

---

## 32. Keeper bot

The keeper talks to the chain directly (no indexer dependency) and runs three jobs every `INTERVAL_MS`:

| Job | What | Who may call it on-chain |
|---|---|---|
| **expire** | `expireMany` on every filled position past expiry, in batches of 50, across all four markets | Anyone |
| **split** | `FeeVault.split()` once per epoch when the vault holds WETH | Anyone |
| **buyback** | `BuybackBurner.buyAndBurn` in tranches ≤ `maxPerCall`, `minOut` = TWAP quote − slippage; skipped if spot and TWAP diverge by more than `MAX_SPOT_TWAP_DEVIATION_BPS` | Keeper address only |

**Startup safety checks:** it refuses to run without a key off devnet, refuses anvil's public keys off devnet,
refuses if the RPC chain id doesn't match `CHAIN_ID`, and refuses if the deployed contracts have no code. It
removes the key from `process.env` after reading it, accepts pasted keys with whitespace, quotes or a missing `0x`,
enforces a gas price ceiling, and alerts when its ETH balance runs low.

**The keeper key has no power over user funds.** Expire and split are permissionless; buybacks can only swap the
burner's WETH into `$KYTE` that is burned, within on-chain bounds.

```bash
pnpm keeper                    # loop
ONCE=1 node keeper/src/index.mjs   # single pass
```

---

## 33. Testing and CI

```bash
cd contracts
forge build                    # solc 0.8.28 for our contracts, 0.8.26 for v4-core and the hook/adapter
forge test                     # 106 tests: unit + fuzz (1,000 runs) + invariants + real v4 pool swaps
FOUNDRY_PROFILE=ci forge test  # 10,000 fuzz runs, deeper invariants

cd .. && pnpm typecheck && pnpm build    # website
node scripts/e2e-devnet.mjs              # all user actions on devnet + indexer check
node scripts/check-hook.mjs              # KyteHook fees landing in the FeeVault on devnet
```

Dependencies are installed through pnpm (OpenZeppelin 5.6.1, forge-std 1.11, Uniswap v4-core 1.0.2): no git
submodules.

**CI** (`.github/workflows/ci.yml`, on every push and pull request):
- `contracts`: `forge fmt --check`, `forge build`, `FOUNDRY_PROFILE=ci forge test`
- `web`: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`

**Intentional lint warnings:** `_mint` over `_safeMint`, strict balance equality (fee-on-transfer guard),
`transferFrom` with `from` = sender or router, and `block.timestamp` comparisons (durations ≥ 1 h).

---

## 34. Integrating with Kyte

**Read data:** use the indexer API ([section 31](#31-indexer-and-api-reference)) or read the contracts directly:
`getPosition(id)` on the market for the id's tag, `OptionNFT.ownerOf(id)` for the holder, and the registry views
for listings.

**Write (viem example: buy a call with ETH):**

```ts
import { createWalletClient, custom, publicActions } from 'viem'
import { robinhood } from 'viem/chains'

const ROUTER_V2 = '0xf1648a2cDE31A2F80cb5Ba8c544f7FC7af826BCd'
const CALLS_V2 = '0x15B5d324960234B193246B122C555e88E341eD72'
const client = createWalletClient({ chain: robinhood, transport: custom(window.ethereum) }).extend(publicActions)
const [account] = await client.requestAddresses()

const p = await client.readContract({ address: CALLS_V2, abi: callMarketAbi, functionName: 'getPosition', args: [id] })
const { request } = await client.simulateContract({
  account, address: ROUTER_V2, abi: routerAbi, functionName: 'buyWithETH',
  args: [id, p.premium],      // maxPremium
  value: p.premium,           // any excess is refunded
})
await client.waitForTransactionReceipt({ hash: await client.writeContract(request) })
```

**Rules for integrators**
- Route by id tag: tags 1–2 → v1 contracts, tags 3–4 → v2.
- Always pass a sensible `maxPremium`, and simulate before sending.
- Treat `strike` and `premium` as totals in WETH (18 decimals); `amount` uses the token's decimals.
- Exercise well before `expiry`.

ABIs: `src/lib/generated/abis.ts` (website) and `indexer/abis/*.json`. Verified sources are on Blockscout.

---

# Part 4: Operations

## 35. Mainnet deployment runbook

Everything that signs runs on the operator's machine with a **Foundry keystore**. No private key goes into a file,
an environment variable or a chat.

**Before you start**

| Need | Why |
|---|---|
| Fresh deployer wallet in the keystore (`cast wallet import deployer --interactive`) | Pays gas. The whole deploy costs well under 0.01 ETH |
| Admin, guardian and ops Safes | `Deploy.s.sol` refuses plain wallets for these on mainnet. `CreateSafes.s.sol` can create them |
| Keeper wallet | Separate EOA for the bot |
| Live `$KYTE` token | The script refuses to run without code at `KYTE_TOKEN` |
| First assets | Token, exposure cap (raw units), minimum strike (wei) |
| Audit | Real user funds will sit in these contracts |

**Steps**

```bash
cp scripts/mainnet/env.example scripts/mainnet/.env && $EDITOR scripts/mainnet/.env

scripts/mainnet/launch.sh        # one command: creates the Safes if missing, deploys + verifies the protocol,
                                 # then the KYTE/WETH pool (with KyteHook) and the buyback adapter. Resumable.
#   or step by step:
scripts/mainnet/deploy.sh        # Deploy.s.sol: timelock, registry, NFT, vault, markets, staking, burner, router, hook
scripts/mainnet/deploy.sh adapter  # DeployAdapter.s.sol: initialize the hooked pool + UniswapV4Adapter
scripts/mainnet/deploy.sh verify   # re-run verification only

node scripts/mainnet/timelock-calldata.mjs   # build the timelock plan (destinations, routers, adapter, bounds, listings)
scripts/mainnet/open-market.sh               # schedule through the admin Safe, wait out the delay, execute
```

Add liquidity to the exact hooked pool (fee 3000, tickSpacing 60, hooks = KyteHook). Then run the backend and ship
the site:

```bash
CHAIN_ID=4663 START_BLOCK=<deploy block> CORS_ORIGINS=https://kyte.sh TRUST_PROXY=1 HOST=0.0.0.0 node indexer/src/index.mjs
CHAIN_ID=4663 START_BLOCK=<deploy block> KEEPER_PRIVATE_KEY_FILE=/run/secrets/keeper ALERT_WEBHOOK_URL=<hook> node keeper/src/index.mjs
NEXT_PUBLIC_CHAIN_ID=4663 NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_INDEXER_URL=https://api.kyte.sh NEXT_PUBLIC_SITE_URL=https://kyte.sh pnpm build
```

**Launch checks**
- `cast call <feeVault> "stakingPool()(address)"` returns the pool, which means the timelock plan executed.
- The keeper log shows `chain 4663` with no alerts, and the indexer `/health` `lastBlock` advances.
- Create one small offer from a team wallet, fill it from another, exercise it, and check `/proof` after the first
  split.

### Markets v2 deploy

```bash
scripts/mainnet/markets-v2.sh     # resumable, one command:
#  1. DeployMarketsV2.s.sol: AssetRegistry (300 slots), OptionNFT, CallMarket, PutMarket, Router,
#     wired to the live timelock, guardian and FeeVault
#  2. record v2.fromBlock, sync the site config, export indexer ABIs, verify on Sourcify/Blockscout
#  3. list tokens + set routers through the admin Safe and timelock (batches of 40, 2 per Safe transaction)
#  4. ask before committing the deployment file and pushing (Render redeploys site, indexer, keeper)
scripts/mainnet/list-trending.sh  # afterwards: list scripts/mainnet/v2-extra-tokens.json in one more Safe transaction
```

---

## 36. Timelock and Safe workflows

`scripts/mainnet/safe-run.mjs` runs timelock plans through the admin Safe from the command line, with no Safe app
and no file uploads. It bundles every action into **one** Safe transaction (MultiSendCallOnly v1.4.1
`0x9641d764fc13c8B624c04430C7356C1C7C8102e2`), collects owner signatures from Foundry keystores, and submits it.

```bash
node scripts/mainnet/safe-run.mjs status     # what is queued / ready / done
node scripts/mainnet/safe-run.mjs schedule   # queue the plan in the timelock
node scripts/mainnet/safe-run.mjs execute    # after the delay (tells you how long to wait if early)
node scripts/mainnet/safe-run.mjs auto       # all passwords up front, schedule, wait, execute
```

- One-time setup: `cast wallet import owner1 --interactive` and `owner2` (two different Safe owners).
- `PLAN_FILE=` runs a different action list through the same flow, for example
  `scripts/mainnet/set-keeper.sh 0xNewKeeper` (`BuybackBurner.setKeeper`).
- Long waits run under `caffeinate -i` so the Mac doesn't sleep.

---

## 37. Listing and delisting tokens

**Listing (timelock).** Each token should pass the listing checklist: real liquidity, no fee-on-transfer or
rebasing, a unique on-chain symbol, and a sensible cap. Then:
- single token: `AssetRegistry.addAsset(token, cap, minStrike)` (+ `setPutsEnabled(token, true)`)
- batch (v2): `addAssets(tokens, caps, minStrikes, putsOn)`, generated by `scripts/mainnet/v2-plan.mjs`

Caps are in the token's raw units and minimum strikes are total WETH in wei. `v2-plan.mjs` caches its plan in
`scripts/mainnet/out/` so a re-run resumes the same timelock operations instead of making new ones from moved
prices.

**Delisting (guardian, instant).** Disabling blocks **new** offers for a token. Open positions are untouched: they
can still be bought, exercised, cancelled and expired. Re-enabling needs the timelock.

```bash
node scripts/mainnet/guardian-disable.mjs --dry        # show + simulate, send nothing
node scripts/mainnet/guardian-disable.mjs              # one guardian owner signs, deployer pays gas
node scripts/mainnet/guardian-disable.mjs 0xToken ...  # specific tokens (default: bridged cbBTC, LINK, VIRTUAL, PENGU)
```

**Price feed for a new token:** add its Uniswap v4 pool to `pools` in `contracts/deployments/4663.json` (with
`fromBlock`) for swap-based prices. Robinhood Stock Tokens and other tokens are priced automatically from quote
feeds.

---

## 38. Hosting in production

Three services, each restarting on its own:

| Service | Does | Needs a key |
|---|---|---|
| **indexer** | Follows the chain, serves the API | No |
| **keeper** | Expiries, daily split, buybacks | Yes: keeper wallet only |
| **web** | The website | No |

### Option R: Render (recommended)

`render.yaml` is a Render Blueprint:

| Service | Type | Notes |
|---|---|---|
| `kyte-indexer` | Private service + 1 GB disk at `/app/indexer/data` | Paid plan (free instances sleep and stop scanning). Rate limit 1200/min, poll 3 s |
| `kyte-keeper-v2` | Background worker (Node 24), created by hand, not in the Blueprint | Start `bash ops/run-keeper.sh`; `KEEPER_PRIVATE_KEY`, `ALERT_WEBHOOK_URL`, `CHAIN_ID=4663` entered in Render. Only one keeper may hold the key |
| `kyte-web` | Web service (Node 24) | `NEXT_PUBLIC_INDEXER_URL=/api/indexer`, `INDEXER_INTERNAL_HOSTPORT` from the indexer service; started with `node_modules/.bin/next start` |

Connect the repository as a Blueprint, fill in the secret values, and apply. Every push to the tracked branch
redeploys. Add the site URL to the Privy dashboard's allowed origins.

### Option A: your own server (Docker)

```bash
cp ops/docker/prod.env.example ops/docker/prod.env      # SITE_ORIGIN, INDEXER_PUBLIC_URL, PRIVY_APP_ID
mkdir -p ops/docker/secrets && printf '0x<keeper key>\n' > ops/docker/secrets/keeper.key && chmod 600 ops/docker/secrets/keeper.key
docker compose --env-file ops/docker/prod.env up -d --build
```

Put a TLS proxy (Caddy or nginx) in front: `kyte.sh` → `:3010`, `api.kyte.sh` → `:4200`. The website can also run
on Vercel with the same `NEXT_PUBLIC_*` values.

### Option B: a Mac (stopgap)

```bash
ops/install-macos-services.sh     # indexer (:4201) + keeper as launchd services; --remove to uninstall
ops/set-keeper-key.sh             # hidden prompt, saves ~/.kyte/keeper.key (chmod 600)
```

Logs are in `~/Library/Logs/kyte-indexer.log` and `~/Library/Logs/kyte-keeper.log`. While the Mac is off, splits and
expiries wait. Users are never blocked, because anyone can call those functions.

---

## 39. Monitoring and incident response

**Watch**
- Indexer `GET /health`: `lastBlock` should track `latestBlock`.
- Keeper logs and `ALERT_WEBHOOK_URL` messages: failed jobs, gas above the ceiling, low keeper balance, buyback
  skipped for spot/TWAP divergence.
- `/proof`: one `FeesSplit` per epoch while fees accrue.

**If something is wrong**

| Situation | Action |
|---|---|
| Suspected contract bug or exploit | Guardian Safe: `pause()` on both markets (v1 and v2), StakingPool and BuybackBurner. Exits keep working. Only the timelock can unpause |
| A listed token misbehaves | Guardian: `guardian-disable.mjs <token>`. New offers stop; open positions settle normally |
| Keeper key leaked | Timelock: `BuybackBurner.setKeeper(newKeeper)` (`scripts/mainnet/set-keeper.sh`). The old key can at worst run bounded buybacks |
| Keeper down | Nothing is stuck: anyone can call `expire`, `expireMany` and `split`. Buybacks wait |
| Indexer down | The website falls back to direct chain reads where it can. Restart; it resumes from its saved block |

---

# Appendices

## Appendix A: Chain facts

| Item | Mainnet | Testnet |
|---|---|---|
| Chain id | `4663` | `46630` |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` | |
| Gas token | ETH | ETH |
| Block time | ~100 ms | |
| Sequencer | Single sequencer | |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | not confirmed |
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | same |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | same |
| Cancun / transient storage | Yes | Yes |

## Appendix B: Protocol constants

Compile-time constants (`contracts/src/lib/Constants.sol`) can't be changed, even by the timelock.

| Constant | Value |
|---|---|
| `MIN_DURATION` / `MAX_DURATION` | 1 hour / 90 days |
| `MIN_PREMIUM` | 0.0005 ETH |
| `MAX_FEE_BPS_PREMIUM` / `MAX_FEE_BPS_EXERCISE` | 1,000 (10%) / 100 (1%) |
| `MIN_STAKERS_BPS` | 2,000 (20%) |
| `MAX_OPEN_PER_SELLER` | 200 |
| `MAX_BATCH` (`expireMany`) | 50 |
| `MAX_ASSETS` | 25 (v1) / 300 (v2) |
| `EPOCH` | 1 day |
| NFT tags | v1: 1 call / 2 put · v2: 3 call / 4 put |
| `StakingPool.MAX_MIN_CLAIM` | 0.1 ETH |
| `BuybackBurner.MAX_SLIPPAGE_CAP` | 2,000 (20%) |
| `UniswapV4Adapter.TWAP_WINDOW` | 10 minutes |
| `KyteHook.CARDINALITY` / `MAX_FEE_BPS` | 128 observations / 100 (1%) |

Current settable values on mainnet: premium fee 300 bps, exercise fee 10 bps, split 3000/2000/5000, hook fee 10 bps,
buyback `maxPerCall` 1 ETH, `maxSlippageBps` 500, `minClaim` 0, timelock delay 600 s.

## Appendix C: The $KYTE token

`$KYTE` is the protocol token. It does two things in the protocol:

| Use | How |
|---|---|
| **Staking** | Stake `$KYTE` in the StakingPool to receive 30% of all protocol fees, in WETH, every epoch ([section 19](#19-staking-mechanics)) |
| **Buy-and-burn** | 20% of all fees buy `$KYTE` on the hooked Uniswap v4 pool and burn it in the same transaction ([section 18](#18-revenue-fee-vault-split-and-buyback)) |

| Fact | Value |
|---|---|
| Address (from `contracts/deployments/4663.json`) | `0x3849DcF9FA77EC5c21D57d841a268E77830800aF` |
| Decimals | 18 |
| Buyback pool | `$KYTE`/WETH on Uniswap v4: fee 3000, tickSpacing 60, hooks = KyteHook `0x77e52E93Aa0892b29a4527Af4f3a79F01cfa9044` |
| Burn method | `burn(amount)` if the token supports it, otherwise transfer to `0x000000000000000000000000000000000000dEaD` |
| Immutable in | StakingPool (`stakeToken`) and BuybackBurner (`token`). Changing the token means redeploying both |

> **Before publishing:** the contract at this address currently reports `name() = "Test"` and `symbol() = "TI"`.
> If the real `$KYTE` launches at a different address, update this appendix and the addresses in
> [section 24](#24-deployed-addresses).

**Fill in before publishing** (not in the codebase):

| Item | Value |
|---|---|
| Total supply | `[TO FILL]` |
| Launch venue and date | `[TO FILL]` |
| Distribution / allocation | `[TO FILL]` |
| Where to buy (pool / app link) | `[TO FILL]` |
| Team or treasury holdings, vesting | `[TO FILL]` |

---

## Appendix D: Every listed token

Read from the AssetRegistry contracts on 5 November 2026. **Exposure cap** is the maximum underlying, in whole
tokens, that may sit in open and filled positions at once, per market (calls and puts separately). **Min strike** is
the minimum *total* strike of one offer, in ETH. To refresh this list, call `assetCount()`, `listedTokens(i)` and
`getAsset(token)` on each registry, or use the indexer's `GET /assets`.

The website's Market page shows only enabled tokens. New offers go to v2. v1 positions keep settling.

> **Not yet listed:** the trending tokens in `scripts/mainnet/v2-extra-tokens.json` (MOW, AnsemCat, TORCH, PRIORS,
> HOOKR, DELTA, Index, FOBO, LOBIN, RAETO, GRIFT, REBATE, BLORB, HPHONE, RYFT) are prepared for a follow-up listing
> (`scripts/mainnet/list-trending.sh`) and are not in the registry yet.

### Markets v2: 228 tokens

| Symbol | Name | Address | Enabled | Puts | Exposure cap (tokens) | Min strike (ETH, total) |
|---|---|---|---|---|---|---|
| AAOI | Applied Optoelectronics • Robinhood Token | `0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E` | Yes | Yes | 774 | 0.0001 |
| AAPL | Apple • Robinhood Token | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | Yes | Yes | 151 | 0.0001 |
| AAPLon | Apple (Ondo Tokenized) | `0x9Bf86418CaF2b7a939603d6c24219a77Bf7F9b33` | Yes | Yes | 100 | 0.0001 |
| ABCL | Abcellera Biologics • Robinhood Token | `0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e` | Yes | Yes | 4,209 | 0.0001 |
| ADBE | Adobe • Robinhood Token | `0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B` | Yes | Yes | 205 | 0.0001 |
| AEHR | Aehr • Robinhood Token | `0x5F604fBA1162193A4388A5DFa56F556f3E133cC2` | Yes | Yes | 769 | 0.0001 |
| AEIS | Advanced Energy • Robinhood Token | `0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612` | Yes | Yes | 220 | 0.0001 |
| AI | Artificial Inu | `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18` | Yes | Yes | 1,000,000 | 0.0001 |
| ALAB | Astera Labs, Inc. • Robinhood Token | `0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc` | Yes | Yes | 218 | 0.0001 |
| AMAT | Applied Materials • Robinhood Token | `0x36046893810a7E7fCE501229d57dc3FC8c8716d0` | Yes | Yes | 131 | 0.0001 |
| AMBA | Ambarella • Robinhood Token | `0x99D9D8663545151603863C5AcbD6FC3218899009` | Yes | Yes | 817 | 0.0001 |
| AMC | AMC Entertainment • Robinhood Token | `0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B` | Yes | Yes | 15,385 | 0.0001 |
| AMD | AMD • Robinhood Token | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC` | Yes | Yes | 97 | 0.0001 |
| AMKR | Amkor Technology • Robinhood Token | `0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B` | Yes | Yes | 1,337 | 0.0001 |
| AMZN | Amazon • Robinhood Token | `0x12f190a9F9d7D37a250758b26824B97CE941bF54` | Yes | Yes | 201 | 0.0001 |
| ANET | Arista • Robinhood Token | `0x28bABD556b60E53663B8615036479a29c2CDd1Bf` | Yes | Yes | 271 | 0.0001 |
| APE | ApeCoin | `0x8f86a15EC17cb3369d8b3E666dAdBC11daA82b79` | Yes | Yes | 400,000 | 0.0001 |
| APLD | Applied Digital • Robinhood Token | `0xb8DBf92F9741c9ac1c32115E78581f23509916FD` | Yes | Yes | 2,894 | 0.0001 |
| APP | AppLovin • Robinhood Token | `0xA249BAF1063Af884807C1E1400AEf7784836917E` | Yes | Yes | 206 | 0.0001 |
| ASML | ASML Holding NV • Robinhood Token | `0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA` | Yes | Yes | 33 | 0.0001 |
| ASTS | AST SpaceMobile • Robinhood Token | `0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137` | Yes | Yes | 1,339 | 0.0001 |
| AUR | Aurora Innovation • Robinhood Token | `0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD` | Yes | Yes | 11,905 | 0.0001 |
| AVAV | AeroVironment • Robinhood Token | `0xF6290b5e7C26502e2dA514C31509849718EA76A5` | Yes | Yes | 408 | 0.0001 |
| AVGO | Broadcom • Robinhood Token | `0x156E175DD063a8cE274C50654eF40e0032b3fbcF` | Yes | Yes | 151 | 0.0001 |
| AXON | Axon • Robinhood Token | `0xC27dBD474aF5181c5A8777903690D8D262D12648` | Yes | Yes | 122 | 0.0001 |
| AXTI | AXT • Robinhood Token | `0x141eEa040c2250eEc0314e336975e81f85f6585e` | Yes | Yes | 958 | 0.0001 |
| BA | Boeing • Robinhood Token | `0x4D21483a44Bf67a86b77E3dA301411880797D452` | Yes | Yes | 289 | 0.0001 |
| BABA | Alibaba • Robinhood Token | `0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4` | Yes | Yes | 490 | 0.0001 |
| BB | Blackberry • Robinhood Token | `0x48E39E56aCdbA37b09020C0b734A613C9a2f100A` | Yes | Yes | 6,204 | 0.0001 |
| BE | Bloom Energy • Robinhood Token | `0x822CC93fFD030293E9842c30BBD678F530701867` | Yes | Yes | 227 | 0.0001 |
| BMNR | BitMine Immersion Technologies • Robinhood Token | `0x9a7842EDed60b0FE1e03eEc342C82A397c821eD0` | Yes | Yes | 2,464 | 0.0001 |
| BND | Vanguard Total Bond Market ETF • Robinhood Token | `0x2F62fC9fAbb470C690f141c28340eD832bB27020` | Yes | Yes | 704 | 0.0001 |
| BULL | Webull • Robinhood Token | `0xceF9027c7d6985b85f0BA431125073529A947A68` | Yes | Yes | 9,653 | 0.0001 |
| CASHCAT | Cash Cat | `0x020bfC650A365f8BB26819deAAbF3E21291018b4` | Yes | Yes | 500,000 | 0.0001 |
| cbBTC | Coinbase Wrapped BTC | `0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4` | Yes | Yes | 1 | 0.0001 |
| CBRS | Cerebras Systems • Robinhood Token | `0x5c90450Bbb4273D7b2f17CF6917AEB237A569679` | Yes | Yes | 515 | 0.0001 |
| CCL | Carnival Corporation • Robinhood Token | `0x9651342CeA770aE9a2969Ba2A52611523146aef9` | Yes | Yes | 1,683 | 0.0001 |
| CEG | Constellation Energy • Robinhood Token | `0xaE517A2903E68bd929Dfd15be875F8369D53e94a` | Yes | Yes | 192 | 0.0001 |
| CELH | Celsius • Robinhood Token | `0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF` | Yes | Yes | 1,676 | 0.0001 |
| CIEN | Ciena • Robinhood Token | `0x44f6D488021f8233B9416294d1FE9b1fEe28382d` | Yes | Yes | 169 | 0.0001 |
| CLOV | Clover Health Investments • Robinhood Token | `0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0` | Yes | Yes | 11,934 | 0.0001 |
| CLS | Celestica • Robinhood Token | `0xBf449977089c718C004a66C554B26B94ef3Ad4De` | Yes | Yes | 194 | 0.0001 |
| CLSK | CleanSpark • Robinhood Token | `0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3` | Yes | Yes | 6,354 | 0.0001 |
| COHR | Coherent • Robinhood Token | `0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894` | Yes | Yes | 239 | 0.0001 |
| COIN | Coinbase • Robinhood Token | `0x6330D8C3178a418788dF01a47479c0ce7CCF450b` | Yes | Yes | 348 | 0.0001 |
| COST | Costco • Robinhood Token | `0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2` | Yes | Yes | 50 | 0.0001 |
| CRCL | Circle Internet Group • Robinhood Token | `0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5` | Yes | Yes | 670 | 0.0001 |
| CRCLon | Circle Internet Group (Ondo Tokenized) | `0x369C4748E98C153e9B7aDeBc3E71e9e2a5f60Dc0` | Yes | Yes | 500 | 0.0001 |
| CRDO | Credo Technology Group • Robinhood Token | `0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b` | Yes | Yes | 331 | 0.0001 |
| CRM | Salesforce • Robinhood Token | `0xd95B44124e475743a7589e68F3D74008A5536D44` | Yes | Yes | 226 | 0.0001 |
| CRWD | CrowdStrike Holdings • Robinhood Token | `0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931` | Yes | Yes | 52 | 0.0001 |
| CRWV | CoreWeave • Robinhood Token | `0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3` | Yes | Yes | 960 | 0.0001 |
| CSCO | Cisco Systems • Robinhood Token | `0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA` | Yes | Yes | 487 | 0.0001 |
| CTSH | Cognizant • Robinhood Token | `0x63D5a3b6939a33f1e75d8Bcd85759858239600DB` | Yes | Yes | 787 | 0.0001 |
| CVNA | Carvana • Robinhood Token | `0xa4f319104089FE321dc8093C6E707d4fE190A988` | Yes | Yes | 708 | 0.0001 |
| DDOG | Datadog • Robinhood Token | `0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958` | Yes | Yes | 227 | 0.0001 |
| DELL | Dell • Robinhood Token | `0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd` | Yes | Yes | 122 | 0.0001 |
| DIS | Disney • Robinhood Token | `0x501B1B3B79750313AD2C4CcCD08586c4C17d7283` | Yes | Yes | 439 | 0.0001 |
| DJT | Trump Media & Technology Group • Robinhood Token | `0x1D11f0496982706C5e14A514D4E79F2e6BdE4516` | Yes | Yes | 9,010 | 0.0001 |
| DOCN | DigitalOcean • Robinhood Token | `0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD` | Yes | Yes | 569 | 0.0001 |
| ELF | e.l.f. Beauty • Robinhood Token | `0x39EC44Bee4F6A116c6F9B8De566848a985C53C60` | Yes | Yes | 452 | 0.0001 |
| EWT | iShares MSCI Taiwan Capped ETF • Robinhood Token | `0x1c690498150252222C275A5CEd69d3A6b1f52D5E` | Yes | Yes | 518 | 0.0001 |
| EWY | iShares MSCI South Korea fund • Robinhood Token | `0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc` | Yes | Yes | 325 | 0.0001 |
| F | Ford Motor • Robinhood Token | `0x25C288E6D899b9BC30160965aD9644c67e73bE0C` | Yes | Yes | 4,082 | 0.0001 |
| FICO | Fair Isaac • Robinhood Token | `0xa48F22A46C0F1C46CA7D111CB6c137c271987180` | Yes | Yes | 70 | 0.0001 |
| FIG | Figma • Robinhood Token | `0x41F4267525a8AFf329540eF24fD83d9044758B33` | Yes | Yes | 2,383 | 0.0001 |
| FISV | Fiserv • Robinhood Token | `0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc` | Yes | Yes | 857 | 0.0001 |
| FIX | Comfort Systems • Robinhood Token | `0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac` | Yes | Yes | 40 | 0.0001 |
| FLNC | Fluence Energy • Robinhood Token | `0x282e87451E10fA6679BC7D76C69BE44cD3fC777C` | Yes | Yes | 8,961 | 0.0001 |
| FLY | Firefly Aerospace Inc. • Robinhood Token | `0x03BC731Ffb162cdd7B98D3C6542bFC291126075d` | Yes | Yes | 2,977 | 0.0001 |
| FTNT | Fortinet • Robinhood Token | `0x3FB8976980d486084b2eb4a404BD12e72823958f` | Yes | Yes | 394 | 0.0001 |
| FUTU | Futu Holdings • Robinhood Token | `0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D` | Yes | Yes | 485 | 0.0001 |
| GDX | VanEck Gold Miners ETF • Robinhood Token | `0xBDFa7A06458Aa26b8E736E0fC87aD37C3BB8Ac2e` | Yes | Yes | 619 | 0.0001 |
| GE | General Electric • Robinhood Token | `0x63b814DDBd6BF339f25Fed8c36158a008D5B373e` | Yes | Yes | 157 | 0.0001 |
| GEV | GE Vernova • Robinhood Token | `0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9` | Yes | Yes | 55 | 0.0001 |
| GLD | SPDR Gold Trust • Robinhood Token | `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` | Yes | Yes | 137 | 0.0001 |
| GLW | Corning • Robinhood Token | `0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6` | Yes | Yes | 399 | 0.0001 |
| GLXY | Galaxy Digital Inc. • Robinhood Token | `0x2D427692E928fa156ec22acfaBaFA0447C5805B7` | Yes | Yes | 3,141 | 0.0001 |
| GME | GameStop • Robinhood Token | `0x1b0E319c6A659F002271B69dB8A7df2F911c153E` | Yes | Yes | 2,084 | 0.0001 |
| GOOGL | Alphabet Class A • Robinhood Token | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` | Yes | Yes | 181 | 0.0001 |
| GOOGLon | Alphabet Class A (Ondo Tokenized) | `0xe10cc5f0cd0C90322ebEB33e7757B2c9090146DC` | Yes | Yes | 200 | 0.0001 |
| HII | Huntington Ingalls • Robinhood Token | `0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D` | Yes | Yes | 159 | 0.0001 |
| HIMS | Hims & Hers Health • Robinhood Token | `0xCceE82fE024c36fA15E1005edE3E9e4787e23D09` | Yes | Yes | 1,961 | 0.0001 |
| HOODon | Robinhood Markets (Ondo Tokenized) | `0x43Cac729218C62210D71D66B7F0eC93990D8d8cc` | Yes | Yes | 500 | 0.0001 |
| HPE | HP Enterprise • Robinhood Token | `0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1` | Yes | Yes | 939 | 0.0001 |
| HWM | Howmet Aerospace • Robinhood Token | `0xAEa445c5F3DB1a462998ccC422A875A361ee5d99` | Yes | Yes | 225 | 0.0001 |
| IBM | IBM • Robinhood Token | `0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619` | Yes | Yes | 202 | 0.0001 |
| IBRX | ImmunityBio, • Robinhood Token | `0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf` | Yes | Yes | 6,173 | 0.0001 |
| INDA | iShares MSCI India ETF • Robinhood Token | `0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6` | Yes | Yes | 1,031 | 0.0001 |
| INFQ | Infleqtion • Robinhood Token | `0xB853bC83a753342a4f8320ea680b4B1E84118D21` | Yes | Yes | 6,025 | 0.0001 |
| INOD | Innodata • Robinhood Token | `0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6` | Yes | Yes | 1,214 | 0.0001 |
| INTC | Intel • Robinhood Token | `0xc72b96e0E48ecd4DC75E1e45396e26300BC39681` | Yes | Yes | 830 | 0.0001 |
| INTU | Intuit • Robinhood Token | `0x56d23beE5f41A7120170b0c603Dae30128e460e9` | Yes | Yes | 146 | 0.0001 |
| IONQ | IonQ • Robinhood Token | `0x558378E000D634A36593E338eBacdd6207640EfE` | Yes | Yes | 1,691 | 0.0001 |
| IREN | IREN Limited • Robinhood Token | `0xF0AB0c93bE6F41369d302e55db1A96b3c430212D` | Yes | Yes | 2,123 | 0.0001 |
| JBL | Jabil Inc. • Robinhood Token | `0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6` | Yes | Yes | 186 | 0.0001 |
| JNJ | Johnson & Johnson • Robinhood Token | `0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80` | Yes | Yes | 189 | 0.0001 |
| JOBY | Joby Aviation • Robinhood Token | `0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24` | Yes | Yes | 10,417 | 0.0001 |
| JPM | JPMorgan Chase • Robinhood Token | `0x07c44dA0848960bFf894F17584dB8B2F60B2409E` | Yes | Yes | 149 | 0.0001 |
| KLAC | KLA • Robinhood Token | `0x96b933C74eCB4A0926b9210cef7b743EF46be2E9` | Yes | Yes | 320 | 0.0001 |
| KSS | Kohls Corporation • Robinhood Token | `0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993` | Yes | Yes | 2,123 | 0.0001 |
| KTOS | Kratos Defense & Security Solutions • Robinhood Token | `0x7FD06a4d81cCfA3F351394E144d5191874C31313` | Yes | Yes | 1,235 | 0.0001 |
| LHX | L3Harris • Robinhood Token | `0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25` | Yes | Yes | 181 | 0.0001 |
| LINK | ChainLink Token | `0x492641F648a4986844848E0beFE66D14817bCE34` | Yes | Yes | 1,000 | 0.0001 |
| LIT | Lighter | `0xeeca2E7Dc194a320d349122d88259bB9595a4cB0` | Yes | Yes | 20,000 | 0.0001 |
| LITE | Lumentum • Robinhood Token | `0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C` | Yes | Yes | 74 | 0.0001 |
| LLY | Eli Lilly • Robinhood Token | `0x8005d266423c7ea827372c9c864491e5786600ea` | Yes | Yes | 36 | 0.0001 |
| LMT | Lockheed • Robinhood Token | `0x329fcACEb9AD6F9580DD5F643fed0646900D043c` | Yes | Yes | 79 | 0.0001 |
| LRCX | Lam Research Corp • Robinhood Token | `0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4` | Yes | Yes | 217 | 0.0001 |
| LULU | Lululemon • Robinhood Token | `0x4e62068525Ab11FE768e29dfD00ef909B9803016` | Yes | Yes | 469 | 0.0001 |
| LUNR | Intuitive Machines • Robinhood Token | `0xa5D4968421bA94814Be3B136b15cf422101aC1a3` | Yes | Yes | 4,794 | 0.0001 |
| MCD | McDonald's • Robinhood Token | `0x2fdaa4604F10F4AE7f66fa48A174bCd25b1ece20` | Yes | Yes | 192 | 0.0001 |
| MDB | MongoDB • Robinhood Token | `0xDdf2266b79abf0B48898959B0ed6E6adf512be74` | Yes | Yes | 151 | 0.0001 |
| META | Meta Platforms • Robinhood Token | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | Yes | Yes | 81 | 0.0001 |
| METAon | Meta Platforms (Ondo Tokenized) | `0x7b5026cfcB4De0cF3d9a39FE2A541514b71437A2` | Yes | Yes | 100 | 0.0001 |
| MOD | Modine • Robinhood Token | `0xc6Cbad1016b38B797610c25E1dc7D95988B1f362` | Yes | Yes | 401 | 0.0001 |
| MPWR | Monolithic Power Systems • Robinhood Token | `0x52D50D0280AD1054b43f052bD70a49a212A1b128` | Yes | Yes | 38 | 0.0001 |
| MRNA | Moderna • Robinhood Token | `0x43B07D15cE533bEc5476d70C22a78a1B2B662155` | Yes | Yes | 220 | 0.0001 |
| MRVL | Marvell Technology • Robinhood Token | `0x62fd0668e10D8B72339BE2DCF7643001688ff13B` | Yes | Yes | 291 | 0.0001 |
| MSFT | Microsoft • Robinhood Token | `0xe93237C50D904957Cf27E7B1133b510C669c2e74` | Yes | Yes | 97 | 0.0001 |
| MSTR | Strategy Inc. • Robinhood Token | `0xec262a75e413fAfD0dF80480274532C79D42da09` | Yes | Yes | 370 | 0.0001 |
| MSTRon | MicroStrategy (Ondo Tokenized) | `0x09dedC334fC47ab543e5D70C7FD9D2B1aea175bd` | Yes | Yes | 400 | 0.0001 |
| MTSI | MACOM • Robinhood Token | `0xC93f4d80e268AB922e871bd169156C3CC41894e6` | Yes | Yes | 215 | 0.0001 |
| MU | Micron Technology • Robinhood Token | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` | Yes | Yes | 59 | 0.0001 |
| MXL | MaxLinear • Robinhood Token | `0x48961813349333209994750ffA89b3c5C22eC969` | Yes | Yes | 790 | 0.0001 |
| NAVN | Navan • Robinhood Token | `0xf7181b63Fdb858558A74ba96BC42732684cd7965` | Yes | Yes | 2,026 | 0.0001 |
| NBIS | Nebius Group • Robinhood Token | `0x9D9c6684F596F66a64C030B93A886D51Fd4D7931` | Yes | Yes | 333 | 0.0001 |
| NET | Cloudflare, Inc. Class A common stock • Robinhood Token | `0x116F00968269B7bfbaD4109cE591d6E74c0601d4` | Yes | Yes | 186 | 0.0001 |
| NFLX | Netflix • Robinhood Token | `0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8` | Yes | Yes | 793 | 0.0001 |
| NNE | Nano Nuclear Energy • Robinhood Token | `0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926` | Yes | Yes | 4,981 | 0.0001 |
| NOW | ServiceNow • Robinhood Token | `0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14` | Yes | Yes | 464 | 0.0001 |
| NU | Nu • Robinhood Token | `0x408c14038a04f7bD235329E26d2bf569ee20e250` | Yes | Yes | 4,311 | 0.0001 |
| NVDA | NVIDIA • Robinhood Token | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | Yes | Yes | 242 | 0.0001 |
| NVDAon | NVIDIA (Ondo Tokenized) | `0xf1b95AE4E7700b962714702EA53784Dc8492a856` | Yes | Yes | 200 | 0.0001 |
| NVTS | Navitas Semiconductor • Robinhood Token | `0xbE6702d7b70315376dC48a3293f24f0982F86386` | Yes | Yes | 5,682 | 0.0001 |
| OKLO | Oklo • Robinhood Token | `0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774` | Yes | Yes | 2,154 | 0.0001 |
| ON | ON Semiconductor • Robinhood Token | `0xbBD09F72b025360FeE5C928053Dca6248d35be54` | Yes | Yes | 688 | 0.0001 |
| ONTO | Onto Innovation • Robinhood Token | `0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef` | Yes | Yes | 247 | 0.0001 |
| ORBIO | Orbio.so | `0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3` | Yes | Yes | 2,000,000 | 0.0001 |
| ORCL | Oracle • Robinhood Token | `0xb0992820E760d836549ba69BC7598b4af75dEE03` | Yes | Yes | 401 | 0.0001 |
| OUST | Ouster • Robinhood Token | `0x40E7a279850e443f582059ae5dC1c3b6563E6395` | Yes | Yes | 1,607 | 0.0001 |
| P | Everpure • Robinhood Token | `0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D` | Yes | Yes | 433 | 0.0001 |
| PANW | Palo Alto Networks • Robinhood Token | `0xB039597eD45CBa7B6E2fb9E8BE51802969CEe5Be` | Yes | Yes | 144 | 0.0001 |
| PATH | UiPath • Robinhood Token | `0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa` | Yes | Yes | 3,847 | 0.0001 |
| PENDLE | Pendle | `0x5E49E1f85813F2B65858860A3FA231b4186f2e0E` | Yes | Yes | 30,000 | 0.0001 |
| PENG | Penguin Solutions • Robinhood Token | `0x9b23573b156B52565012F5cE02CDF60AFBaa70Be` | Yes | Yes | 945 | 0.0001 |
| PENGU | Pudgy Penguins | `0x74BE72AFFAFbC8de30F0C11247814036314D625f` | Yes | Yes | 10,000,000 | 0.0001 |
| PFE | Pfizer • Robinhood Token | `0x7066A64c24e4206CD62E83bf198c1E7EB361F51e` | Yes | Yes | 1,672 | 0.0001 |
| PL | Planet Labs • Robinhood Token | `0xAA4d64474c172010aB57719cb9951E6142a100d3` | Yes | Yes | 3,724 | 0.0001 |
| PLTR | Palantir Technologies • Robinhood Token | `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A` | Yes | Yes | 291 | 0.0001 |
| POET | POET Technologies • Robinhood Token | `0xcf6B2D875361be807EAfa57458c80f28521F9333` | Yes | Yes | 9,882 | 0.0001 |
| PONS | Pons | `0x39dBED3a2bd333467115dE45665cC57F813C4571` | Yes | Yes | 200,000 | 0.0001 |
| POWL | Powell Industries • Robinhood Token | `0x237c16D66590F67B886d978ACD362EAeaD8B18c7` | Yes | Yes | 314 | 0.0001 |
| PR | Permian Resources • Robinhood Token | `0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C` | Yes | Yes | 2,089 | 0.0001 |
| PWR | Quanta • Robinhood Token | `0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD` | Yes | Yes | 78 | 0.0001 |
| PYPL | PayPal • Robinhood Token | `0xa45aBDc77918F7B9199b022eEe400C0BC5712BD2` | Yes | Yes | 865 | 0.0001 |
| QBTS | D-Wave Quantum Inc. Common Stock • Robinhood Token | `0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc` | Yes | Yes | 4,883 | 0.0001 |
| QCOM | Qualcomm • Robinhood Token | `0x0f17206447090e464C277571124dD2688E48AEA9` | Yes | Yes | 304 | 0.0001 |
| QQQ | Invesco QQQ • Robinhood Token | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` | Yes | Yes | 74 | 0.0001 |
| QQQon | Invesco QQQ (Ondo Tokenized) | `0x300fE8a40701cE81460503fB886f9eD81A3B5e14` | Yes | Yes | 50 | 0.0001 |
| QUBT | Quantum Computing • Robinhood Token | `0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4` | Yes | Yes | 7,875 | 0.0001 |
| RBLX | Roblox • Robinhood Token | `0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8` | Yes | Yes | 1,112 | 0.0001 |
| RCAT | Red Cat • Robinhood Token | `0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460` | Yes | Yes | 11,338 | 0.0001 |
| RDDT | Reddit • Robinhood Token | `0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C` | Yes | Yes | 529 | 0.0001 |
| RDW | Redwire • Robinhood Token | `0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE` | Yes | Yes | 6,204 | 0.0001 |
| RGTI | Rigetti Computing • Robinhood Token | `0x284358abc07F9359f19f4b5b4aC91901Be2597Ba` | Yes | Yes | 4,583 | 0.0001 |
| RIVN | Rivian Automotive • Robinhood Token | `0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B` | Yes | Yes | 3,768 | 0.0001 |
| RKLB | Rocket Lab Corporation • Robinhood Token | `0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2` | Yes | Yes | 922 | 0.0001 |
| RUN | Sunrun • Robinhood Token | `0x756Bc80af765C82da966a788858d65aDF14f3793` | Yes | Yes | 5,477 | 0.0001 |
| SATS | EchoStar • Robinhood Token | `0x95052ddcd5DC25641657424A8Cf04834997E1730` | Yes | Yes | 500 | 0.0001 |
| SCHD | Schwab US Dividend Equity ETF • Robinhood Token | `0xd63ABB2C13d7a8421a8017a712802053568e3C1D` | Yes | Yes | 1,404 | 0.0001 |
| SGOV | iShares 0-3 Month Treasury Bond • Robinhood Token | `0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5` | Yes | Yes | 494 | 0.0001 |
| SHOP | Shopify • Robinhood Token | `0xF53F66751B1Eff985311b693531E3290F600c410` | Yes | Yes | 357 | 0.0001 |
| SHY | iShares 1-3 Year Treasury Bond ETF • Robinhood Token | `0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8` | Yes | Yes | 612 | 0.0001 |
| SIMO | Silicon Motion • Robinhood Token | `0x77E655E37F4d913fB9540e0d541D824171a60e81` | Yes | Yes | 250 | 0.0001 |
| SKHY | SK hynix Inc. American Depositary Shares • Robinhood Token | `0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8` | Yes | Yes | 335 | 0.0001 |
| SLS | SELLAS Life Sciences • Robinhood Token | `0x285b231728c7E4333799183DF1094d775246a535` | Yes | Yes | 5,695 | 0.0001 |
| SLV | iShares Silver Trust • Robinhood Token | `0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f` | Yes | Yes | 1,080 | 0.0001 |
| SMCI | Super Micro Computer • Robinhood Token | `0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a` | Yes | Yes | 1,493 | 0.0001 |
| SMH | VanEck Semiconductor ETF • Robinhood Token | `0x072f979c2CAc8e1391B0162a87Fee094bF8744a0` | Yes | Yes | 96 | 0.0001 |
| SMR | NuScale Power • Robinhood Token | `0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6` | Yes | Yes | 9,346 | 0.0001 |
| SNAP | Snap • Robinhood Token | `0xF6589F11Bc40b669e584073F428B05562F568733` | Yes | Yes | 9,042 | 0.0001 |
| SNDK | Sandisk Corporation • Robinhood Token | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` | Yes | Yes | 45 | 0.0001 |
| SNOW | Snowflake • Robinhood Token | `0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E` | Yes | Yes | 173 | 0.0001 |
| SOFI | SoFi Technologies • Robinhood Token | `0x98E75885157C80992A8D41b696D8c9C6Fb30A926` | Yes | Yes | 3,013 | 0.0001 |
| SOUN | SoundHound AI • Robinhood Token | `0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54` | Yes | Yes | 12,166 | 0.0001 |
| SOXX | iShares Semiconductor ETF • Robinhood Token | `0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38` | Yes | Yes | 107 | 0.0001 |
| SPCX | Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | Yes | Yes | 371 | 0.0001 |
| SPCXon | SpaceX (Ondo Tokenized) | `0x9B8294F24453379aa87C807ab82bf1d5722153Fc` | Yes | Yes | 400 | 0.0001 |
| SPMO | Invesco S&P 500 Momentum ETF • Robinhood Token | `0xAd622320e520de39e72d41EF07438C3Fd3354875` | Yes | Yes | 375 | 0.0001 |
| SPY | SPDR S&P 500 ETF Trust • Robinhood Token | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | Yes | Yes | 67 | 0.0001 |
| SPYon | SPDR S&P 500 ETF (Ondo Tokenized) | `0x533C5571ae586985E1FDDFAa24304284d970C62a` | Yes | Yes | 50 | 0.0001 |
| STONKBROKER | StonkBroker | `0xe934e36A439C94017B64a3FecE66AF12099aBF50` | Yes | Yes | 10,000,000 | 0.0001 |
| SUSHI | SushiToken | `0x0bb40D7fbaE7f0C69Bc5910C601987dce697d85F` | Yes | Yes | 300,000 | 0.0001 |
| TE | T1 Energy • Robinhood Token | `0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D` | Yes | Yes | 16,667 | 0.0001 |
| TEAM | Atlassian Corporation • Robinhood Token | `0x5B97476b922F3305131B8f0B9D333172E87f4aaE` | Yes | Yes | 265 | 0.0001 |
| TEM | Tempus AI • Robinhood Token | `0xB1CC0EC7Db69Cf43539119814df40071b9d61793` | Yes | Yes | 651 | 0.0001 |
| TER | Teradyne • Robinhood Token | `0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9C` | Yes | Yes | 186 | 0.0001 |
| TI | Test | `0x3849DcF9FA77EC5c21D57d841a268E77830800aF` | Yes | Yes | 10,000,000 | 0.0001 |
| TSEM | Tower Semiconductor • Robinhood Token | `0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a` | Yes | Yes | 307 | 0.0001 |
| TSLA | Tesla • Robinhood Token | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | Yes | Yes | 131 | 0.0001 |
| TSLAon | Tesla (Ondo Tokenized) | `0xB197F36C25BA9b66960688882A4dC595C6b04309` | Yes | Yes | 100 | 0.0001 |
| TSM | Taiwan Semiconductor Manufacturing • Robinhood Token | `0x58FfE4a942d3885bAa22D7520691F611EF09e7AA` | Yes | Yes | 124 | 0.0001 |
| TTD | Trade Desk • Robinhood Token | `0x0b5fb4031cae9163db10B169Ee72685F0EdC8545` | Yes | Yes | 3,931 | 0.0001 |
| TTWO | Take-Two Interactive Software • Robinhood Token | `0x5e81213613b6B86EaB4c6c50d718d34359459786` | Yes | Yes | 258 | 0.0001 |
| UBER | Uber • Robinhood Token | `0xbd335Aa5A1693F0121A5c0Ef18A080E9958DA78b` | Yes | Yes | 751 | 0.0001 |
| UMC | United Microelectronics • Robinhood Token | `0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79` | Yes | Yes | 3,083 | 0.0001 |
| UNH | UnitedHealth • Robinhood Token | `0xcF364ea52787e289De6F32077834056E3E70D6A8` | Yes | Yes | 122 | 0.0001 |
| UPS | UPS • Robinhood Token | `0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2` | Yes | Yes | 460 | 0.0001 |
| USAR | USA Rare Earth • Robinhood Token | `0xd917B029C761D264c6A312BBbcDA868658eF86a6` | Yes | Yes | 5,774 | 0.0001 |
| USO | United States Oil Fund • Robinhood Token | `0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344` | Yes | Yes | 317 | 0.0001 |
| V | Visa • Robinhood Token | `0x9BFF87700337babF5099e99F322F888DafB1d551` | Yes | Yes | 120 | 0.0001 |
| VICR | Vicor • Robinhood Token | `0x6006ed4B2F94110851ff7509D97D034f0EeD9226` | Yes | Yes | 282 | 0.0001 |
| VIRTUAL | Virtuals Protocol | `0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31` | Yes | Yes | 20,000 | 0.0001 |
| VRT | Vertiv • Robinhood Token | `0xFA78C12E6488814A0262E4e802749a4a737d5fB7` | Yes | Yes | 214 | 0.0001 |
| VSAT | ViaSat • Robinhood Token | `0x26dCbfb34FC83CAbD6990f449674efDc6097fF85` | Yes | Yes | 676 | 0.0001 |
| VST | Vistra • Robinhood Token | `0x561e2a49212b7cCF47f2744Ccb83e200722fADBc` | Yes | Yes | 361 | 0.0001 |
| VTI | Vanguard Morningstar Total Stock Market ETF • Robinhood Token | `0x0594134DF3f171a354D9C85eBD65b7A6148F6D09` | Yes | Yes | 135 | 0.0001 |
| WDAY | Workday • Robinhood Token | `0x82DA4646242e1D962e96e932269Dc644c94a9CaA` | Yes | Yes | 256 | 0.0001 |
| WDC | Western Digital • Robinhood Token | `0xF52597345A8Edf418bc4071b4a35112472277D3e` | Yes | Yes | 146 | 0.0001 |
| WULF | TeraWulf • Robinhood Token | `0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd` | Yes | Yes | 4,140 | 0.0001 |
| WYFI | WhiteFiber, Inc. • Robinhood Token | `0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E` | Yes | Yes | 4,976 | 0.0001 |
| XLK | State Street Technology Select Sector SPDR ETF • Robinhood Token | `0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43` | Yes | Yes | 283 | 0.0001 |
| XNDU | Xanadu Quantum • Robinhood Token | `0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289` | Yes | Yes | 19,012 | 0.0001 |
| XOM | ExxonMobil Holdings Corporation • Robinhood Token | `0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5` | Yes | Yes | 284 | 0.0001 |
| ZETA | Zeta Global • Robinhood Token | `0xE674C5c071821f48BB2d12CAdb83617Eff438f9e` | Yes | Yes | 1,639 | 0.0001 |
| ZM | Zoom • Robinhood Token | `0x44c4F142009036cF477eD2d09932051843137CF1` | Yes | Yes | 550 | 0.0001 |
| ZS | Zscaler • Robinhood Token | `0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7` | Yes | Yes | 225 | 0.0001 |

### Markets v1: 25 tokens

| Symbol | Name | Address | Enabled | Puts | Exposure cap (tokens) | Min strike (ETH, total) |
|---|---|---|---|---|---|---|
| AAPLon | Apple (Ondo Tokenized) | `0x9Bf86418CaF2b7a939603d6c24219a77Bf7F9b33` | Yes | Yes | 100 | 0.0001 |
| AI | Artificial Inu | `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18` | Yes | Yes | 1,000,000 | 0.0001 |
| APE | ApeCoin | `0x8f86a15EC17cb3369d8b3E666dAdBC11daA82b79` | Yes | Yes | 400,000 | 0.0001 |
| CASHCAT | Cash Cat | `0x020bfC650A365f8BB26819deAAbF3E21291018b4` | Yes | Yes | 500,000 | 0.0001 |
| cbBTC | Coinbase Wrapped BTC | `0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4` | Yes | Yes | 1 | 0.0001 |
| CRCLon | Circle Internet Group (Ondo Tokenized) | `0x369C4748E98C153e9B7aDeBc3E71e9e2a5f60Dc0` | Yes | Yes | 500 | 0.0001 |
| GOOGLon | Alphabet Class A (Ondo Tokenized) | `0xe10cc5f0cd0C90322ebEB33e7757B2c9090146DC` | Yes | Yes | 200 | 0.0001 |
| HOODon | Robinhood Markets (Ondo Tokenized) | `0x43Cac729218C62210D71D66B7F0eC93990D8d8cc` | Yes | Yes | 500 | 0.0001 |
| LINK | ChainLink Token | `0x492641F648a4986844848E0beFE66D14817bCE34` | Yes | Yes | 1,000 | 0.0001 |
| LIT | Lighter | `0xeeca2E7Dc194a320d349122d88259bB9595a4cB0` | Yes | Yes | 20,000 | 0.0001 |
| METAon | Meta Platforms (Ondo Tokenized) | `0x7b5026cfcB4De0cF3d9a39FE2A541514b71437A2` | Yes | Yes | 100 | 0.0001 |
| MSTRon | MicroStrategy (Ondo Tokenized) | `0x09dedC334fC47ab543e5D70C7FD9D2B1aea175bd` | Yes | Yes | 400 | 0.0001 |
| NVDAon | NVIDIA (Ondo Tokenized) | `0xf1b95AE4E7700b962714702EA53784Dc8492a856` | Yes | Yes | 200 | 0.0001 |
| ORBIO | Orbio.so | `0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3` | Yes | Yes | 2,000,000 | 0.0001 |
| PENDLE | Pendle | `0x5E49E1f85813F2B65858860A3FA231b4186f2e0E` | Yes | Yes | 30,000 | 0.0001 |
| PENGU | Pudgy Penguins | `0x74BE72AFFAFbC8de30F0C11247814036314D625f` | Yes | Yes | 10,000,000 | 0.0001 |
| PONS | Pons | `0x39dBED3a2bd333467115dE45665cC57F813C4571` | Yes | Yes | 200,000 | 0.0001 |
| QQQon | Invesco QQQ (Ondo Tokenized) | `0x300fE8a40701cE81460503fB886f9eD81A3B5e14` | Yes | Yes | 50 | 0.0001 |
| SPCXon | SpaceX (Ondo Tokenized) | `0x9B8294F24453379aa87C807ab82bf1d5722153Fc` | Yes | Yes | 400 | 0.0001 |
| SPYon | SPDR S&P 500 ETF (Ondo Tokenized) | `0x533C5571ae586985E1FDDFAa24304284d970C62a` | Yes | Yes | 50 | 0.0001 |
| STONKBROKER | StonkBroker | `0xe934e36A439C94017B64a3FecE66AF12099aBF50` | Yes | Yes | 10,000,000 | 0.0001 |
| SUSHI | SushiToken | `0x0bb40D7fbaE7f0C69Bc5910C601987dce697d85F` | Yes | Yes | 300,000 | 0.0001 |
| TI | Test | `0x3849DcF9FA77EC5c21D57d841a268E77830800aF` | Yes | Yes | 10,000,000 | 0.0001 |
| TSLAon | Tesla (Ondo Tokenized) | `0xB197F36C25BA9b66960688882A4dC595C6b04309` | Yes | Yes | 100 | 0.0001 |
| VIRTUAL | Virtuals Protocol | `0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31` | Yes | Yes | 20,000 | 0.0001 |

---

## Appendix E: KyteHook deep dive

KyteHook is a Uniswap v4 hook attached to the `$KYTE`/WETH pool. Think of it as a toll booth and a price camera
built into the pool. It does two jobs on every swap.

### Callbacks and the mined address

| Callback | Used | What it does |
|---|---|---|
| `afterInitialize` | Yes | Writes the first price observation when the pool is created |
| `afterSwap` | Yes | Records the new tick and takes the fee |
| `afterSwapReturnDelta` | Yes | Lets the hook deduct the fee from the swap's output |
| All others (`beforeInitialize`, `beforeSwap`, liquidity, donate) | No | `revert NotImplemented()` |

In Uniswap v4, a hook's permissions are the low 14 bits of its address. KyteHook needs
`afterInitialize (1<<12) | afterSwap (1<<6) | afterSwapReturnDelta (1<<2) = 0x1044`, so the address must satisfy
`address & 0x3FFF == 0x1044`. `contracts/script/HookDeployer.sol` is a small CREATE2 factory: `mine(initCodeHash,
maxTries)` tries salts until the predicted address has those bits (about 16,000 tries on average; the script allows
400,000), and `deploy(salt, initCode)` deploys it. The constructor runs `Hooks.validateHookPermissions`, so a wrong
address reverts.

Constructor arguments: `poolManager`, `owner` (the timelock), `feeVault`, `feeBps` (10), `feeCurrencyOnly` (WETH).

### Job 1: protocol fee

After every swap:
1. The hook looks at the swap's **unspecified currency**: the side the trader did not give an exact amount for.
2. If that currency is WETH (`feeCurrencyOnly`), it takes `amount × feeBps / 10,000`.
3. `poolManager.take(WETH, feeVault, fee)` sends it straight to the FeeVault, and `HookFee(poolId, currency, amount)`
   is emitted.
4. `afterSwap` returns the fee as its delta, so the PoolManager's accounting stays balanced.

**Which swaps pay:** selling `$KYTE` for WETH, or asking for an exact WETH output, pays the fee (WETH is the
unspecified side). Buying `$KYTE` with an exact WETH input does not, because the unspecified side is `$KYTE`. This
is deliberate: the vault only ever receives WETH, which it can split.

**Example:** a trader sells 1,000 `$KYTE` and the pool pays out about 1 WETH. The hook takes 0.001 WETH for the
FeeVault. At the next split that becomes 0.0003 WETH to stakers, 0.0002 to buy-and-burn, and 0.0005 to ops.

The Proof page shows `FeesSplit` and `Burned`. Hook fees are included in the FeeVault splits; individual `HookFee`
events can be read from the hook contract on the explorer.

### Job 2: TWAP oracle

After every swap the hook stores `Observation { blockTimestamp, tickCumulative, tick }` in a 128-slot ring buffer
per pool. Several swaps in one block keep only the last tick. `consult(poolId, secondsAgo)` returns the
time-weighted mean tick over the window, clamped to the oldest observation if the history is shorter.
`twapSqrtPriceX96(poolId, secondsAgo)` returns the price ready for quoting, and `observationAt(poolId, i)` exposes the
raw buffer.

The UniswapV4Adapter quotes buybacks from the **10-minute** TWAP. On a hooked pool it **never falls back to spot**:
if the oracle can't answer, the quote reverts. The adapter's constructor also checks that the hook it is given is
the one in the pool key (`BadPool` otherwise).

### Trust properties

| Point | Detail |
|---|---|
| Owner | The timelock. It can only change `feeBps` (≤ 1%) and `feeVault` |
| Who calls the callbacks | Only the PoolManager (`onlyPoolManager`) |
| Funds held | None: fees go to the vault in the same transaction |
| Swap control | None: the hook can't block, pause or reroute swaps |
| Upgradability | Not upgradeable |

---

## Appendix F: Option NFT metadata

`OptionNFT.tokenURI(id)` returns a `data:application/json;base64,…` document built entirely on-chain from the
position:

| Field | Value |
|---|---|
| `name` | `<SYMBOL> CALL #<localId>` or `<SYMBOL> PUT #<localId>` |
| `description` | "Physically settled option. Exercise before expiry." |
| `attributes` | `Type` (CALL/PUT), `Underlying` (token address), `Amount` (raw units), `Strike` (wei WETH), `Expiry` (unix, date display) |
| `image` | Base64 SVG, 400 × 400, dark background; title in mint (`#7cf2c9`) for calls or coral (`#ff9a7a`) for puts; lines for underlying, strike, premium and expiry |

Amounts in the metadata are raw on-chain units (token base units, wei). The symbol is embedded only if it is 1–16
plain alphanumeric characters; otherwise it shows `TOKEN`, so a token's `symbol()` can never inject JSON or SVG.
`tokenURI` reverts for ids that don't exist (burned on exercise or expiry).

---

## Appendix G: Scripts reference

### Foundry scripts (`contracts/script/`)

| Script | What it does |
|---|---|
| `Deploy.s.sol` | Full protocol deploy: TimelockController (or reuse `TIMELOCK`), AssetRegistry, OptionNFT, FeeVault, CallMarket, PutMarket, StakingPool, BuybackBurner, Router, KyteHook. Env: `GUARDIAN`, `WETH`, `KYTE_TOKEN`, `KEEPER`, `OPS_SAFE`, `POOL_MANAGER`, `ADMIN_SAFE` or `TIMELOCK`; optional `FEE_BPS_PREMIUM` (300), `FEE_BPS_EXERCISE` (10), `TIMELOCK_DELAY` (172800). On mainnet every admin role must be a contract (EIP-7702 delegations are rejected) and rehearsal mode is refused. A simulation never overwrites the real deployment file |
| `DeployAdapter.s.sol` | Initializes the `$KYTE`/WETH pool with KyteHook and deploys UniswapV4Adapter. Env: `POOL_MANAGER`, `KYTE_PER_ETH` (opening price); optional `POOL_FEE` (3000), `TICK_SPACING` (60), `SKIP_INIT`. Liquidity is added separately |
| `DeployMarketsV2.s.sol` | Markets v2: new AssetRegistry (300 slots), OptionNFT, CallMarket, PutMarket, Router, wired to the live timelock, guardian, FeeVault and WETH. Writes the `v2` section of the deployment file |
| `DeployDevnet.s.sol` | Local devnet: whole protocol, mock tokens, a real Uniswap v4 PoolManager with pools, swap router, seeded offers and stakes |
| `CreateSafes.s.sol` | Creates the admin, guardian and ops Safes (Safe v1.4.1). Owners from `SAFE_OWNERS`; admin and ops need `ADMIN_THRESHOLD` (default 2) signatures, the guardian `GUARDIAN_THRESHOLD` (default 1) so a pause can be fast. Writes `deployments/safes-<chainId>.json` |
| `HookDeployer.sol` | CREATE2 factory that mines and deploys KyteHook's address |

### Node and shell scripts

| Script | What it does |
|---|---|
| `scripts/sync-contracts.mjs` | Copies ABIs and deployed addresses into `src/lib/generated/` |
| `scripts/export-service-abis.mjs` | Writes the ABIs the indexer and keeper read into `indexer/abis/` |
| `scripts/e2e-devnet.mjs` | Runs all 19 user actions on the devnet and checks the indexer agrees |
| `scripts/devnet-trader.mjs` | Random swaps on devnet v4 pools so charts move |
| `scripts/check-hook.mjs` | Shows KyteHook fees landing in the FeeVault on devnet |
| `scripts/mainnet/launch.sh` | One-command mainnet launch: Safes, protocol, pool + adapter, verification |
| `scripts/mainnet/deploy.sh` | `core` / `adapter` / `verify` steps of the deploy |
| `scripts/mainnet/verify.mjs` | Source verification on Sourcify/Blockscout (no API key needed) |
| `scripts/mainnet/timelock-calldata.mjs` | Builds the timelock plan that opens the market (destinations, routers, adapter, bounds, listings) |
| `scripts/mainnet/open-market.sh` | Imports owner keystores, then schedules and executes that plan through the admin Safe |
| `scripts/mainnet/safe-run.mjs` | Runs any plan through the admin Safe and timelock: `status`, `schedule`, `execute`, `auto` |
| `scripts/mainnet/markets-v2.sh` | One-command markets v2 deploy, listing and publish |
| `scripts/mainnet/v2-plan.mjs` | `record` the v2 deploy block; `plan` the listing batches (cached in `scripts/mainnet/out/`) |
| `scripts/mainnet/list-trending.sh` | Lists `v2-extra-tokens.json` in v2 after the main listing finished |
| `scripts/mainnet/guardian-disable.mjs` | Disables tokens through the guardian Safe, instantly (`--dry` to simulate) |
| `scripts/mainnet/set-keeper.sh` + `setkeeper-plan.mjs` | Hands the buyback keeper role to a new wallet through the timelock |
| `ops/install-macos-services.sh` | Installs the indexer and keeper as launchd services (`--remove` to uninstall) |
| `ops/set-keeper-key.sh` | Saves the keeper key to `~/.kyte/keeper.key` (hidden prompt, chmod 600) |
| `ops/run-indexer.sh` / `ops/run-keeper.sh` | Entry points used by Docker, Render and launchd |

---

## Appendix H: Website components

| Component | Role |
|---|---|
| `Nav` | Floating pill navigation bar; full-height mobile menu; devnet chip and Faucet |
| `ConnectButton` | Privy wallet picker limited to installed wallets; the chosen wallet becomes wagmi's account |
| `Faucet` | Devnet only: funds the wallet with ETH, WETH, `$KYTE` and test tokens |
| `BuyDialog` | Buy confirmation: premium, fee, what you receive |
| `TxStatus` | Bottom-right transaction card driven by `useTx()` |
| `TokenChart` | Lightweight Charts price chart with strike lines and event markers |
| `TokenPicker` | Token selector for Market and Sell |
| `WalletHoldings` | Everything the connected wallet holds that the app knows about, in one multicall |
| `LiveOffers` | Landing order book with 1h sparklines, distance to spot and expandable rows |
| `MainnetTokens` | "Trending on Robinhood Chain": tokens ranked by last-hour swaps (`/api/rh-tokens`) |
| `ActivityFeed` | Live on-chain events from the indexer |
| `LivePanel` | Epoch progress (time to the next split) and chain pulse |
| `Ticker`, `fx/KineticMarquee` | Scrolling strips of open offers |
| `HeroCard`, `ProductFrame` | Landing hero card and live "product screenshot" frame |
| `FeeSplitBar` | 30 / 20 / 50 split visual |
| `FlowStory` | Scroll-driven animation of assets moving between parties |
| `FAQ` | Accordion FAQ |
| `TimeLeft`, `CountUp` | Ticking countdowns and animated numbers |
| `DemoBanner` | Shown when demo data is in use |
| `bento/Bento` | Proof bento tiles on the landing page |
| `fx/AuroraCanvas`, `fx/HeroScroll`, `fx/SmoothScroll`, `fx/SplitHeading`, `fx/FooterAscii`, `AsciiField`, `WordReveal`, `Reveal`, `motion/primitives` | Visual effects: WebGL aurora, GSAP scroll scenes, Lenis smooth scroll, text reveals |
| `landing/kit`, `landing/OutlineWord`, `Footer`, `PillButton`, `Logo`, `LogoStrip`, `ui` | Brand building blocks and shared UI |

---

## Appendix I: Terms of use

*As shown on kyte.sh/terms. Last updated 30 October 2026.*

**What Kyte is.** Kyte is a set of smart contracts on Robinhood Chain and a website that helps you interact with
them. The contracts hold collateral and settle options. Nobody at Kyte can access, freeze or move your funds.

**Who can use it.** You must be legally allowed to trade options in your jurisdiction. Residents of restricted or
sanctioned jurisdictions may not use the protocol. You are responsible for your own compliance and taxes.

**Risk.** Options can expire worthless. Sellers can be assigned at the strike and buyers can lose the entire
premium. Listed tokens may be volatile, illiquid or controlled by third parties. Smart contracts can contain bugs.
Only use funds you can afford to lose.

**Settlement.** Settlement is physical and enforced by the contracts. A transaction that lands after expiry fails.
Exercise well before expiry. Payouts arrive as WETH.

**Fees.** Fees are 3% of the premium when an offer fills and 0.1% of the strike on exercise. They are recorded on
each position when it is created and split by the FeeVault contract.

**No advice.** Nothing on this site is investment, legal or tax advice. Kyte does not recommend any position.

**Changes.** Protocol settings change only through a public 10 minute timelock. These terms may be updated; the
version on this page applies.

---

## Appendix J: Privacy policy

*As shown on kyte.sh/privacy. Last updated 30 October 2026.*

**What we collect.** The website does not use accounts, cookies for tracking, or analytics. When you connect a
wallet, your public address is used in your browser to read your positions. It is not stored by us.

**Wallet connection.** The wallet picker is provided by Privy. Only wallets already installed in your browser are
shown. Privy processes your public address under its own privacy policy.

**On chain data.** Every transaction you send is public on Robinhood Chain and is indexed by our indexer to show the
order book, proof of fee splits and burns. This data is public by nature and cannot be deleted.

**Third parties.** The site talks to a Robinhood Chain RPC endpoint and to our indexer. No advertising networks are
loaded.

**Contact.** Questions about this policy can be sent to the Kyte team through the links in the footer.

---

## Appendix K: Status and roadmap

**Done**

| Area | Status |
|---|---|
| Core contracts (registry, NFT, markets, router, fee vault) | Live on mainnet |
| Staking, buyback burner, Uniswap v4 adapter, KyteHook | Deployed on mainnet |
| Markets v1 | Live, 25 tokens, settling |
| Markets v2 | Live, 228 tokens (Robinhood Stock Tokens, Ondo stocks, crypto) |
| Indexer and keeper | Running in production (Render Blueprint; Docker and macOS options) |
| Website | Live: market, sell, positions, stake, proof, docs; strict CSP and security headers |
| Tests | 106 Foundry tests incl. fuzz, invariants and real v4 swaps; CI on every push |

**Open**

| Item | Notes |
|---|---|
| Real `$KYTE` token and its pool | The configured token address is currently a test token ([Appendix C](#appendix-c-the-kyte-token)) |
| Trending token listing | Prepared in `v2-extra-tokens.json`, not executed yet |
| Audit and bug bounty | `[TO FILL: auditor, date, report link]` |
| Terms acceptance and geoblocking | Planned in the build plan; not in the website yet |
| Testnet deployment | Testnet WETH address not confirmed |
| Timelock delay | Currently 10 minutes on-chain; `Deploy.s.sol` supports 48 hours |

---

## Appendix L: Changelog

| Date | Change |
|---|---|
| 2026-10-30 | Contracts, indexer, keeper and website built and verified end to end on a local devnet |
| 2026-11-01 | Mainnet production automation: Docker images, Compose, macOS services, Render Blueprint; keeper key handling hardened |
| 2026-11-01 | Indexer prices cbBTC, LINK, VIRTUAL and PENGU from their Uniswap v4 ETH pools |
| 2026-11-02 | Market shows only enabled tokens; guardian script to disable tokens; continuous candles |
| 2026-11-02 | Price feeds for PONS, CASHCAT, AI, LIT, PENDLE, APE, STONKBROKER, ORBIO and 8 more listed tokens |
| 2026-11-04 | Live prices for every listed stock token (Robinhood quote feed); smooth line chart with option markers |
| 2026-11-04 | **Markets v2**: 300-asset registry for every Robinhood Stock Token; v1 and v2 run side by side in indexer, keeper and site |
| 2026-11-04 | Trending Robinhood Chain tokens: DEX prices (DexScreener) and a prepared follow-up v2 listing |
| 2026-11-04 | One-command keeper handover for the BuybackBurner; sane Sell premium default, faster token feed, CI on Node 24 |
| 2026-11-05 | This documentation |

---

## Appendix M: Brand, links and contact

| Item | Value |
|---|---|
| Name | Kyte |
| Wordmark / domain | kyte.sh |
| Token | `$KYTE` |
| Tagline | Covered options on Robinhood Chain |
| Hero line | Options, on your terms |
| Colours | Black `#000000`, surface `#181818`, white text, mint accent `#4DFCA9`, cyan `#05EDFA` (puts) |
| Type | Geist (sans and mono) |
| Logo | Placeholder mark (three wind lines) in `src/components/Logo.tsx`: `[TO FILL: final logo files]` |

| Channel | Link |
|---|---|
| Website | https://kyte.sh |
| X (Twitter) | @useKyte |
| Email | contact@kyte.sh |
| Security reports | contact@kyte.sh, or a direct message to @useKyte |
| Discord | `[TO FILL]` |
| Telegram | `[TO FILL]` |
| GitHub | `[TO FILL: public repository link, if any]` |
| Explorer | https://robinhoodchain.blockscout.com |

Kyte is built on Robinhood Chain and is not affiliated with or endorsed by Robinhood.

---

## Appendix N: Suggested GitBook SUMMARY.md

To split this file into GitBook pages (Git Sync), cut it at each numbered heading into the files below:

```markdown
# Table of contents

* [Overview](README.md)
* [Quickstart](getting-started/quickstart.md)
* [Core concepts](getting-started/concepts.md)

## Guides
* [Buy an option](guides/buy.md)
* [Sell a covered call](guides/sell-call.md)
* [Sell a cash-secured put](guides/sell-put.md)
* [Manage your positions](guides/positions.md)
* [Stake $KYTE](guides/stake.md)
* [The Proof page](guides/proof.md)

## Reference
* [Fees](reference/fees.md)
* [Rules and limits](reference/rules.md)
* [Risks](reference/risks.md)
* [FAQ](reference/faq.md)
* [Glossary](reference/glossary.md)

## Protocol
* [Architecture](protocol/architecture.md)
* [Position lifecycle](protocol/lifecycle.md)
* [Smart contracts](protocol/contracts.md)
* [Revenue and buyback](protocol/revenue.md)
* [Staking mechanics](protocol/staking.md)
* [Uniswap v4 and KyteHook](protocol/uniswap-v4.md)
* [Governance and roles](protocol/governance.md)
* [Security model](protocol/security.md)
* [Markets v1 and v2](protocol/markets-v1-v2.md)
* [Deployed addresses](protocol/addresses.md)
* [Events](protocol/events.md)
* [Errors](protocol/errors.md)

## Developers
* [Repository layout](developers/repository.md)
* [Run locally](developers/local.md)
* [Configuration](developers/configuration.md)
* [Website architecture](developers/website.md)
* [Indexer API](developers/indexer-api.md)
* [Keeper bot](developers/keeper.md)
* [Testing and CI](developers/testing.md)
* [Integrating](developers/integrating.md)

## Operations
* [Mainnet deployment](operations/deployment.md)
* [Timelock and Safe](operations/timelock-safe.md)
* [Listing tokens](operations/listing.md)
* [Hosting](operations/hosting.md)
* [Monitoring and incidents](operations/monitoring.md)
* [Chain facts and constants](operations/appendix.md)

## Appendix
* [$KYTE token](appendix/kyte-token.md)
* [Listed tokens](appendix/tokens.md)
* [KyteHook deep dive](appendix/kytehook.md)
* [Option NFT metadata](appendix/option-nft.md)
* [Scripts reference](appendix/scripts.md)
* [Website components](appendix/components.md)
* [Terms of use](appendix/terms.md)
* [Privacy policy](appendix/privacy.md)
* [Status and roadmap](appendix/status.md)
* [Changelog](appendix/changelog.md)
* [Brand, links and contact](appendix/brand.md)
```
