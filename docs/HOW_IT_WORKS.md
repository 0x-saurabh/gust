# How Kyte Works

> A step-by-step walkthrough of the whole platform: from a seller listing an option, through a buyer holding the
> Option NFT, to the fees that reach `$KYTE` stakers and the burns you can verify on the Proof page.
> Kyte runs on **Robinhood Chain** (Ethereum L2, chain id `4663`). Site: **kyte.sh**.

---

## Contents

1. [The one-minute version](#1-the-one-minute-version)
2. [Who is involved](#2-who-is-involved)
3. [Step 0: Connect a wallet](#3-step-0-connect-a-wallet)
4. [Step 1: Sell an option (Sell page)](#4-step-1-sell-an-option-sell-page)
5. [Step 2: Buy an option (Market page)](#5-step-2-buy-an-option-market-page)
6. [Step 3: The Option NFT](#6-step-3-the-option-nft)
7. [Step 4: Manage positions (Positions page)](#7-step-4-manage-positions-positions-page)
8. [Step 5: Fees and where they go](#8-step-5-fees-and-where-they-go)
9. [Step 6: Stake $KYTE (Stake page)](#9-step-6-stake-kyte-stake-page)
10. [Step 7: Buyback and burn](#10-step-7-buyback-and-burn)
11. [Step 8: Verify everything (Proof page)](#11-step-8-verify-everything-proof-page)
12. [The full lifecycle of one position](#12-the-full-lifecycle-of-one-position)
13. [Worked examples with real numbers](#13-worked-examples-with-real-numbers)
14. [Benefits: why it is built this way](#14-benefits-why-it-is-built-this-way)
15. [Rules and limits](#15-rules-and-limits)
16. [Risks](#16-risks)
17. [Who controls what](#17-who-controls-what)
18. [Behind the scenes: indexer and keeper](#18-behind-the-scenes-indexer-and-keeper)
19. [Glossary](#19-glossary)

---

## 1. The one-minute version

Kyte is a peer-to-peer market for **covered options**.

- A **seller** locks collateral and lists an option: a **strike** (in ETH), an **expiry**, and a **premium**.
  - Covered **call**: the seller locks the tokens.
  - Cash-secured **put**: the seller locks the ETH strike (held as WETH).
- A **buyer** pays the premium and receives an **Option NFT**. Whoever holds that NFT can **exercise** before expiry.
- On exercise, tokens and ETH actually change hands (**physical settlement**). There is **no price oracle** in the
  option logic. The holder decides whether exercising is worth it.
- After expiry, **anyone** can call `expire` and the collateral returns to the seller.
- Every fee goes to a **FeeVault** and is split on-chain once per day: **30% to `$KYTE` stakers**, **20% to buy
  and burn `$KYTE`**, **50% to operations**.
- The **Proof page** is built only from on-chain events, so every split and burn links to a transaction.

No leverage, no margin, no liquidation. A position can never go below zero.

---

## 2. Who is involved

| Role | What they do | What they get |
|---|---|---|
| **Call seller** | Locks ERC-20 tokens, sets strike, expiry and premium | The premium. If exercised, the strike too. Otherwise the tokens come back |
| **Put seller** | Locks the total strike in ETH (wrapped to WETH) | The premium. If exercised, the tokens. Otherwise the WETH comes back |
| **Buyer / holder** | Pays the premium, receives an Option NFT | The right to exercise until expiry. The NFT is transferable |
| **Staker** | Stakes `$KYTE` | 30% of all protocol fees, in WETH, every epoch |
| **Keeper (anyone)** | Expires options, triggers the daily split, runs buybacks | Keeps the system moving |

---

## 3. Step 0: Connect a wallet

1. Install any Ethereum browser wallet (MetaMask, Rabby, Coinbase Wallet, and so on). The wallet picker only shows
   wallets it detects in your browser.
2. Fund the wallet with **ETH on Robinhood Chain**. ETH pays premiums, strikes and gas. To sell calls you also need
   the token you want to write calls on.
3. Open kyte.sh and click **Connect**. The site asks your wallet to switch to, or add, Robinhood Chain.
4. The nav shows your wallet pill with copy address, open in explorer, and disconnect.

> **ETH and WETH.** The markets hold and pay **WETH** internally. A stateless **Router** lets you pay with plain
> ETH: it wraps exactly what is needed, calls the market for you, refunds any excess in the same transaction and
> never holds a balance. Payouts (premiums, strikes, staking rewards) arrive as WETH. Unwrap to ETH with one click
> on the Positions page.

---

## 4. Step 1: Sell an option (Sell page)

**Page: `/sell`**

### 4.1 Sell a covered call

1. Choose the **token** and the **amount** to lock.
2. Set the **strike per token** in ETH. The chart shows the live price with your strike drawn as a line.
3. Choose **Expires in**: 1 day, 3 days, 1 week, 2 weeks, 30 days or 90 days.
4. Choose **Offer can be filled for**: 6 hours, 1 day, 3 days, or until expiry. This is the **fill deadline**.
5. Set the **premium** (total, in ETH). The page shows a Black-Scholes hint for reference only; it is never enforced.
6. Review the summary: what you lock, the fee preview, and what you will receive.
7. Sign:
   - an `approve` of the token to the CallMarket (only if your allowance is too low), then
   - `CallMarket.createOffer(token, amount, strike, premium, expiry, offerDeadline)`.

Your tokens are now escrowed in the CallMarket. The offer is **Open** and appears on the Market page.

| Outcome | You receive |
|---|---|
| Filled | Premium minus 3% fee, in WETH, at fill time |
| Exercised | Strike minus 0.1% fee, in WETH. Your tokens go to the holder |
| Expires unexercised | Your tokens come back (anyone can trigger `expire`) |
| Not filled by the deadline | Click **Reclaim** on Positions to get your tokens back |
| You cancel before a fill | Tokens come back immediately |

### 4.2 Sell a cash-secured put

Puts must be enabled for the token. The form is identical. The difference is what you lock: **the total strike, in ETH**.

You sign **one** transaction: `Router.createPutOfferWithETH(...)` with `value = strike`. The Router wraps your ETH
to WETH and escrows it in the PutMarket on your behalf.

| Outcome | You receive |
|---|---|
| Filled | Premium minus 3% fee, in WETH |
| Exercised | `amount` tokens from the holder. The holder receives your strike minus 0.1% |
| Expires unexercised | Your WETH comes back |
| Not filled or cancelled | Your WETH comes back |

### 4.3 What the site checks before you sign

Every contract rule is checked in the browser first, and every transaction is simulated before your wallet opens:

- token is listed and enabled (puts: puts enabled)
- amount > 0, strike at or above the token's minimum, premium at least 0.0005 ETH
- expiry between 1 hour and 90 days away; fill deadline in the future and no later than expiry
- your exposure stays under the token's cap; fewer than 200 open offers per seller per market
- you hold enough balance (tokens for calls, ETH for puts)

### 4.4 Totals, not per-unit prices

On-chain, **strike and premium are totals for the whole lot**, in WETH. The website asks for a strike per token and
multiplies by the amount. Storing totals means token decimals can never cause rounding errors.
Example: 1,000 tokens at 0.002 ETH each is stored as `amount = 1000`, `strike = 2 ETH`.

---

## 5. Step 2: Buy an option (Market page)

**Page: `/market`**

1. **Pick a token.** The chart shows its price in ETH from Uniswap v4 swaps (or a Robinhood quote feed for stock
   tokens). Every open strike is drawn as a horizontal line; past fills and exercises appear as markers.
   Candles: 1m / 5m / 15m / 1h. A recent trades table links each trade to the explorer.
2. **Browse open offers.** Each row shows kind (call/put), amount, strike per token, premium, expiry, distance from
   spot ("vs spot") and break-even. Rows expand to show seller, collateral, spot and fee.
3. **Click Buy** and review the dialog: premium, fee, and what you receive.
4. **Confirm in your wallet.** One transaction:
   - Calls: `Router.buyWithETH(id, maxPremium)`
   - Puts: `Router.buyPutWithETH(id, maxPremium)`

   You pay the premium in ETH. `maxPremium` protects you if anything about the offer changed.
5. The **Option NFT** lands in your wallet. The position appears under **Positions → Holding**.

**Where your premium goes:** 3% to the FeeVault, 97% to the seller, in WETH.

> You cannot buy your own offer, and you cannot fill an offer after its fill deadline.

### What a buyer is betting on

| | Covered call | Cash-secured put |
|---|---|---|
| Buyer's right | Pay the strike, receive the tokens | Deliver the tokens, receive the strike |
| Buyer profits when | Token price per unit > strike per unit (+ premium) | Token price per unit < strike per unit (− premium) |
| Maximum loss | The premium | The premium |

---

## 6. Step 3: The Option NFT

Every filled option is an **ERC-721 token** minted by the OptionNFT contract.

- **The NFT is the option.** Whoever holds it can exercise. You can transfer it or sell it on any NFT venue, and
  the new holder can exercise.
- **Burned on exit.** The NFT is burned on exercise or expiry. `tokenURI` reverts for burned ids.
- **Fully on-chain artwork.** Name, description, attributes and a 400 × 400 SVG are generated on-chain from the
  position. Calls are titled in mint, puts in coral.

| Field | Value |
|---|---|
| `name` | `<SYMBOL> CALL #<id>` or `<SYMBOL> PUT #<id>` |
| `description` | "Physically settled option. Exercise before expiry." |
| `attributes` | Type (CALL/PUT), Underlying (token address), Amount, Strike (wei WETH), Expiry |

Token ids encode the market: `id = (tag << 248) | localId`. Tag 1 = v1 calls, 2 = v1 puts, 3 = v2 calls, 4 = v2 puts.

The symbol is embedded only if it is 1 to 16 plain alphanumeric characters; otherwise it shows `TOKEN`, so a
malicious token name can never inject JSON or SVG.

---

## 7. Step 4: Manage positions (Positions page)

**Page: `/positions`**

### Holding (options you own)

| Action | When | What happens |
|---|---|---|
| **Exercise a call** | Before expiry | `Router.exerciseWithETH(id)` with `value = strike`. You pay the strike in ETH and receive the tokens |
| **Exercise a put** | Before expiry | `approve` the token to the PutMarket, then `PutMarket.exercisePut(id)`. You deliver the tokens and receive strike minus 0.1% in WETH |

> **Exercise early.** Robinhood Chain has a single sequencer. A transaction that lands at or after expiry fails
> with `OptionExpired`. Do not wait for the last minutes.

### Selling (offers you made)

| Action | When | What happens |
|---|---|---|
| **Cancel** | Offer is open, not yet filled | `cancelUnfilled(id)`: collateral returns immediately |
| **Reclaim** | Fill deadline passed, never filled | Same call; collateral returns |
| **Expire** | Filled, and expiry has passed | `expire(id)`: collateral returns to you. Anyone can call it; the keeper usually does it within minutes |

### Wallet

- **Unwrap WETH → ETH** calls `WETH.withdraw` on your full WETH balance.
- **History** lists your exercised, expired and cancelled positions.

Every write on the site follows the same path: simulate → sign in wallet → wait for the receipt, with a status card
and a plain-language message for every contract error.

---

## 8. Step 5: Fees and where they go

| Fee | Rate | Charged on | Paid by | Hard cap (immutable) |
|---|---|---|---|---|
| Premium fee | **3%** | The premium, when an offer is filled | Deducted from what the seller receives | 10% |
| Exercise fee | **0.1%** | The strike, when an option is exercised | Deducted from what the strike receiver gets | 1% |
| Swap fee (KyteHook) | **0.1%** | WETH side of swaps in the `$KYTE`/WETH Uniswap v4 pool | Traders in that pool | 1% |
| Cancel / expire | Free | | | |

- **Fees are snapshotted per position** when it is created. A later fee change only applies to new positions.
- All fees land in the **FeeVault** as WETH.
- Once per **epoch** (24 hours, aligned to 00:00 UTC), anyone can call `split()`:

| Destination | Share | Notes |
|---|---|---|
| `$KYTE` stakers | **30%** | Sent to the StakingPool. Can never be set below 20% |
| Buy-and-burn | **20%** | Sent to the BuybackBurner, swapped for `$KYTE` on Uniswap v4 and burned |
| Operations | **50%** | Ops Safe (multisig) |

```
 premium fee (3%) ─┐
 exercise fee (0.1%)┼──► FeeVault (WETH) ── split() once per epoch ──► 30% StakingPool
 KyteHook swap fee ─┘                                              ├─► 20% BuybackBurner ──► Uniswap v4 ──► burn
                                                                   └─► 50% Ops Safe
```

---

## 9. Step 6: Stake $KYTE (Stake page)

**Page: `/stake`**

Stakers receive **30% of all protocol fees**, paid in **WETH**, once per epoch.

1. **Stake.** Approve `$KYTE` to the StakingPool, then `stake(amount)`. Your stake is **pending** until the current
   epoch ends at 00:00 UTC.
2. **Earn.** From the next epoch your stake is **active** and earns a share of every fee split, proportional to your
   share of all active stake.
3. **Claim.** `claim()` sends your accrued WETH to your wallet at any time.
4. **Unstake.** `unstake(amount)` is immediate. It takes pending stake first, then unlocked active stake.

### The activation lock

Stake that has just become active is locked for the epoch it activates in. Staking in epoch *N* means:

| Epoch | Your stake |
|---|---|
| *N* (when you stake) | Pending. Withdrawable any time. Earns nothing yet |
| *N + 1* | Active and earning. **Locked**: cannot be unstaked this epoch |
| *N + 2* onward | Active, earning, and free to unstake |

This blocks "stake one second before the split, collect, leave". Every reward is earned by stake that stayed through
a full epoch.

### How rewards are tracked

- The pool keeps a **reward-per-share accumulator** over active stake.
- When the FeeVault calls `notifyReward`, the amount is spread across all active stake at that moment.
- If there is no active stake, the reward goes to an `undistributed` bucket and is added to the next split.
- The pool always holds enough WETH for every staker's accrued rewards (fuzz-tested solvency).

The page shows your **active**, **pending**, **locked** and **claimable** amounts, plus a countdown to the next epoch.

### Staker benefits in one line

Real yield in WETH from real protocol activity, no inflation, no lockup beyond one epoch, and a buyback that
reduces `$KYTE` supply every day the protocol earns fees.

---

## 10. Step 7: Buyback and burn

The 20% buyback share is handled by the **BuybackBurner** and is **trustless**: the swap and the burn happen in the
same transaction, and the Proof page reads the resulting events.

1. The keeper calls `buyAndBurn(wethIn, minOut)` with `wethIn` at most `maxPerCall` (1 ETH at launch), so buybacks
   are spread across the epoch.
2. The **UniswapV4Adapter** swaps WETH for `$KYTE` on the `$KYTE`/WETH Uniswap v4 pool.
3. The output is burned via `burn(amount)` if the token supports it, otherwise sent to `0x…dEaD`.
4. A `Burned` event records WETH in and `$KYTE` burned.

**Two on-chain price floors** make a stolen keeper key useless for a sandwich attack:

- **TWAP floor:** `minOut` must be at least the 10-minute **KyteHook TWAP** quote minus the slippage bound.
- **Last-price floor:** `minOut` must also be at least the last buyback price minus the slippage bound.

Slippage bound today: 5%, hard cap 20%. The keeper adds its own check and skips a buyback when spot and TWAP
disagree by more than 3%.

**KyteHook** is a Uniswap v4 hook on the `$KYTE`/WETH pool. It records a tick observation after every swap for the
TWAP, and takes a 0.1% protocol fee on the WETH side of each swap, which goes to the FeeVault and joins the 30/20/50
split.

---

## 11. Step 8: Verify everything (Proof page)

**Page: `/proof`**

The Proof page is built **only** from on-chain events, with an explorer link for every transaction:

- **`FeesSplit`**: each epoch's split into stakers / buyback / ops.
- **`Burned`**: each buyback, with WETH in and `$KYTE` burned.
- **Totals**: fees split, paid to stakers, WETH spent on buybacks, `$KYTE` burned, plus a burn curve over time.

Nothing on this page comes from a database you have to trust. You can rebuild it yourself from the FeeVault and
BuybackBurner events. The footer shows the live block number so you can see the data is current.

---

## 12. The full lifecycle of one position

```
              createOffer                     buy (before fill deadline)
 (nothing) ─────────────►  OPEN  ────────────────────────────────►  FILLED ──┬─ exercise (now < expiry) ─► EXERCISED
                             │                                              └─ expire (now ≥ expiry, anyone) ─► EXPIRED
                             └─ cancelUnfilled (seller, any time while open) ─► CANCELLED
```

Status only moves forward. The terminal status is written **before** any token transfer.

| Step | Who | Effect |
|---|---|---|
| **create** | Seller (or Router for ETH puts) | Fee rates snapshotted; collateral pulled with an exact balance check; `OfferCreated` |
| **buy** | Anyone but the seller | Status Filled; NFT minted to buyer; 3% of premium to FeeVault, 97% to seller; `OptionBought` |
| **cancelUnfilled** | Seller | Status Cancelled; collateral back to seller; `OfferCancelled` |
| **exercise** (call) | NFT holder | Status Exercised; NFT burned; holder pays strike (0.1% to FeeVault, rest to seller); tokens to holder; `Exercised` |
| **exercisePut** | NFT holder | Status Exercised; NFT burned; tokens from holder to seller; strike to holder minus 0.1%; `Exercised` |
| **expire** | Anyone | Status Expired; NFT burned; collateral back to seller; `Expired` |

Exercise requires `now < expiry`. Expire requires `now ≥ expiry`. There is no moment when both or neither is possible.

---

## 13. Worked examples with real numbers

### A covered call, exercised

Seller locks **100,000 ZEPH** with a total strike of **3 ETH** and a premium of **0.1 ETH**.

1. Buyer sends 0.15 ETH to `Router.buyWithETH`. 0.1 ETH is wrapped and paid: **0.097 WETH to the seller**,
   0.003 WETH to the FeeVault. The extra 0.05 ETH is refunded in the same transaction.
2. ZEPH rises. The buyer calls `Router.exerciseWithETH` with 3 ETH: **seller gets 2.997 WETH**, FeeVault gets
   0.003 WETH, **buyer gets 100,000 ZEPH**.

### A cash-secured put, exercised

Seller locks **2 ETH** as the strike for 1,000 tokens (0.002 ETH each), premium **0.05 ETH**.

1. A buyer fills: seller receives **0.0485 WETH**, FeeVault 0.0015 WETH.
2. The token falls. The holder delivers 1,000 tokens to the seller and receives **1.998 WETH**; 0.002 WETH goes to
   the FeeVault.

### A call that expires

Same call as above, but ZEPH stays below the strike. Nobody exercises. After expiry the keeper calls `expire`:
the seller keeps the 0.097 WETH premium and gets all 100,000 ZEPH back. The buyer's NFT is burned and the premium
is their only loss.

### One epoch of fees

The FeeVault holds 0.006 WETH at the end of an epoch. `split()` sends 0.0018 to stakers, 0.0012 to the
BuybackBurner and 0.003 to ops. The keeper then swaps the 0.0012 WETH for `$KYTE` on Uniswap v4 and burns it, and
the `Burned` event appears on the Proof page.

---

## 14. Benefits: why it is built this way

### For everyone

| Property | What it means for you |
|---|---|
| **Fully collateralised** | Every option is backed 100% by locked collateral. No leverage, no margin, no liquidation |
| **Non-custodial** | Collateral can only ever go to its seller or to the option holder. No admin, guardian or multisig can move it. There is no sweep or rescue function |
| **No oracle** | The option never reads a price feed, so there is nothing to manipulate and no oracle to fail |
| **Fees fixed per position** | Fee rates are recorded on each position at creation. A later change never touches it |
| **Exits always work** | Pausing only stops new positions. Cancel, exercise, expire, unstake and claim always work |
| **Pay in ETH** | The Router wraps and refunds exactly, so you never need to hold WETH yourself |
| **Simulated first** | Every transaction is simulated before the wallet opens, so failing calls are caught before gas is spent |

### For sellers

- Earn a premium up front, in WETH, the moment the offer fills.
- Collateral never leaves the protocol's escrow until exercise, expiry or cancel.
- Set your own strike, expiry and premium. Nothing is auction-driven or forced.
- Cancel any time before a fill. Reclaim automatically after the fill deadline.

### For buyers

- Defined risk: the premium is the most you can lose.
- The option is an NFT you own. Transfer it, sell it, or exercise it before expiry.
- One transaction to buy, one to exercise, paid in plain ETH.

### For stakers

- 30% of every fee in the protocol, including the Uniswap v4 hook fee, paid in WETH.
- The share can never be governed below 20%.
- 20% of fees buy and burn `$KYTE` every day the protocol earns, visibly on the Proof page.

### Compared with the original Gust on Solana

Gust burns by hand from a team wallet. Kyte's buyback swaps and burns in one transaction with on-chain price floors,
and its split is enforced by the FeeVault contract rather than by a person.

---

## 15. Rules and limits

| Rule | Value |
|---|---|
| Expiry | 1 hour to 90 days from creation |
| Fill deadline | In the future, and no later than expiry |
| Minimum premium | 0.0005 ETH (total) |
| Minimum strike | Per token, set in the registry (total strike, in WETH) |
| Exposure cap | Per token, per market: total underlying in open and filled positions |
| Open offers per seller | At most 200 at a time, per market |
| Tokens | Only listed and enabled tokens; puts need puts enabled as well |
| Fee-on-transfer or rebasing tokens | Rejected: the escrow must receive exactly the stated amount |
| Self-trade | You cannot buy your own offer |
| Pause | Blocks only new offers, fills, new stake and buybacks. Exits always work |
| Listed tokens | 228 in markets v2 as of 5 November 2026: Robinhood Stock Tokens and ETFs, Ondo tokenized stocks, and native crypto tokens |

---

## 16. Risks

- **Sellers** give up upside above the strike (calls), or must buy tokens that may keep falling (puts).
- **Buyers** can lose the entire premium if the option is not worth exercising.
- **Exercise early.** A transaction that lands at or after expiry fails.
- **Token risk.** Listed tokens can be volatile or illiquid, or have admin controls. Tokenized stocks follow their
  issuer's rules and trading hours.
- **Price display.** Charts and "vs spot" come from Uniswap v4 swaps or external quotes. The option itself never
  uses a price feed, so check the price yourself before exercising.
- **Smart contract risk.** Contracts can have bugs. Only use funds you can afford to lose.
- **Governance risk.** The timelock can change settings for *new* positions. Check the live timelock delay on-chain.

---

## 17. Who controls what

| Role | Can | Cannot |
|---|---|---|
| **Timelock** (owned by the admin Safe) | List and enable tokens, set caps and minimum strikes, set fees within hard caps, set the split (stakers at least 20%), set router / adapter / keeper, unpause | Move collateral; change hard caps; change fees on existing positions |
| **Guardian** (Safe) | Pause markets, staking and the burner; disable tokens and puts, instantly | Unpause; enable anything; move funds |
| **Keeper** (EOA) | `buyAndBurn` within the timelock's bounds | Anything else. Expire and split are permissionless anyway |
| **Ops Safe** | Receives 50% of fees | Anything in the protocol |

Every setting change emits an event, so changes are visible on-chain before they take effect.

---

## 18. Behind the scenes: indexer and keeper

- **Indexer.** Follows the chain, stores positions, stakes, splits and burns in SQLite, and serves the website's
  JSON API. It also decodes Uniswap v4 `Swap` events into the price feed and candles for the charts. It re-scans
  recent blocks and re-reads touched positions from the contracts, so it is reorg-safe. If the indexer is down, the
  site falls back to direct chain reads.
- **Keeper.** A bot that calls `expireMany` in batches after expiries, `split` once per epoch, and `buyAndBurn`
  with a quote-based `minOut`. Everything the keeper does except `buyAndBurn` can be done by anyone.

---

## 19. Glossary

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
| **StakingPool** | Contract that holds staked `$KYTE` and pays WETH rewards |
| **BuybackBurner** | Contract that swaps WETH for `$KYTE` on Uniswap v4 and burns it |
| **KyteHook** | Uniswap v4 hook on the `$KYTE`/WETH pool: TWAP oracle plus a 0.1% protocol fee |
| **Keeper** | Bot, or anyone, that runs expiries, splits and buybacks |
| **Timelock** | Delayed-execution contract that owns protocol settings |
| **Guardian** | Multisig that can only pause and disable, never enable or move funds |
| **TWAP** | Time-weighted average price, from KyteHook over 10 minutes |
| **WETH** | Wrapped ETH (ERC-20) |

---

*See also: [`PROJECT_DOCS.md`](PROJECT_DOCS.md) for the engineering overview and [`GITBOOK.md`](GITBOOK.md) for the
full documentation with contract addresses, events and error references.*
