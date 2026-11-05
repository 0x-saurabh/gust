# Running Kyte in production (no terminal after setup)

Three services. Each restarts on its own after a crash or a reboot.

| Service | What it does | Needs a key? |
|---|---|---|
| **indexer** | Follows Robinhood Chain and serves the site's data API | No |
| **keeper** | Expires options, runs the daily fee split, runs buybacks | Yes: the keeper wallet (`keeper` in `contracts/deployments/4663.json`) |
| **web** | The website | No |

## Option R: Render (recommended, nothing to run yourself)

`render.yaml` in the repo root is a Render Blueprint with the indexer and the website. The keeper is a separate,
hand-made Node background worker (`kyte-keeper-v2`), kept out of the Blueprint so a sync never creates a second one:

| Service | Render type | Plan | Why |
|---|---|---|---|
| kyte-indexer | Private service + 1 GB disk | Starter | Free instances sleep; a sleeping indexer stops scanning. The disk keeps its progress across deploys |
| kyte-keeper-v2 | Background worker (Node 24, not in the Blueprint) | Starter | Runs every minute, forever. Build: `corepack enable && corepack prepare pnpm@10.23.0 --activate && pnpm install --frozen-lockfile`, start: `bash ops/run-keeper.sh`, env `KEEPER_PRIVATE_KEY`, `ALERT_WEBHOOK_URL`, `CHAIN_ID=4663` |
| kyte-web | Web service | Starter | Talks to the private indexer through `/api/indexer` |

1. Open https://dashboard.render.com/blueprint/new and connect the GitHub repo `0x-saurabh/gust`.
2. Pick the branch that has `render.yaml` (`worktree-ops-automation` until it is merged into `main`).
3. Fill in the values Render asks for: `KEEPER_PRIVATE_KEY` (the keeper wallet only), `NEXT_PUBLIC_PRIVY_APP_ID`,
   `NEXT_PUBLIC_SITE_URL` (your domain, or the `onrender.com` URL), and optionally `ALERT_WEBHOOK_URL`.
4. Review the monthly cost Render shows and click **Apply**.

After that every push to that branch redeploys automatically, and Render restarts anything that stops. Add the
site URL to the allowed origins in the Privy dashboard, and point your domain at `kyte-web`.

## Option A: a server (real production)

Any Linux machine with Docker works: a VPS (Hetzner, DigitalOcean, AWS Lightsail) or a Docker app host.

```bash
git clone <your repo> kyte && cd kyte
cp ops/docker/prod.env.example ops/docker/prod.env        # set SITE_ORIGIN, INDEXER_PUBLIC_URL, PRIVY_APP_ID
mkdir -p ops/docker/secrets
printf '0x<keeper key>\n' > ops/docker/secrets/keeper.key && chmod 600 ops/docker/secrets/keeper.key
docker compose --env-file ops/docker/prod.env up -d --build
```

That is the last command you run. `restart: unless-stopped` brings every service back after crashes and host
reboots. Put a TLS proxy (Caddy or nginx) in front: `kyte.sh` to port 3010, `api.kyte.sh` to port 4200.

Check on it with `docker compose ps` and `docker compose logs -f keeper`.

The website can also go on Vercel instead (set the same `NEXT_PUBLIC_*` values there). Then the server only runs
`docker compose --env-file ops/docker/prod.env up -d indexer keeper`.

## Option B: this Mac, until a server exists

```bash
ops/install-macos-services.sh     # once: indexer + keeper become background services (start at login, auto-restart)
ops/set-keeper-key.sh             # once: hidden prompt for the keeper key, saved to ~/.kyte/keeper.key (chmod 600)
```

After that no Terminal is needed. Logs are in `~/Library/Logs/kyte-indexer.log` and `~/Library/Logs/kyte-keeper.log`.
Remove the services with `ops/install-macos-services.sh --remove`.

macOS blocks background services from reading external drives ("Operation not permitted"), so the installer
copies the service runtime (about 80 MB) to `~/.kyte/app` on the internal disk and runs it from there. Re-run the
installer after pulling new indexer or keeper code.

A laptop sleeps and travels, so this is a stopgap. While the Mac is off the keeper does not run expiries or splits.
Users are never blocked, since anyone can call those, but fee splits wait.

## Why the keeper needs its own key

The keeper signs transactions: `expireMany`, `split` and `buyAndBurn`. That key can only do keeper things. It cannot
move user funds, change settings or unpause. Buybacks are bounded on chain by the TWAP floor and the per-call cap, so
a stolen keeper key cannot drain anything. Still, use a dedicated wallet with a little ETH for gas, not a Safe owner.
