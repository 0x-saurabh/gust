# USDG rewards: switch payouts on (runbook)

Status 9 Nov 2026: scoring, contract, publisher and keeper job are live; the pool is 0 and the contract holds 0 USDG,
so no epoch has paid. This is the exact sequence to start paying. Three decisions, two Render env vars, one Safe
transfer. Nothing here touches user funds or the option contracts.

| Thing | Value |
|---|---|
| UsdgRewards contract | `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956` (Blockscout: robinhoodchain.blockscout.com/address/0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956) |
| USDG token (6 decimals) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| Publisher (must equal the live keeper) | `0x377E8Ac104351173A1009Eb6bdCd9966174bBd4E` (kyte-keeper-v2), confirmed on chain |
| Ops Safe (funds the contract; today holds 0 USDG) | `0xd97693DF18dd20b8C7A542ea0E167c75F630aDA5` |
| Timelock (can `withdraw` unowed USDG, `setPublisher`, `setClaimWindow`) | `0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893` |
| Guardian (can `pause` publishing and `revoke` an unclaimed root) | `0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0` |
| Claim window | 90 days (`7776000` s), then anyone can `sweep` the leftovers back to `available()` |
| Indexer (Render private service) | `kyte-indexer`, `srv-dbjk1qflk1mc739g07gg` |
| Keeper tick | every 30 s; a short-funded epoch is retried hourly and alerts `ALERT_WEBHOOK_URL` |
| Epoch | `floor(unix_seconds / 86400)`; today is epoch 20766. An epoch is scored 10 min after it ends (00:10 UTC). |

## How the pieces fit

1. The indexer scores each finished epoch and splits `REWARDS_POOL_USDG` pro rata by points into a Merkle tree
   (`/api/indexer/rewards/epoch/<n>`). A pool of `0` makes every amount 0 and no root is worth publishing.
2. The keeper reads `/rewards`, and for each final epoch with a non-zero total checks `available()` on the contract
   (USDG in the contract minus what is already owed). If it covers the total it calls `publish(epoch, root, total)`.
   If not, it alerts "fund 0xAd56…" and retries in an hour. It never publishes partially.
3. Users claim on kyte.sh/rewards (one signature). Claims can never be paused. After 90 days unclaimed USDG is swept
   back into `available()` and funds later epochs.

**The trap to avoid.** `finalize()` recomputes an epoch whenever its pool changes, and `catchUp()` walks every epoch
since the first fill. If you only set `REWARDS_POOL_USDG`, every past epoch since early November is re-scored with
the new pool and the keeper will try to publish all of them at once (about 7 epochs × pool). Set
`REWARDS_FIRST_EPOCH` to the first epoch you want to pay. Epochs before it stay score-only.

## Step 1: decide three numbers

| Decision | Proposal on the table | Notes |
|---|---|---|
| Pool per epoch | **285.71 USDG** (2,000 a week) | Any number works. Shares under 0.01 USDG are dropped, so with 2 to 6 wallets a day even 50 USDG pays everyone. |
| Duration | 8 weeks, then review | Not enforced on chain; you stop by setting the pool to 0 (see Step 6). |
| First paying epoch | the day after you fund | `REWARDS_FIRST_EPOCH = floor(now/86400) + 1`. Example: funding on 10 Nov 2026 UTC → first epoch 20768 (starts 11 Nov 00:00 UTC, scored 12 Nov 00:10 UTC). |

Do not announce a number until Step 4 is done; the site shows the pool live from the indexer.

## Step 2: get USDG into the ops Safe

The Safe holds 0 USDG today. Two weeks of pool is 4,000 USDG; funding two weeks at a time keeps the contract's idle
balance small and the keeper's "fund me" alert becomes the reminder.

- Source: swap WETH (the ops share of protocol fees from the FeeVault) to USDG on Uniswap on Robinhood Chain from the
  Safe, or bridge USDG in. Keep a little ETH in the Safe for gas.
- Check: `cast call 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 "balanceOf(address)(uint256)" 0xd97693DF18dd20b8C7A542ea0E167c75F630aDA5 --rpc-url https://rpc.mainnet.chain.robinhood.com`
  (6 decimals: `4000000000` = 4,000 USDG).

## Step 3: set the two env vars on the indexer (Render)

Render dashboard → `kyte-indexer` → Environment:

```
REWARDS_POOL_USDG   = 285.71
REWARDS_FIRST_EPOCH = 20768        # your first paying epoch from Step 1
```

Save; Render restarts the indexer. The values are also documented in `render.yaml` (keep them in sync when you
change them, the Blueprint is the source of truth for new deploys). Within 5 minutes `catchUp()` runs; because no
epoch ≥ 20768 is final yet nothing is re-scored, and `/api/indexer/rewards` now shows `poolUsdg: 285.71`.

Verify:
```
curl -s https://kyte.sh/api/indexer/rewards | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["poolUsdg"],d["current"]["epoch"],d["current"]["participants"])'
```

## Step 4: the Safe sends USDG to the contract

A plain ERC-20 transfer from the ops Safe: token `0x5fc5…d168`, to `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956`,
amount `4000000000` (4,000 USDG) or whatever you decided. No approval, no contract call, no other signer needed.

Verify (both should be 4000000000):
```
cast call 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 "balanceOf(address)(uint256)" 0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956 --rpc-url https://rpc.mainnet.chain.robinhood.com
cast call 0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956 "available()(uint256)" --rpc-url https://rpc.mainnet.chain.robinhood.com
```

## Step 5: watch the first payout

- At 00:10 UTC after the first paying epoch ends, the indexer finalizes it. `curl https://kyte.sh/api/indexer/rewards/epoch/20768` shows `final: true`, a `root` and `total`.
- Within 30 s the keeper calls `publish`. Blockscout shows a `RootPublished(epoch, root, total, expiresAt)` event on the contract. The keeper log line is `usdgRewards.publish 20768 (285.71 USDG, N accounts)`.
- kyte.sh/rewards: connected wallets that traded that day see "Claimable now" and a Claim button. Ask Kyte / MCP `get_rewards` returns `claimable` for the address.
- If the keeper alerts `rewards epoch 20768 needs X USDG, Y available`, the contract is short: repeat Step 4. It retries hourly on its own.

Then announce (the X copy is in `docs/video/USDG_REWARDS.md` §5).

## Step 6: run it

| Want to | Do |
|---|---|
| Top up | Safe → transfer USDG to the contract. The keeper picks it up on the next tick. |
| Change the pool mid-program | `REWARDS_FIRST_EPOCH` only guards the start, so first pin every already-published epoch to its old pool with a per-epoch override, then change the env. In the indexer shell: `sqlite3 indexer/data/4663.sqlite "INSERT OR REPLACE INTO meta(key,value) VALUES('rewards:pool:20768','285.71')"` for each published epoch, then set the new `REWARDS_POOL_USDG`. A published epoch cannot be re-published on chain (`publish` is once per epoch), and the pin keeps the site's tree equal to the one on chain so claims keep verifying. |
| Pause future payouts | `REWARDS_POOL_USDG = 0` on the indexer. Already published epochs keep paying claims. |
| Stop and take the budget back | After setting the pool to 0, the timelock calls `withdraw(to, amount)`; it can only move `available()`, never what is owed. |
| A wrong root was published | Guardian calls `revoke(epoch)` before anyone claims it (fails after the first claim). Fix the data, the keeper republishes next tick. |
| Keeper is not the publisher | Keeper alerts `rewards publisher is …`. Timelock `setPublisher(0x377E…bBd4E)` (`scripts/mainnet/usdg-rewards-publisher-plan.mjs` builds the tx). |

## Known gaps to keep in mind

- The Safe currently holds no USDG, so Step 2 is the real blocker, not code.
- Sybil resistance rests on fees paid; volume today is tiny (2 to 6 wallets per epoch), so the first weeks mostly pay the people already trading. That is fine for a launch, but say "rewards for fees paid", never "yield".
- A Dune `Claimed` query is still a TODO; Blockscout's event list covers it until then.
- `docs/USDG_REWARDS_IMPLEMENTATION.md` still says "not yet deployed"; this file supersedes its "What is left" section.
