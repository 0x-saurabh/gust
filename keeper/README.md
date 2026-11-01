# Kyte keeper

Runs the three jobs from `SPEC.md` §10 against the chain directly (no indexer dependency):

| Job | What | Who can call it |
|---|---|---|
| expire | `expireMany` on every filled position past expiry (batches of 50, both markets) | anyone |
| split | `FeeVault.split()` once per 24 h epoch when the vault holds WETH | anyone |
| buyback | `BuybackBurner.buyAndBurn` in tranches of at most `maxPerCall`, `minOut` from the adapter quote minus slippage | the keeper address only |

```bash
node keeper/src/index.mjs             # or: pnpm keeper
ONCE=1 node keeper/src/index.mjs      # single pass (cron style)
```

| Env | Default | Meaning |
|---|---|---|
| `CHAIN_ID`, `RPC_URL` | devnet | as the indexer |
| `KEEPER_PRIVATE_KEY` | anvil #0 on devnet, **required** elsewhere | Put it in a KMS/secret manager in production |
| `INTERVAL_MS` | `30000` | |
| `BUYBACK_MIN_WETH` | `0.01` | Don't buy back below this balance |
| `BUYBACK_SLIPPAGE_BPS` | `100` | `minOut = quote × (1 − slippage)` |
| `ALERT_WEBHOOK_URL` | – | POSTs `{text}` on any failed job (Slack/Discord-compatible) |
| `KEEPER_PRIVATE_KEY_FILE` | – | Read the key from a file (secret mount) instead of the environment |
| `START_BLOCK` | `0` | First block to scan for offers (set to the deploy block) |
| `MAX_GAS_GWEI` | `1` off devnet | Never pay more than this per gas; jobs are skipped and alerted instead |
| `MAX_SPOT_TWAP_DEVIATION_BPS` | `300` | Skip a buyback when spot and the TWAP quote disagree by more (likely manipulation) |
| `KEEPER_MIN_ETH` | `0.02` | Alert when the keeper wallet runs low on gas |

**Safety checks at startup:** refuses to run without a key off devnet, refuses anvil's public keys off devnet,
refuses if the RPC's chain id differs from `CHAIN_ID`, and refuses if the deployed contracts have no code.

The keeper key has no power over user funds: expire and split are permissionless, and buybacks can only
swap the burner's WETH into $KYTE that is burned, within the bounds the timelock set.
