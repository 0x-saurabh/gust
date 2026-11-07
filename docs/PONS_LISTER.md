# PonsLister: permissionless listing of graduated Pons tokens

`contracts/src/PonsLister.sol` lets anyone list a graduated [Pons](https://ponsfamily.com) token on Kyte without a
signature from the team. It holds the timelock's proposer and executor roles, but the only operation it can build is
`AssetRegistry.addAsset(token, cap, minStrike)` for a token that passes every check on chain:

| Check | Source |
|---|---|
| launched by a Pons factory (active or legacy) | `factory.getLaunchedToken(token).exists` |
| graduated (paired WETH crossed the factory threshold, 4.2 ETH) | `factory.graduationStatus(token).graduated` |
| paired with WETH | `launched.pairedToken == WETH` |
| liquidity position held by a Pons locker | `positionManager.ownerOf(positionId)` in the locker allowlist |
| 18 decimals | `token.decimals()` |
| not already listed | `registry.getAsset(token).listed` |

Cap = `capBps` of total supply (2%). Minimum strike = `minStrike` (1e12 wei). Both frozen at scheduling, so
execution replays exactly what was scheduled. Puts stay off; the timelock can enable them per token as before.

Flow: `list(token)` schedules through the timelock (10 min), `execute(token)` runs it. The keeper does both
automatically from the indexer's graduated list. The guardian can `pause()` new listings; the timelock changes the
cap formula, the minimum strike, the factories and lockers, and can `reset(token)` a schedule that can never execute.

## Tests

- `forge test --match-contract PonsListerTest`: 14 unit tests with mock factory, locker and timelock.
- `FORK=1 forge test --match-contract ForkPonsLister`: mainnet fork with the real timelock, the live v3 registry,
  the real factories and lockers; lists OZZY, YOLO, PONGO and LINK, refuses PONS (listed) and WETH (not Pons).

## Deploy and wire (once, from the Mac)

```bash
cd /Volumes/my_files/newii/gust-website && scripts/mainnet/pons-lister.sh
```

1. `forge script DeployPonsLister` with the deployer keystore; the address is written to
   `contracts/deployments/4663.json` as `ponsLister`.
2. One Safe transaction through the timelock grants the lister `PROPOSER_ROLE` and `EXECUTOR_ROLE`
   (`scripts/mainnet/pons-lister-roles-plan.mjs` plus `safe-run.mjs auto`).
3. Commit the deployments file and push. The Render keeper (`kyte-keeper-v2`) needs `INDEXER_URL` set to the
   internal indexer address; the local keeper defaults to `http://127.0.0.1:4201`.

From then on: a token graduates, the indexer sees it within two minutes, the keeper calls `list`, ten minutes
later it calls `execute`, and the Launchpad card flips from "Listing in 10 min" to "On Kyte".

## Audit note

The contract is small (one external state-changing path besides admin setters) and relies on OpenZeppelin's
TimelockController for the delay. Review points: the role grant is the trust boundary; the cap formula reads
`totalSupply` at scheduling; `reset` is timelock-only; no funds are ever held.
