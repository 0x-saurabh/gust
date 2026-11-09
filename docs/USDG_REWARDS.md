# USDG rewards: fee-weighted points, one Merkle root per epoch

Kyte pays a pool of USDG (Paxos Global Dollar on Robinhood Chain, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`,
6 decimals) every 24 hour protocol epoch to the wallets that traded, split by the fees they actually paid. Built
9 Nov 2026 (`docs/INTEGRATIONS_PLAN.md` §3).

## Why fees

Fees are the one input a trader cannot fake for free: a wash trade pays the full 3% premium fee to the protocol (and
the contracts refuse self-trades outright). So points are fee-weighted, there is no sign-up or referral layer, and
the scoring is a pure function of events the indexer already stores. Anyone can recompute it.

## Scoring (indexer/src/rewards.mjs)

Epoch = `floor(timestamp / 86400)`, the same epoch FeeVault splits on. Per epoch and account:

| Action | Points |
|---|---|
| `OptionBought` in the epoch, as buyer | `fee / 0.0001 ETH` (1 point per 0.0001 ETH of the premium fee) |
| the same fill, as the writer | the same points; ×1.5 when it is a put on a stock token (a Harmonic session exists for the token) |
| a position filled before the epoch end, not exercised or expired before it, expiring after it | 0.2 × its premium fee in points, to holder and writer, every epoch it stays open |

The pool for the epoch (`REWARDS_POOL_USDG` on the indexer, or a per-epoch override in `meta` `rewards:pool:<n>`)
splits pro rata. Shares under 0.01 USDG are dropped. Scoring runs 10 minutes after the epoch ends (`FINAL_LAG`), so
the chain reads have caught up, and is idempotent: it recomputes only if the pool for that epoch changed.

Leaves are OpenZeppelin StandardMerkleTree encoded, `keccak256(bytes.concat(keccak256(abi.encode(epoch, account,
amount))))`, sorted-pair tree (`indexer/src/merkle.mjs`). The Foundry test `UsdgRewardsTest.test_jsTreeVerifiesOnChain`
claims against a root and proofs produced by that JS code.

Routes: `/rewards` (program, rules, recent epochs with on-chain status), `/rewards/epoch/<n>` (every leaf and proof),
`/rewards/<address>` (live points this epoch, claimable epochs with proofs, history, claimed state from the contract).

## Contract (contracts/src/UsdgRewards.sol)

Governed like the rest of the protocol (timelock + guardian):

- `publish(epoch, root, total)`: the `publisher` (the keeper key, timelock-set) publishes a finished epoch once; it
  reverts unless the contract's unowed balance covers `total`. `outstanding` tracks what is owed.
- `claim(epoch, account, amount, proof)` / `claimMany`: anyone may submit, the USDG goes to `account`. **Never pausable**
  (claims are exits). Open for `claimWindow` after publication (90 days, timelock-set within 7..365 days).
- `revoke(epoch)`: guardian or timelock, only while nobody has claimed; the root can then be published again.
- `sweep(epoch)`: anyone, after expiry; the unclaimed part goes back to the budget (stays in the contract).
- `withdraw(to, amount)`: timelock, never more than the unowed balance.
- `pause()`: guardian, stops publishing only.

Funding: the ops Safe transfers USDG to the contract. Nothing else is needed; the keeper's `publish` waits (and
alerts) while the balance is short.

9 unit tests: the JS tree verifies on chain, claimMany, wrong proofs, funding and finality checks, pause scope,
revoke, expiry and sweep, withdraw bounds, admin setters.

## Keeper (keeper/src/index.mjs, `jobRewards`)

Every tick: read `/rewards`; for each final epoch with a tree and no root on chain, fetch `/rewards/epoch/<n>`, check
the root matches and `available()` covers the total, `publish`. Expired epochs are swept. The keeper must be the
contract's `publisher`; a mismatch alerts.

## Site and MCP

- `/rewards` page: this epoch's pool and your live points, estimate and claimable total; your epochs with Claim and
  Claim all (`claimMany`); the rules; recent epochs. Nav link behind `NEXT_PUBLIC_REWARDS_ENABLED`.
- MCP `get_rewards(address?)`, resource `kyte://docs/rewards`.

## Deploy and fund (from the Mac)

```bash
cd /Volumes/my_files/newii/gust-website && scripts/mainnet/usdg-rewards.sh
```

1. `forge script DeployUsdgRewards` (deployer keystore): timelock, guardian, USDG, publisher = the keeper wallet
   `0x377E…bBd4E`, 90 day window. Writes `usdgRewards` into `contracts/deployments/4663.json`.
2. `pnpm sync`, commit, push. Render redeploys the site (ABI + address) and the indexer; set `REWARDS_POOL_USDG` on
   `kyte-indexer` (e.g. `285.71` for 2,000 USDG a week) and redeploy it.
3. Ops Safe sends USDG to the contract. From the next keeper tick every final epoch publishes.

No Safe transaction through the timelock is needed to start; later changes (publisher, window, withdraw) go through it.

## Open

- Pool size: proposal in the plan is 2,000 USDG/week for 8 weeks from treasury, plus 25% of fees swapped to USDG.
- Paxos Global Dollar Network partner rewards (USDG held earning yield for the protocol) need a USDG-collateral put
  market first; out of scope here.
- Dune: a `Claimed` query on the Kyte dashboard once the contract is live.
