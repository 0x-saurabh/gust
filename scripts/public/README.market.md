# Kyte Market

The web app and indexer behind [kyte.sh](https://kyte.sh): a non-custodial, fully collateralised options market on
Robinhood Chain. Sell covered calls and cash-secured puts, buy options as transferable NFTs, stake $KYTE.

## What is here

| Folder | What it is |
|---|---|
| `src/` | Next.js 16 app: market, sell, positions, stake, proof, docs |
| `indexer/` | Node service that indexes the contracts' events and serves the app's API (offers, positions, prices, activity) |
| `public/` | Brand assets |
| `contracts/deployments/4663.json` | Addresses the app and indexer read |

Contract sources live in the companion repository. Live addresses: [`CONTRACTS.md`](CONTRACTS.md).

## Run locally

```bash
pnpm install
cp .env.example .env.local      # set NEXT_PUBLIC_PRIVY_APP_ID (your Privy app) and NEXT_PUBLIC_INDEXER_URL
pnpm dev                        # http://localhost:3010
```

Indexer, against Robinhood Chain mainnet:

```bash
CHAIN_ID=4663 RPC_URL=https://rpc.mainnet.chain.robinhood.com node indexer/src/index.mjs   # http://localhost:4200
```

Requires Node 24 and pnpm. The app reads the chain directly when no indexer URL is set, with reduced features.

## Live addresses

{{CONTRACTS}}

## Security

Report vulnerabilities to contact@kyte.sh. Please do not disclose publicly before we have responded.

Options can expire worthless. Nothing here is investment advice. Kyte is built on Robinhood Chain and is not
affiliated with or endorsed by Robinhood.
