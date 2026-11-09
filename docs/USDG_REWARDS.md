# USDG rewards

**Live since 9 Nov 2026.** Kyte pays a daily pool of USDG (Paxos Global Dollar on Robinhood Chain) to the wallets that
traded that day, split by the fees they actually paid. Claims are open for one day; whatever is not claimed goes
straight back to the Kyte treasury. Nothing unclaimed is ever parked in the contract.

## Live settings (mainnet, chain 4663)

| | |
|---|---|
| Rewards contract | `UsdgRewards` **`0xA6777B8D42FAad0D92fF0C24F391b0F82Fad69fC`** (Sourcify verified 9 Nov 2026) |
| Token | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals |
| Pool | **20 USDG per epoch** (`REWARDS_POOL_USDG=20` on the Render indexer) |
| First paying epoch | **20766** = 9 Nov 2026 UTC (`REWARDS_FIRST_EPOCH=20766`); earlier epochs are score-only |
| Epoch | 24 hours, `floor(unix_seconds / 86400)`, the same epoch FeeVault splits on; scored 10 minutes after it ends (00:10 UTC) |
| Claim window | **1 day** (`claimWindow = 86400`, set through the timelock 9 Nov 2026; range 1 to 365 days) |
| Unclaimed | `sweep(epoch)` after the window sends it to `treasury` = ops Safe `0xd97693DF18dd20b8C7A542ea0E167c75F630aDA5` |
| Publisher | the live keeper `0x377E8Ac104351173A1009Eb6bdCd9966174bBd4E` (Render `kyte-keeper-v2`) |
| Timelock / guardian | `0xf8E6fAF7e0E57bc91aD5C59B84FedE2Cab842893` (10 minute delay) / `0x9F433eE8020cFb3521bDaE0DDA612932e1E90EF0` |
| Funded | 200 USDG on 9 Nov 2026 (10 days at 20 a day) |
| Previous contract | `0xAd56f0ba0e75c712B9Eb6537e3dEe7c9eA1B2956` (`legacyUsdgRewards`, never funded, never published; 90 day window, leftovers stayed in the contract) |

Live numbers: `https://kyte.sh/api/indexer/rewards` (`poolUsdg`, `availableUsdg`, current epoch, recent epochs).

## How a day flows

1. **00:00 to 24:00 UTC**: every fill and exercise is scored from on-chain events (below). The `/rewards` page shows
   live points and an estimate.
2. **00:10 UTC next day**: the indexer finalises the epoch, splits the pool pro rata and builds a Merkle tree.
3. **Keeper tick (every 30 s)**: if the tree total is non-zero and the contract's unowed balance covers it, the keeper
   calls `publish(epoch, root, total)`. If the balance is short it alerts and retries hourly; it never publishes a
   partial epoch.
4. **Next 24 hours**: users claim on `kyte.sh/rewards` (one signature, `claimMany` for several days). Claims can never
   be paused.
5. **After the window**: the keeper calls `sweep(epoch)`; the unclaimed USDG is transferred to the ops Safe in that
   same transaction.

## Scoring (`indexer/src/rewards.mjs`)

Fees are the one input a trader cannot fake for free: a wash trade pays the full 3% premium fee to the protocol, and
the contracts refuse self-trades. So points are fee-weighted, there is no sign-up or referral layer, and anyone can
recompute the scores from events.

| Action | Points |
|---|---|
| `OptionBought` in the epoch, as buyer | `fee / 0.0001 ETH` (1 point per 0.0001 ETH of the premium fee) |
| the same fill, as the writer | the same points; ×1.5 when it is a put on a stock token (Harmonic session exists) |
| a position open across the epoch end (filled before, not exercised or expired, expiring after) | 0.2 × its premium fee in points, to holder and writer, every epoch it stays open |

The pool splits pro rata by points. Shares under 0.01 USDG are dropped. A per-epoch pool override lives in the
indexer `meta` table (`rewards:pool:<epoch>`); `rewards:first_epoch` overrides the env.

Leaves: OpenZeppelin StandardMerkleTree encoding, `keccak256(bytes.concat(keccak256(abi.encode(epoch, account,
amount))))`, sorted pairs (`indexer/src/merkle.mjs`). `UsdgRewardsTest.test_jsTreeVerifiesOnChain` claims on chain
against a root and proofs produced by that JS code.

Routes: `/rewards` (program, rules, recent epochs with on-chain status), `/rewards/epoch/<n>` (every leaf and proof),
`/rewards/<address>` (live points, claimable epochs with proofs, history, claimed state).

## Contract (`contracts/src/UsdgRewards.sol`)

Governed like the rest of the protocol (timelock + guardian). 12 Foundry tests.

| Function | Who | What |
|---|---|---|
| `publish(epoch, root, total)` | publisher | once per finished epoch; reverts unless `available()` covers `total`; adds to `outstanding` |
| `claim(epoch, account, amount, proof)`, `claimMany` | anyone | USDG goes to `account`; never pausable; only inside the window |
| `sweep(epoch)` | anyone (the keeper) | after expiry; transfers the unclaimed part to `treasury`; a swept epoch can never be claimed or revoked again |
| `revoke(epoch)` | guardian or timelock | only while nobody has claimed; the root can then be republished |
| `withdraw(to, amount)` | timelock | at most `available()` = balance minus `outstanding`; published rewards can never be withdrawn |
| `setPublisher`, `setTreasury`, `setClaimWindow(1..365 days)` | timelock | |
| `pause()` / `unpause()` | guardian or timelock / timelock | stops publishing only |

Funding is a plain USDG transfer to the contract from the ops Safe. `available()` is the room for new epochs.

Safety summary: users' published rewards are untouchable by anyone, including the team; the team's unpublished
budget is withdrawable any time through the 10 minute timelock; unclaimed rewards return to the Safe automatically
one day after publication.

## Operations

**Change the pool**: Render → `kyte-indexer` → Environment → `REWARDS_POOL_USDG` (USDG per day). The indexer
recomputes only epochs whose pool changed and only from `REWARDS_FIRST_EPOCH` on. Keep `render.yaml` in sync.

**Stop paying**: set `REWARDS_POOL_USDG=0`. Scoring continues, no root is published, the budget stays withdrawable.

**Top up**: Safe transfers USDG to `0xA6777B8D42FAad0D92fF0C24F391b0F82Fad69fC`. Keep the keeper wallet above
0.02 ETH; it pays gas for `publish` and `sweep` (and expiries and fee splits).

**Withdraw budget**: Safe → timelock `schedule(withdraw(to, amount))`, 10 minutes, `execute`. Plans are built like
`scripts/mainnet/usdg-rewards-window-plan.mjs` and run with `scripts/mainnet/safe-run.mjs auto`.

**Change the claim window**: `CLAIM_WINDOW=<seconds> node scripts/mainnet/usdg-rewards-window-plan.mjs`, then
`PLAN_FILE=scripts/mainnet/out/usdg-rewards-window-plan-4663.json node scripts/mainnet/safe-run.mjs auto` (Terminal
app, Safe owner passwords).

**Redeploy** (only if the contract itself changes): `REDEPLOY=1 scripts/mainnet/usdg-rewards.sh` in the Terminal app
(deployer keystore password). The script records the old address as `legacyUsdgRewards`, syncs the ABI, and prints
the next steps; then commit, push, verify on Sourcify, fund the new address.

## Keeper, site and MCP

- Keeper (`keeper/src/index.mjs`, `jobRewards`): every tick reads `/rewards`; publishes final epochs whose root is not
  on chain and whose total `available()` covers; sweeps expired epochs. Alerts if it is not the contract's `publisher`.
- Site `/rewards`: this epoch's pool and your live points, claimable total, Claim and Claim all, rules, recent epochs.
  Nav link behind `NEXT_PUBLIC_REWARDS_ENABLED`.
- MCP `get_rewards(address?)`, resource `kyte://docs/rewards`.

## Checklist for the first payout (10 Nov 2026, 00:10 UTC)

- [ ] keeper wallet `0x377E…bBd4E` above 0.02 ETH (was 0.0166 ETH on 9 Nov 18:24 UTC)
- [ ] `/api/indexer/rewards` shows epoch 20766 `status: final` with a root
- [ ] `RootPublished(20766, …)` on the contract; `outstanding` equals the epoch total
- [ ] users can claim on `kyte.sh/rewards`
- [ ] 11 Nov after 00:10 UTC: `EpochSwept(20766, unclaimed, ops Safe)` and the Safe's USDG balance rose by `unclaimed`

## Related

`docs/USDG_REWARDS_FUNDING.md` (the original switch-on runbook, kept for history), `docs/INTEGRATIONS_PLAN.md` §3
(why fee-weighted points), `docs/STAKER_USDG_SHARE.md` (the separate staker USDG share, paid wallet to wallet).
