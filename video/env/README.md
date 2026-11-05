# Demo environment (video/env)

A local, reproducible Kyte stack for recording the film: a Robinhood Chain mainnet fork, the indexer against it,
and a production build of the site with Privy off, driven by Playwright with the `Demo Wallet` shim.

## Up / down

```sh
video/env/up.sh            # idempotent: starts what is not running, prints readiness
FRESH=1 video/env/up.sh    # new fork + new seed + new indexer db (stops our pieces first)
REBUILD=1 video/env/up.sh  # rebuild the site clone (e.g. after `git -C $SITE_DIR pull`)
video/env/down.sh          # stops only the pids up.sh recorded
node video/env/smoke.mjs   # end-to-end check: sell via UI, buy via UI, indexer, NFT art (+ /, /stake, /proof shots)
node video/env/reset.mjs   # between takes: cancel persona offers, re-fund, re-seed bought film offers
node video/env/nft.mjs <tokenId> [out.svg]   # on-chain option NFT art -> SVG (+ .json metadata)
```

Logs, pid files, `seeded.json`, the indexer db and smoke screenshots live in `$CLAUDE_JOB_DIR/tmp/demo/`
(default `/Users/apple/.claude/jobs/9eeca95c/tmp/demo`). The site clone is `$CLAUDE_JOB_DIR/tmp/site`.

First start takes ~15 min: the indexer reads all ~230 listed assets and ~60k blocks of history through the fork
before it opens its port. Fund + seed take ~1 min. Later `up.sh` runs are instant while everything is alive.

## Ports

| what | where |
|---|---|
| fork proxy | 127.0.0.1:8548 → rpc.mainnet.chain.robinhood.com |
| anvil fork (chain 4663, 1 s blocks) | http://127.0.0.1:8549 |
| indexer | http://127.0.0.1:4299 |
| site (next start, prod build) | http://localhost:3011 |

**8549, not 8547**: 8547 is already used by the user's own local devnet anvil (chain 31337) and 8545 by another
project. Untouched, as is the dev server on :3010.

## Personas (anvil dev accounts, unlocked: anvil signs whatever the shim forwards)

| persona | address | funds |
|---|---|---|
| seller (#0) | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | 50 ETH, 20 NVDA, 20 AAPL, 20 TSLA, 5000 KYTE |
| buyer (#1) | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 50 ETH, 5000 KYTE, 5 NVDA |
| seeder2 (#2) | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | 100 ETH, 50 each stock |
| seeder3 (#3) | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 | 100 ETH, 50 each stock |
| seeder4 (#4) | 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 | 100 ETH, 50 each stock |

Tokens: NVDA 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC, AAPL 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,
TSLA 0x322F0929c4625eD5bAd873c95208D54E1c003b2d (the Robinhood token; `TSLAon` 0xB197… is Ondo's), all listed
in the v2/v3 registry 0x02f5…658D with puts on.

## Wallet shim (video/record/wallet-shim.js)

```js
await ctx.addInitScript(`window.__DEMO_WALLET_CONFIG = { rpc: 'http://127.0.0.1:8549', persona: 'seller' }`)
await ctx.addInitScript({ path: 'video/record/wallet-shim.js' })
// later, in the page:
await page.evaluate(() => window.__demoWallet.setPersona('buyer'))
```

It starts **disconnected** (eth_accounts = []), so the site shows `Connect wallet`; after the click it stays
authorized for that browser context (localStorage), so navigations and reloads reconnect silently.
`{ connected: true }` in the config starts it authorized (wagmi then auto-connects on load).

## Gotchas found

- **Public RPC is not an archive node** (keeps ~6-10k blocks, ~10-15 min). A plain anvil fork starts failing
  ~15 min after start for any state it had not read yet ("historical state … is not available"; the site showed
  reverted `allowance` reads through Multicall3). `fork-proxy.mjs` retries those reads at `latest`. Keep it.
- **Anvil dev accounts carry EIP-7702 delegations on Robinhood mainnet** (sweeper bots). `fund.mjs` clears their
  code on the fork; without that they are not plain EOAs.
- Stock-token balances are written into storage (slot found by tracing `balanceOf`), not transferred.
- No wallet picker: without a Privy app id the site uses wagmi's `injected()` connector, so `Connect wallet`
  connects straight to the shim (Privy only allows localhost:3010). The shim still announces itself over EIP-6963
  as "Demo Wallet".
- The site clone carries `site.patch`: `devIndicators: false`, and no `upgrade-insecure-requests` in the CSP when
  the RPC is http://127.0.0.1 (the prod CSP would otherwise upgrade the RPC/indexer calls to https).
- Covered call = two transactions. Toast sequence (warm fork): `APPROVE NVDA · Confirm in your wallet` →
  `Waiting for confirmation…` (~1.3 s) → `LOCK 1 NVDA AND LIST THE CALL · Checking…` (~1.6 s) → `Confirm in your
  wallet` (~0.6 s) → `Waiting for confirmation…` (~1.3 s) → `Confirmed`. About 5 s click-to-Confirmed; the approve
  step's own "Confirmed" is never visible. Buy: ~1.8 s click-to-Confirmed. Indexer lists changes within ~1 s.
- The first tx of a kind after a fresh fork is slower (anvil fetches fresh storage slots upstream, ~0.4 s each):
  run `smoke.mjs` once (then `reset.mjs`) before recording.
- `smoke.mjs` buys a seeded `nvda-5`/`nvda-10` call (never the `buy-scene` one) and lists a seller offer;
  `reset.mjs` cleans that up.
- The toast's `View transaction ↗` links to the real explorer, where fork txs do not exist. Don't click it.
- Offers expire 1 week after seeding; reseed with `FRESH=1 up.sh` if the fork is older than that.
