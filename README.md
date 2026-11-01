# Kyte: covered options on Robinhood Chain

Covered calls, cash-secured puts, $KYTE staking, on-chain fee split and burn proof. A port of Gust (Solana) to
Robinhood Chain, built from `../SPEC.md`, `../BUILD_PLAN.md` and `../GUST_REVERSE_ENGINEERING.md`.
Separate codebase from the Kyte rewards app in `../rh-rewards`.

**Docs:** [`docs/PROJECT_DOCS.md`](docs/PROJECT_DOCS.md) (end to end + TL;DR) · [`BUILD_PLAN.md`](BUILD_PLAN.md) (phases, status) ·
[`contracts/README.md`](contracts/README.md) · [`indexer/README.md`](indexer/README.md) · [`keeper/README.md`](keeper/README.md)

## Run everything locally

```bash
pnpm install && (cd contracts && pnpm install)

pnpm devnet            # 1. local chain (anvil :8547)
pnpm devnet:deploy     # 2. deploy protocol + real Uniswap v4 pool + seeded offers; syncs ABIs into the site
pnpm indexer           # 3. API on :4200
pnpm keeper            # 4. expiries, daily split, buybacks
pnpm trader            # 5. devnet only: random swaps on the v4 pools so the price charts move
pnpm dev               # 6. website on :3010
```

The site defaults to Robinhood Chain mainnet (`NEXT_PUBLIC_CHAIN_ID=4663`, addresses from
`contracts/deployments/4663.json`). For local development set `NEXT_PUBLIC_CHAIN_ID=31337` in `.env.local`. In MetaMask, add network
"Kyte Devnet", RPC `http://127.0.0.1:8547`, chain id `31337`, or let the site's Connect button add it. The site's
faucet (devnet only) funds your wallet with ETH, WETH, $KYTE and the test tokens.

| Path | What |
|---|---|
| `contracts/` | Solidity (Foundry): markets, NFT, registry, fee vault, staking, buyback, Uniswap v4 adapter + **KyteHook** (v4 hook: TWAP oracle + swap fee to the vault), router |
| `indexer/` | Chain follower + JSON API (SQLite) |
| `keeper/` | Bot: expire, split, buyback |
| `src/` | Website (Next.js 16, wagmi, viem). Theme tokens in `src/app/globals.css`; brand/fees in `src/lib/config.ts` |
| `scripts/sync-contracts.mjs` | Copies ABIs + deployed addresses into `src/lib/generated/` |

**Docker / production:** `docker compose up -d --build` runs the site + indexer (+ keeper, + HTTPS). See [`docker/README.md`](docker/README.md).

Tests: `cd contracts && forge test` (106). `node scripts/check-hook.mjs` shows KyteHook fees landing in the FeeVault on the devnet. Web: `pnpm typecheck && pnpm build`.
