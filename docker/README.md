# Running Kyte with Docker

One `docker-compose.yml` runs the whole platform on any Linux server with Docker:

| Service | Image | What | Port (host) |
|---|---|---|---|
| `web` | `kyte-web` (Dockerfile target `web`) | Next.js site, standalone server | `127.0.0.1:3010` |
| `indexer` | `kyte-services` (target `services`) | Chain follower + JSON API, SQLite in the `indexer-data` volume | `127.0.0.1:4200` |
| `keeper` | `kyte-services` | Expire / split / buyback bot. Profile `keeper` | none |
| `caddy` | `caddy:2.10-alpine` | HTTPS for the site and the API (Let's Encrypt). Profile `proxy` | `80`, `443` |

The `services` image compiles the contract ABIs with forge during the build (`contracts/out` is not in git),
so nothing has to be built on the host.

## 1. Configure

```bash
cp docker/compose.env.example .env     # .env is gitignored
```

Set at least:

- `RPC_URL`: a private Robinhood Chain RPC (the public one rate-limits).
- `NEXT_PUBLIC_INDEXER_URL`: the URL **browsers** use for the API, e.g. `https://api.kyte.sh`. It is baked into the
  site and its CSP at build time, so rebuild `web` after changing any `NEXT_PUBLIC_*` value.
- `NEXT_PUBLIC_SITE_URL`, `CORS_ORIGINS` (e.g. `https://kyte.sh`).
- `START_BLOCK` is preset to the mainnet deploy block (`103214110`). The indexer catches up from there before
  its API opens (about a minute on the public RPC).

## 2. Start

```bash
docker compose up -d --build                    # web + indexer
docker compose ps                               # both should turn "healthy"
curl -s localhost:4200/health
```

### Keeper

The keeper's address must be the `keeper` set in `contracts/deployments/4663.json` for buybacks to work, and it
needs a little ETH for gas. The key is mounted as a Docker secret, never put in `.env`:

```bash
mkdir -p docker/secrets                          # gitignored
printf '%s' '0xYOUR_KEEPER_KEY' > docker/secrets/keeper_key
chmod 600 docker/secrets/keeper_key && sudo chown 1000:1000 docker/secrets/keeper_key   # the container runs as uid 1000
docker compose --profile keeper up -d
docker compose logs -f keeper
```

Set `ALERT_WEBHOOK_URL` (Slack/Discord) so failed jobs and low gas reach you.

### HTTPS

Point DNS for `SITE_DOMAIN` and `API_DOMAIN` at the server, open ports 80/443, then:

```bash
# .env: SITE_DOMAIN=kyte.sh  API_DOMAIN=api.kyte.sh  TRUST_PROXY=1
#       NEXT_PUBLIC_SITE_URL=https://kyte.sh  NEXT_PUBLIC_INDEXER_URL=https://api.kyte.sh  CORS_ORIGINS=https://kyte.sh
docker compose --profile proxy --profile keeper up -d --build
```

Caddy gets and renews the certificates itself. Web and indexer stay bound to `127.0.0.1`, so the only public
ports are Caddy's.

## Render

`render.yaml` is a Blueprint for the same three services, built from the same Dockerfile (the `APP` env var,
passed to the build, picks the image: `web` or `services`):

| Render service | Type | Plan | Notes |
|---|---|---|---|
| `kyte-indexer` | web | `0.5c-512mb` + 1 GB disk | Disk keeps the SQLite db across deploys; a deploy has a few seconds of downtime |
| `kyte-web` | web | `0.5c-512mb` | |
| `kyte-keeper` | background worker | `0.5c-512mb` | |

Deploy: open
[render.com/deploy?repo=https://github.com/0x-saurabh/gust](https://render.com/deploy?repo=https://github.com/0x-saurabh/gust)
(Render must have access to the repo through its GitHub app). Render asks for the `sync: false` values once:
`RPC_URL` (blank = public RPC), `KEEPER_PRIVATE_KEY`, `ALERT_WEBHOOK_URL`.

After the first deploy:

1. Check the two `.onrender.com` URLs Render gave the services. If they aren't `kyte-indexer.onrender.com` and
   `kyte-web.onrender.com`, update `NEXT_PUBLIC_INDEXER_URL` / `NEXT_PUBLIC_SITE_URL` on `kyte-web` and
   `CORS_ORIGINS` on `kyte-indexer`, then redeploy `kyte-web` (the URLs are baked into the build).
2. Add the site URL to the Privy app's allowed origins.
3. Custom domains: add them in each service's settings, then update the same three variables.

`TRUST_PROXY=1` is set on the indexer because every request reaches it through Render's load balancer; without
it, all visitors would share one rate-limit bucket. The client IP is taken from the first `X-Forwarded-For`
entry, which a client can set itself, so the per-IP limit is best-effort there.

## Operating

```bash
docker compose logs -f indexer web                  # logs (rotated, 5 × 10 MB per service)
git pull && docker compose up -d --build            # deploy a new version
docker compose down                                 # stop (keeps the indexer database)
docker compose down -v                              # stop and DELETE the indexer database (full resync)
```

Back up the database with
`docker compose exec indexer node -e "new (require('node:sqlite').DatabaseSync)('indexer/data/4663.sqlite').exec(\"VACUUM INTO 'indexer/data/backup.sqlite'\")"`
and then `docker compose cp indexer:/app/indexer/data/backup.sqlite .`

For a new deployment of the contracts, update `contracts/deployments/<chain>.json`, run `pnpm sync`, set the new
`START_BLOCK`, and run `docker compose down -v && docker compose up -d --build`.
