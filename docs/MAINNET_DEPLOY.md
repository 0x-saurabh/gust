# Mainnet deploy runbook (Robinhood Chain, chain id 4663)

Everything that signs runs on **your** machine with a Foundry keystore. No private key goes into a file, an
environment variable, or a chat. Verified facts (2026-11-01): RPC `https://rpc.mainnet.chain.robinhood.com`,
WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, Uniswap v4 PoolManager
`0x8366a39CC670B4001A1121B8F6A443A643e40951`, gas ≈ 0.02 gwei, explorer `https://robinhoodchain.blockscout.com`.

## 0. Before you start

| Need | Why |
|---|---|
| A **fresh** deployer wallet in the keystore | `cast wallet new`, then `cast wallet import deployer --interactive`. Fund it with a little ETH (the whole deploy costs well under 0.01 ETH at current gas). Any key that was ever pasted somewhere is burned: move its funds to the new wallet from your own wallet app. |
| Admin Safe, guardian Safe, ops Safe | `Deploy.s.sol` refuses plain wallets for these on mainnet. Create them at the Safe app for Robinhood Chain. |
| Keeper wallet | A separate EOA for the bot. It can only expire, split and run bounded buybacks. |
| Live `$KYTE` token address | The script refuses to run without code at `KYTE_TOKEN`. |
| First 3 assets | Token address, exposure cap (raw units) and minimum strike (wei) each. Low caps for launch. |
| Audit | Real user funds will sit in these contracts. |

## 1. Configure

```bash
cp scripts/mainnet/env.example scripts/mainnet/.env   # gitignored; addresses only
$EDITOR scripts/mainnet/.env
```

## 2. Deploy the protocol + verify

```bash
scripts/mainnet/deploy.sh            # Deploy.s.sol: timelock, registry, NFT, vault, markets, staking, burner, router, KyteHook
```

What the script enforces on mainnet: guardian/ops/admin are contracts, timelock delay ≥ 48 h (the live 4663
deployment went out with 600 s, see the security self-assessment KYT-04; raising it is a timelock operation), and the deployer
is **not** the timelock (no rehearsal mode). Output: `contracts/deployments/4663.json`, synced into
`src/lib/generated/`. Note the deploy block number from the broadcast log: the indexer and keeper need it.

If Blockscout rate-limits verification, re-run only that part: `scripts/mainnet/deploy.sh verify`.

## 3. Pool + buyback adapter + verify

```bash
scripts/mainnet/deploy.sh adapter    # DeployAdapter.s.sol: initializes the KYTE/WETH pool WITH the hook, deploys UniswapV4Adapter
```

The pool key is `fee 3000, tickSpacing 60, hooks = kyteHook`. Then add liquidity to that exact pool through the
Uniswap interface. Without the hook on the pool there is no TWAP and `buyAndBurn` refuses to run.

## 4. Wire it through the timelock (delay as configured; 600 s on the live deployment, 48 h is the script's target)

```bash
ASSETS="0xToken1:cap:minStrike:1,0xToken2:cap:minStrike:0,0xToken3:cap:minStrike:1" \
  node scripts/mainnet/timelock-calldata.mjs
```

Paste each `schedule` transaction into the admin Safe (Transaction Builder: to = timelock, value 0, data as
printed). After the timelock delay has passed, send the matching `execute` transactions. This sets the fee vault destinations, the
router on both markets, the buyback adapter and bounds, and lists the assets. Until these execute the market is
deployed but closed.

## 5. Run the backend

```bash
# indexer (behind HTTPS; persistent disk for indexer/data; forge build first)
CHAIN_ID=4663 START_BLOCK=<deploy block> CORS_ORIGINS=https://kyte.sh TRUST_PROXY=1 HOST=0.0.0.0 PORT=4200 node indexer/src/index.mjs

# keeper (pm2/systemd; key from a secret mount)
CHAIN_ID=4663 START_BLOCK=<deploy block> KEEPER_PRIVATE_KEY_FILE=/run/secrets/keeper ALERT_WEBHOOK_URL=<slack/discord> node keeper/src/index.mjs
```

## 6. Ship the site

`NEXT_PUBLIC_CHAIN_ID=4663 NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_INDEXER_URL=https://api.kyte.sh NEXT_PUBLIC_SITE_URL=https://kyte.sh`,
add the domain in the Privy dashboard, `pnpm build`. The devnet faucet hides itself off chain 31337.

## 7. Launch checks

- `cast call <feeVault> "stakingPool()(address)"` returns the pool (timelock executed).
- Keeper log shows `chain 4663`, no alerts; indexer `/health` advances.
- Create one small offer from a team wallet, fill it from another, exercise it. Check `/proof` after the first split.
- Guardian Safe can `pause()` the markets at any time; only the timelock can unpause.
