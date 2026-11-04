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
- [C. Suggested GitBook SUMMARY.md](#appendix-c-suggested-gitbook-summarymd)

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
| Swap fee (KyteHook) | **0.1%** (10 bps) | WETH side of swaps in the `$KYTE`/WETH Uniswap v4 pool | Traders in that pool | 1% |
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
| `kyte-keeper` | Background worker | `KEEPER_PRIVATE_KEY`, `ALERT_WEBHOOK_URL` entered in Render |
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

## Appendix C: Suggested GitBook SUMMARY.md

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
```
