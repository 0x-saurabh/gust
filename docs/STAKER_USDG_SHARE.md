# Staker share of Pons creator rewards: daily USDG, wallet to wallet

Plan written 9 Nov 2026 from Saurabh's brief. Not built yet.

## The idea, restated

KYTE was launched on Pons, so Kyte (the creator) earns Pons creator rewards on every KYTE trade. Share that
income with KYTE stakers: every day, move a fixed slice (start: **200 USDG**) from the Pons creator balance into the
treasury, and pay it out **in USDG, straight from a treasury wallet to each staker's wallet** (plain
`USDG.transfer`). Each staker's cut follows their stake, clamped to a hidden **minimum of 5 USDG and maximum of 50
USDG** per day. The site shows only an estimate ("about X USDG/day at this stake"), never the clamp. Stake is locked
24 hours. **No USDG goes into any Kyte contract.**

This is a second rewards stream next to the trading rewards in `docs/USDG_REWARDS.md`. It does not use
`UsdgRewards.sol` (that one holds USDG in the contract and pays by Merkle claim, which is exactly what this brief
rules out). It also does not touch `StakingPool.sol`, which keeps paying its 30% fee share in WETH.

## What already exists and gets reused

| Piece | Where | Reused for |
|---|---|---|
| KYTE staking with a 24 h lock | `contracts/src/StakingPool.sol` at `0xD7253a90…d17f`: stake is pending until the epoch ends, then active and locked through the next full epoch (`Constants.EPOCH = 1 days`) | eligibility and weights: no new staking contract, no new lock |
| Stake events + live balances | `indexer/src/index.mjs`: `stake_events` table, `stakeOf()` reading `balancesOf` per wallet, `/stake/<address>` | the daily snapshot of every staker's **active** stake |
| KYTE price in USD | indexer `pollQuotes()` / DexScreener (`prices` table), `ethUsd()` | the estimate on the stake page |
| Epoch scoring pattern | `indexer/src/rewards.mjs` (score once an epoch is final, idempotent, FINAL_LAG 10 min, `meta` overrides per epoch) | copy the shape for `indexer/src/stakerShare.mjs` |
| Keeper on Render (`kyte-keeper-v2`, wallet `0x377E8Ac1…bBd4E`) with `send()`, `alert()`, gas and balance checks | `keeper/src/index.mjs` | runs the daily payout job |
| Ops Safe `0xd97693DF…aDA5` | `contracts/deployments/4663.json` `opsSafe` | the treasury that receives the Pons creator money and floats the payout wallet |
| `/rewards` page and `get_rewards` MCP tool | `src/app/rewards`, `src/lib/agent/tools.ts` | the history/estimate UI and the agent answer get a second section |

## Daily flow

```
Pons creator balance ──(claim, swap to USDG, 200 USDG/day)──▶ Ops Safe (treasury)
                                                                  │  weekly top-up (≈1,400 USDG)
                                                                  ▼
                                                        Payout wallet (hot, small float)
                                                                  │  USDG.transfer × N, once per epoch
                                                                  ▼
                                                        every eligible staker's wallet
```

1. **Epoch** = `floor(timestamp / 86400)`, the same day boundary StakingPool and the trading rewards use.
2. **Snapshot** (indexer, 10 minutes after the epoch ends): for every wallet that ever staked, read
   `StakingPool.balancesOf(wallet)` at the block closest to the epoch end and keep the **active** part only. Pending
   stake earns nothing (it has not sat through a lock yet). That is the 24 h rule, enforced by the contract, with no
   new code on chain.
3. **Allocation** (indexer): split the day's pool across active stake, pro rata, with the clamp (algorithm below).
   Store the table `staker_payouts (epoch, account, stake, share_usdg, status, tx)`. Serve it at
   `/staker-share` (program + recent epochs) and `/staker-share/<address>` (estimate, history).
4. **Payout** (keeper, every tick): fetch `/staker-share`; for each final epoch with unpaid rows, check the payout
   wallet's USDG balance covers the epoch total, then send `USDG.transfer(account, amount)` for each row and report the
   tx hash back to the indexer (`POST /staker-share/paid`, keeper-signed, same pattern as nothing today, so a shared
   secret header is enough on the private Render network). One transfer per staker, one epoch at a time, resumable:
   a crash halfway re-reads the unpaid rows and continues. If the balance is short, alert and wait (same as the
   trading rewards do).
5. **Funding** (ops, weekly, by hand at first): claim the Pons creator balance, convert to USDG, send about a week of
   payouts (7 × 200 = 1,400 USDG) from the Safe to the payout wallet. The Safe keeps the rest.

### Allocation with the hidden clamp

Inputs: pool `P` (200 USDG, overridable per epoch in `meta` `stakerShare:pool:<epoch>`), the active stake of every
staker `s_i`, `S = Σ s_i`, `MIN = 5`, `MAX = 50`.

1. Pro rata: `x_i = P × s_i / S`.
2. **Drop** every staker with `x_i < MIN`. Do not round them up (see "Why drop, not floor"). Their stake leaves `S`,
   recompute `x_i` for the rest, repeat until nothing more drops.
3. **Cap** at `MAX`: anyone with `x_i > MAX` gets 50; the excess is redistributed pro rata among the uncapped, repeat
   until nothing more caps (water-filling).
4. If after capping the pool is not fully allocated (everyone is capped), the remainder **stays in the treasury**. It
   is not carried forward, so a quiet day never pays more than 200.
5. Round each share down to 0.01 USDG.

Example with today's numbers: KYTE at 0.00005 USD, a staker with 5,000,000 KYTE (≈ 250 USD), 200 USDG pool.
If total active stake is 100 M KYTE the pro-rata share is 10 USDG/day. If total active is 500 M it is 2 USDG, below
the minimum, so that staker is dropped for the day and the site's estimate shows "below today's minimum, stake more
or wait". If the staker alone holds 60% of active stake the raw share is 120 USDG, capped at 50, and the 70 go to
the others.

**Why drop, not floor.** Rounding small stakers *up* to 5 USDG is a free money machine: one wallet split into 1,000
wallets with 1 KYTE each would claim 5,000 USDG a day. Dropping the small ones costs nothing to defend. Note the
max cap has the mirror problem: a whale splits across wallets to dodge the 50 cap. That cannot be stopped on chain;
the cap mainly keeps the headline from reading "one wallet takes the whole pool". Keep both numbers out of the
UI as asked, and keep them as indexer env vars (`STAKER_SHARE_MIN_USDG`, `STAKER_SHARE_MAX_USDG`,
`STAKER_SHARE_POOL_USDG`) so they can change without a deploy of anything on chain.

**What the site shows.** "Estimated ~X USDG/day" computed live from `pool × yourActiveStake / totalActiveStake`, then
clamped silently. Below the minimum it shows "—" with "stake more to qualify"; it never prints 5 or 50. Yesterday's
actual payout and the tx link come from `/staker-share/<address>`.

## Payout wallet: which key

Option A (recommended to start): **a new dedicated EOA**, `KYTE_PAYOUT_PRIVATE_KEY` on the keeper service, holding
at most a week of USDG plus a little ETH for gas. It signs nothing else. Worst case if Render leaks it: one week of
rewards. The existing keeper wallet `0x377E…bBd4E` stays the gas/ops wallet and must **not** hold the USDG float
(it already signs listings, splits, buybacks and `publish`; mixing a token float into it widens that blast radius).

Option B (later): the Safe Allowance module with a 200 USDG/day allowance to the payout EOA, so the USDG never leaves
the Safe until the moment of payout. Cleaner, but it needs the module deployed on Robinhood Chain and one more
Safe transaction; check availability before choosing it.

Not an option: a contract that holds the USDG and pays out (ruled out by the brief) or the stakers claiming (same).

## Where the 200 USDG comes from

Pons creator rewards accrue in ETH (Pons pools are ETH-quoted). Each week: claim on ponsfamily.com with the creator
wallet, swap the ETH to USDG (the USDG/ETH pool on Robinhood Chain, or Coinbase off-ramp if the pool is thin: the
indexer already reads USDG/ETH from Coinbase for pricing), transfer to the Safe, then the Safe funds the payout
wallet. Automating the claim is a follow-up once the Pons creator-fee contract ABI is in the repo (it is not today;
`indexer/abis/` has no Pons ABI). The doc `docs/useofharmonic.md`-style tracking of "creator balance in, USDG out"
goes on the Proof page later.

If the creator balance is 8,000 USD today, that is 40 days of pool at 200/day. The pool size is an env var, so it
can move with the creator income (for example "last 7 days of creator rewards ÷ 7, floor 100, cap 500").

## Build list

Indexer (`indexer/src/stakerShare.mjs`, new, modelled on `rewards.mjs`)
- Tables `staker_epochs (epoch, pool, total_active, participants, total_paid, computed_at)` and
  `staker_payouts (epoch, account, stake, amount, status 'due'|'paid'|'dropped', tx, paid_at)`.
- `score(epoch)`: snapshot at the epoch-end block (`balancesOf` via multicall over the distinct wallets in
  `stake_events` with a positive net stake), allocation above, idempotent (recompute only if pool/min/max for that
  epoch changed and nothing is paid yet).
- Routes `/staker-share`, `/staker-share/<address>`, `POST /staker-share/paid` (keeper only, shared secret
  `STAKER_SHARE_KEEPER_TOKEN`).
- Add `/staker-share` to the site's indexer proxy allowlist (`src/app/api/indexer/[...path]/route.ts`), per the
  prelaunch checklist.

Keeper (`keeper/src/index.mjs`, `jobStakerShare`)
- Second account from `KYTE_PAYOUT_PRIVATE_KEY(_FILE)`; refuse to start if it equals the keeper key.
- Per tick: unpaid final epochs → balance check (USDG and ETH) → `transfer` per row with the existing gas cap and
  `send()` wrapper → `POST /staker-share/paid`. Alerts: short balance, payout wallet below 2 days of float,
  indexer unreachable.
- `ONCE=1` dry run prints the day's table without sending.

Site
- `/stake` page: a "Daily USDG share" card: today's pool, your estimate (clamped silently), yesterday's payout with
  tx link, "paid directly to your wallet, nothing to claim". Behind `NEXT_PUBLIC_STAKER_SHARE_ENABLED`.
- `/rewards` page: a second section "Staker share" with recent epochs (pool, participants, paid).
- MCP: `get_staking` gains `usdgShare: { estimateToday, lastPaid, tx }`; `kyte://docs/rewards` gets a paragraph.
- Docs page: rules without the clamp numbers: "paid daily in USDG, pro rata to active stake, a small minimum stake
  applies, large stakes are capped".

Tests
- `indexer/test/stakerShare.test.mjs`: allocation (drop loop, cap loop, everyone capped, rounding), idempotence,
  the 1,000-wallet sybil case pays nothing.
- Keeper dry run against a fork with three fake stakers.

Ops
- Create the payout EOA, fund 1,400 USDG + 0.05 ETH from the Safe, set the env vars on `kyte-indexer` and
  `kyte-keeper-v2` on Render, redeploy, watch the first epoch with `ONCE=1` before leaving it on.
- Dune: a `Transfer` query on USDG from the payout wallet for the dashboard.

## Decisions to confirm

1. **Pro rata by stake amount**, not "stake value × creator total": the brief's 5 M × 8k example reads as the
   share growing with the stake, which pro rata gives. Say if a different curve is wanted (for example sqrt of stake
   to flatten whales further).
2. **Below-minimum stakers get nothing that day** (not rounded up to 5). This is the sybil defence; the alternative is
   an explicit minimum stake amount shown on the site instead.
3. **Excess when everyone is capped stays in the treasury**, not carried over.
4. Payout wallet = new EOA (option A) rather than Safe allowance module.
5. Pool = flat 200 USDG/day to start; the formula tied to creator income is a later switch.
