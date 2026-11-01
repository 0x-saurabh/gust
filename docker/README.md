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
