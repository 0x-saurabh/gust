#!/usr/bin/env bash
# Bring up the local demo stack for the film (idempotent: running pieces are left alone).
#
#   video/env/up.sh            # start whatever is not running, print readiness
#   FRESH=1 video/env/up.sh    # stop our pieces first (down.sh), new fork, new seed, new indexer db
#   REBUILD=1 video/env/up.sh  # rebuild the site clone (after pulling new commits into it)
#
# Pieces (logs + pid files in $DEMO_DIR, default $CLAUDE_JOB_DIR/tmp/demo):
#   fork-proxy  127.0.0.1:8548  -> rpc.mainnet.chain.robinhood.com (retries pruned state at latest, see fork-proxy.mjs)
#   anvil       127.0.0.1:8549  fork of Robinhood Chain mainnet, chain id 4663, 1 s blocks
#   indexer     127.0.0.1:4299  this repo's indexer against the fork, db $DEMO_DIR/fork-demo.sqlite
#   site        localhost:3011  production build of a plain git clone ($SITE_DIR), Privy off, demo banner off
# Never touches :3010 (the user's dev server), :8547/:8545 (other local anvils), ~/.kyte or launchd.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
JOB="${CLAUDE_JOB_DIR:-/Users/apple/.claude/jobs/9eeca95c}"
DEMO_DIR="${DEMO_DIR:-$JOB/tmp/demo}"
SITE_DIR="${SITE_DIR:-$JOB/tmp/site}"
ANVIL="${ANVIL:-$HOME/.foundry/bin/anvil}"
PROXY_PORT=8548 RPC_PORT=8549 INDEXER_PORT=4299 SITE_PORT=3011
RPC="http://127.0.0.1:$RPC_PORT"
START_BLOCK="${START_BLOCK:-106525888}" # v3 fromBlock: real mainnet v3 offers show too
export DEMO_DIR RPC_URL="$RPC" INDEXER_URL="http://127.0.0.1:$INDEXER_PORT"
mkdir -p "$DEMO_DIR"
cd "$REPO"

log() { printf '[up] %s\n' "$*"; }
alive() { [ -f "$DEMO_DIR/$1.pid" ] && kill -0 "$(cat "$DEMO_DIR/$1.pid")" 2>/dev/null; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
wait_for() { # name, seconds, command...
  local name=$1 secs=$2; shift 2
  for _ in $(seq 1 "$secs"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  log "$name not ready after ${secs}s (see $DEMO_DIR/$name.log)"; return 1
}
start() { # name, command... (runs in background, pid + log in DEMO_DIR)
  local name=$1; shift
  nohup "$@" >"$DEMO_DIR/$name.log" 2>&1 &
  echo $! >"$DEMO_DIR/$name.pid"
}
rpc_ok() { curl -sf -X POST "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | grep -q '"0x1237"'; }

[ "${FRESH:-0}" = 1 ] && "$REPO/video/env/down.sh" || true

# ---------------------------------------------------------------- fork proxy
if ! alive fork-proxy; then
  port_busy $PROXY_PORT && { log "port $PROXY_PORT is taken by something else"; exit 1; }
  start fork-proxy env PORT=$PROXY_PORT node "$REPO/video/env/fork-proxy.mjs"
  wait_for fork-proxy 10 curl -sf -X POST http://127.0.0.1:$PROXY_PORT -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
fi

# ---------------------------------------------------------------- anvil fork (+ fund + seed when new)
NEW_CHAIN=0
if ! alive anvil; then
  port_busy $RPC_PORT && { log "port $RPC_PORT is taken by something else"; exit 1; }
  start anvil "$ANVIL" --fork-url "http://127.0.0.1:$PROXY_PORT" --port $RPC_PORT --host 127.0.0.1 --block-time 1 --chain-id 4663
  wait_for anvil 60 rpc_ok
  NEW_CHAIN=1
  log "anvil fork at block $(curl -s -X POST "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | sed -E 's/.*"result":"([^"]+)".*/\1/' | xargs printf '%d')"
  node video/env/fund.mjs | tee "$DEMO_DIR/fund.log"
  node video/env/seed.mjs | tee "$DEMO_DIR/seed.log"
fi

# ---------------------------------------------------------------- site clone (plain clone, not a worktree)
if [ ! -d "$SITE_DIR/.git" ]; then
  log "cloning the repo into $SITE_DIR"
  git clone -q "$REPO" "$SITE_DIR"
fi
# Clone-only tweaks (devIndicators off; no upgrade-insecure-requests for the http localhost RPC). Applied once.
if git -C "$SITE_DIR" diff --quiet -- next.config.ts src/proxy.ts; then
  git -C "$SITE_DIR" apply "$REPO/video/env/site.patch" && log "applied video/env/site.patch to the clone"
fi
[ -d "$SITE_DIR/node_modules" ] || (cd "$SITE_DIR" && pnpm install --frozen-lockfile >"$DEMO_DIR/pnpm-install.log" 2>&1)
SITE_ENV=(NEXT_PUBLIC_CHAIN_ID=4663 NEXT_PUBLIC_RPC_URL="$RPC" NEXT_PUBLIC_INDEXER_URL="http://127.0.0.1:$INDEXER_PORT"
  NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_PRIVY_APP_ID= NEXT_PUBLIC_SITE_URL="http://localhost:$SITE_PORT" NEXT_TELEMETRY_DISABLED=1)
if [ "${REBUILD:-0}" = 1 ] || [ ! -f "$SITE_DIR/.next/BUILD_ID" ]; then
  alive site && { kill "$(cat "$DEMO_DIR/site.pid")" 2>/dev/null || true; sleep 1; }
  log "building the site clone (~1 min)"
  (cd "$SITE_DIR" && env "${SITE_ENV[@]}" node node_modules/next/dist/bin/next build >"$DEMO_DIR/build.log" 2>&1) || { log "build failed, see $DEMO_DIR/build.log"; exit 1; }
fi

# ---------------------------------------------------------------- indexer (new db whenever the chain is new)
if [ $NEW_CHAIN = 1 ] && alive indexer; then kill "$(cat "$DEMO_DIR/indexer.pid")"; sleep 1; fi
if ! alive indexer; then
  port_busy $INDEXER_PORT && { log "port $INDEXER_PORT is taken by something else"; exit 1; }
  [ $NEW_CHAIN = 1 ] && rm -f "$DEMO_DIR"/fork-demo.sqlite*
  # Run from the clone: the indexer is committed code, and the clone keeps it independent of edits in the repo.
  (cd "$SITE_DIR" && start indexer env CHAIN_ID=4663 RPC_URL="$RPC" PORT=$INDEXER_PORT START_BLOCK="$START_BLOCK" \
    DB_FILE="$DEMO_DIR/fork-demo.sqlite" RATE_LIMIT_PER_MIN=100000 POLL_MS=1000 QUOTE_MS=15000 node indexer/src/index.mjs)
  log "indexer syncing (first start: asset list + ~50k blocks through the fork, ~10-15 min)"
fi

# ---------------------------------------------------------------- site
if ! alive site; then
  port_busy $SITE_PORT && { log "port $SITE_PORT is taken by something else"; exit 1; }
  (cd "$SITE_DIR" && start site env "${SITE_ENV[@]}" node node_modules/next/dist/bin/next start -p $SITE_PORT)
  wait_for site 60 curl -sf -o /dev/null "http://localhost:$SITE_PORT/"
fi

wait_for indexer 1800 curl -sf "http://127.0.0.1:$INDEXER_PORT/health"
H=$(curl -s "http://127.0.0.1:$INDEXER_PORT/health")
log "ready"
log "  rpc      $RPC  (chain 4663, block $(echo "$H" | sed -E 's/.*"latestBlock":([0-9]+).*/\1/'))"
log "  indexer  http://127.0.0.1:$INDEXER_PORT  ($(echo "$H" | sed -E 's/.*"offers":([0-9]+).*/\1/') offers indexed)"
log "  site     http://localhost:$SITE_PORT"
log "  seeded   $DEMO_DIR/seeded.json (buy scene offer: $(node -e "console.log(require('$DEMO_DIR/seeded.json').buyScene)"))"
