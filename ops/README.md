# Running Kyte in production (no terminal after setup)

Three services. Each restarts on its own after a crash or a reboot.

| Service | What it does | Needs a key? |
|---|---|---|
| **indexer** | Follows Robinhood Chain and serves the site's data API | No |
| **keeper** | Expires options, runs the daily fee split, runs buybacks | Yes: the keeper wallet (`keeper` in `contracts/deployments/4663.json`) |
| **web** | The website | No |

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

A laptop sleeps and travels, so this is a stopgap. While the Mac is off the keeper does not run expiries or splits.
Users are never blocked, since anyone can call those, but fee splits wait.

## Why the keeper needs its own key

The keeper signs transactions: `expireMany`, `split` and `buyAndBurn`. That key can only do keeper things. It cannot
move user funds, change settings or unpause. Buybacks are bounded on chain by the TWAP floor and the per-call cap, so
a stolen keeper key cannot drain anything. Still, use a dedicated wallet with a little ETH for gas, not a Safe owner.
