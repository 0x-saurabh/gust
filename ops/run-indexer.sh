#!/bin/bash
# Mainnet indexer, run by launchd (ops/macos/sh.kyte.indexer.plist) or Docker. Restarts are launchd's job.
set -euo pipefail
REPO="${KYTE_REPO:-/Volumes/my_files/newii/gust-website}"
# The repo lives on an external drive: wait for it after login/boot instead of failing.
for i in $(seq 1 120); do [ -f "$REPO/indexer/src/index.mjs" ] && break; sleep 5; done
cd "$REPO"
export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
export CHAIN_ID="${CHAIN_ID:-4663}"
export PORT="${PORT:-4201}"
export HOST="${HOST:-127.0.0.1}"
export SITE_URL="${SITE_URL:-http://localhost:3010}" # Autopilot trigger links open the local site
export POLL_MS="${POLL_MS:-3000}"
export START_BLOCK="${START_BLOCK:-$(node -e "console.log(require('./src/lib/generated/deployments.json')['$CHAIN_ID'].deployBlock)")}"
exec node indexer/src/index.mjs
