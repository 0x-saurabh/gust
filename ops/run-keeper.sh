#!/bin/bash
# Mainnet keeper (expiries, daily fee split, buybacks), run by launchd or Docker.
# Needs the keeper wallet's key in a file nobody else can read: create it once with ops/set-keeper-key.sh.
set -euo pipefail
REPO="${KYTE_REPO:-/Volumes/my_files/newii/gust-website}"
KEY_FILE="${KEEPER_PRIVATE_KEY_FILE:-$HOME/.kyte/keeper.key}"
for i in $(seq 1 120); do [ -f "$REPO/keeper/src/index.mjs" ] && break; sleep 5; done
cd "$REPO"
if [ ! -s "$KEY_FILE" ]; then
  echo "$(date) keeper key not set up yet ($KEY_FILE). Run ops/set-keeper-key.sh once. Waiting..."
  sleep 300; exit 0   # launchd starts it again; no busy loop
fi
# Owner-only key file on a laptop. In Docker the key is a mounted secret (read-only, root-owned): skip the check.
if [ "${KEEPER_KEY_PERM_CHECK:-1}" = "1" ]; then
  if [ "$(uname)" = "Darwin" ]; then perm=$(stat -f %Lp "$KEY_FILE"); else perm=$(stat -c %a "$KEY_FILE"); fi
  [ "$perm" = "600" ] || { echo "refusing: $KEY_FILE must be chmod 600 (is $perm)"; sleep 300; exit 1; }
fi
export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
export CHAIN_ID="${CHAIN_ID:-4663}"
export KEEPER_PRIVATE_KEY_FILE="$KEY_FILE"
export START_BLOCK="${START_BLOCK:-$(node -e "console.log(require('./src/lib/generated/deployments.json')['$CHAIN_ID'].deployBlock)")}"
export INTERVAL_MS="${INTERVAL_MS:-60000}"
exec node keeper/src/index.mjs
