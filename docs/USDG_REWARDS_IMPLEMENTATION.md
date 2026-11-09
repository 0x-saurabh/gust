# USDG rewards on Kyte: what we implemented

Date: 9 Nov 2026. Commit `904fc90` on `main`. Design and rationale: `docs/USDG_REWARDS.md`. Plan: `docs/INTEGRATIONS_PLAN.md` §3.

Kyte pays a pool of USDG (Paxos Global Dollar on Robinhood Chain, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`,
6 decimals) every 24 hour protocol epoch to the wallets that traded, split by the protocol fees they actually paid.
Fees are the only input, so there is nothing to farm for free. Everything below is built, tested and pushed; the
contract is not yet deployed and the pool is 0 until the ops Safe sets and funds it.

## 1. Smart contract

| What | File | Status |
|---|---|---|
| `UsdgRewards`: Merkle distributor, one root per epoch, in the protocol's Governed shape (timelock + guardian) | `contracts/src/UsdgRewards.sol` | built, tested, **not yet deployed** |
| Deploy script (timelock, guardian, USDG, publisher = keeper, 90 day claim window) | `contracts/script/DeployUsdgRewards.s.sol` | ready |
| Unit tests (9), including a tree built by the JS code and claimed on chain | `contracts/test/UsdgRewards.t.sol` | passing |

What the contract does:

- `publish(epoch, root, total)`: only the `publisher` (the keeper key, timelock-set), only a finished epoch, once,
  and only if the contract's unowed USDG covers `total`. `outstanding` tracks what is owed; `available()` is the room.
- `claim(epoch, account, amount, proof)` and `claimMany`: anyone may submit, the USDG always goes to `account`.
  **Never pausable** (claims are exits). Open for `claimWindow` after publication (90 days; timelock can set 7 to 365).
- `revoke(epoch)`: guardian or timelock, only while nobody has claimed; the epoch can then be published again.
- `sweep(epoch)`: anyone, after expiry; the unclaimed part returns to the budget inside the contract.
- `withdraw(to, amount)`: timelock, never more than the unowed balance.
- `pause()`: guardian, stops publishing only. `setPublisher`, `setClaimWindow`: timelock.
- Leaf: `keccak256(bytes.concat(keccak256(abi.encode(epoch, account, amount))))`, OpenZeppelin StandardMerkleTree
  encoding, sorted-pair proofs (`MerkleProof.verifyCalldata`).

## 2. Indexer

| What | File |
|---|---|
| Merkle tree helper in OpenZeppelin's shape: `leafHash`, `buildTree`, `verify` | `indexer/src/merkle.mjs` |
| Rewards module: scoring, pool split, tree, routes | `indexer/src/rewards.mjs` |
| Wiring: install, `/rewards*` dispatch, `isStock` from Harmonic sessions | `indexer/src/index.mjs` |

Scoring per epoch (`floor(timestamp / 86400)`, the same epoch FeeVault splits on):

| Action | Points |
|---|---|
| `OptionBought` in the epoch, as buyer | 1 point per 0.0001 ETH of the premium fee |
| the same fill, as the writer | the same points; ×1.5 when it is a put on a stock token (a Harmonic session exists for the token) |
| a position filled before the epoch end, not exercised or expired before it, expiring after it | 0.2 × its premium fee in points, to holder and writer, every epoch it stays open |

- Pool per epoch: `REWARDS_POOL_USDG` on the indexer, or a per-epoch override in `meta` (`rewards:pool:<n>`).
  Pro rata split; shares under 0.01 USDG are dropped as dust.
- An epoch is scored 10 minutes after it ends (`FINAL_LAG`), stored once, recomputed only if its pool changes.
  A catch-up loop every 5 minutes finalizes every finished epoch since the first fill.
- Tables: `reward_epochs` (pool, total points, participants, root, total) and `reward_leaves` (account, points,
  fee, amount, proof, detail by action).
- Routes: `/rewards` (program, rules, current epoch live totals, recent epochs with on-chain status),
  `/rewards/epoch/<n>` (every leaf with its proof: the public tree), `/rewards/<address>` (live points and estimate
  this epoch, claimable epochs with proofs, claimed state read from the contract, history).
- Node tests (3): proofs verify for 1 to 8 leaves and duplicates; scoring with buyer, writer, 1.5x stock put,
  open interest carry, settled-before-end excluded, fill-after-end excluded; pool split sums to the pool and every
  leaf's proof verifies; zero pool scores but pays nobody; dust dropped. File: `tests/rewards.test.ts`.

## 3. Keeper

| What | File |
|---|---|
| `jobRewards`: publish final roots, sweep expired epochs | `keeper/src/index.mjs` |

Every tick: read `/rewards`; for each final epoch with a tree and no root on chain, fetch `/rewards/epoch/<n>`,
check the root matches and `available()` covers the total, then `publish`. If funding is short it alerts and
retries in an hour. Expired epochs are swept. Refuses to run if the keeper is not the contract's `publisher`.
Activates once `usdgRewards` is in `contracts/deployments/4663.json`.

## 4. Site

| What | File |
|---|---|
| Rewards page: this epoch's pool, your live points, share, estimate, claimable total; your epochs with Claim and Claim all (`claimMany`); rules; program card; recent epochs | `src/app/rewards/page.tsx` |
| Hooks `useRewardsProgram()` and `useRewards()` plus types | `src/lib/data.ts` |
| Nav link "Rewards" behind `REWARDS_ENABLED` | `src/components/Nav.tsx`, `src/lib/config.ts` |
| `USDG` token constant, `NEXT_PUBLIC_REWARDS_ENABLED` flag | `src/lib/config.ts` |
| `usdgRewards` in the contracts type; `UsdgRewards` ABI synced | `src/lib/chains.ts`, `scripts/sync-contracts.mjs`, `src/lib/generated/abis.ts` |
| Render env: `NEXT_PUBLIC_REWARDS_ENABLED=true` (web), `REWARDS_POOL_USDG=0` (indexer) | `render.yaml` |

States the page handles: no wallet, demo mode, contract not deployed ("points scored, payouts start when funded"),
pool 0, nothing earned yet, live scoring row, claimable / claimed / pending / expired / dust per epoch.

## 5. MCP and agent

| What | File |
|---|---|
| `get_rewards(address?)`: pool, rules, epoch countdown, recent epochs; with an address: points, share, estimate, what earned them, claimable epochs, claimed total, history | `src/lib/agent/tools.ts` |
| Resource `kyte://docs/rewards` | `src/lib/agent/docs/rewards.md`, `src/app/api/mcp/route.ts` |
| Fees doc points to rewards | `src/lib/agent/docs/fees.md` |
| HOL plugin skill text, tool count 20 → 21 | `scripts/hol/plugin/skills/kyte-options/SKILL.md`, `docs/HOL.md` |
| Test with a rewards fixture | `tests/agent-tools.test.ts` |

## 6. Ops and docs

| What | File |
|---|---|
| Runbook: deploy UsdgRewards (no Safe tx needed to start) | `scripts/mainnet/usdg-rewards.sh` |
| Design doc | `docs/USDG_REWARDS.md` |
| This list | `docs/USDG_REWARDS_IMPLEMENTATION.md` |
| README docs line, plan status | `README.md`, `docs/INTEGRATIONS_PLAN.md` |

## Checks run

- `forge test`: 181 passing (9 new UsdgRewards tests), `forge fmt --check` clean
- `node --test tests/rewards.test.ts`: 3 passing; `pnpm test`: 24 passing
- `pnpm typecheck`, `pnpm build` (`/rewards` route built): clean
- pre-push CI hook: all green

## What is left

1. Run `scripts/mainnet/usdg-rewards.sh` (deployer keystore only; publisher = keeper wallet). It writes `usdgRewards`
   to the deployments file and syncs ABIs. Commit and push so Render redeploys the site, indexer and keeper.
2. Decide the pool. Proposal: 2,000 USDG a week (285.71 per epoch) for 8 weeks from treasury, plus 25% of fees
   swapped to USDG. Set `REWARDS_POOL_USDG` on the Render indexer and redeploy it; past epochs can be paid later by
   setting `rewards:pool:<epoch>` in the indexer's meta table.
3. Ops Safe sends USDG to the contract. From the next keeper tick every final epoch publishes and claims open.
4. Dune: a `Claimed` query on the Kyte dashboard once the contract is live.
5. Later: Paxos Global Dollar Network partner yield needs a USDG-collateral put market first; out of scope here.
