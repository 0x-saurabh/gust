#!/usr/bin/env bash
# Lists graduated Pons launchpad tokens on Kyte: checks each token on chain, then one Safe transaction through the
# 10 min timelock (owner passwords + deployer password, same as the other mainnet scripts), then refreshes the local
# services so the market, agent and Launchpad page see the listing.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/pons-list.sh 0xToken [0xToken2 ...]
#
# Options on Pons tokens are limited to 24 hours by the site, the agent, the MCP and Autopilot (the markets allow 90 days).
set -euo pipefail
cd "$(dirname "$0")/../.."
[ $# -ge 1 ] || { echo "usage: $0 0xToken [0xToken2 ...]"; exit 1; }

echo "== checks"
P=$(node scripts/mainnet/pons-list-plan.mjs "$@" | tee /dev/stderr | grep '^scripts/mainnet/out/pons-list-plan-' || true)
[ -n "$P" ] || { echo "no plan written (nothing passed the checks)"; exit 2; }

echo "== timelock (schedule, wait $(node -e "console.log(require('./$P').delay)")s, execute)"
PLAN_FILE="$P" RAW_FILE="${P%.json}.raw.json" caffeinate -i node scripts/mainnet/safe-run.mjs auto

echo "== refresh local services"
rsync -a --delete indexer/src/ "$HOME/.kyte/app/indexer/src/" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/sh.kyte.indexer" 2>/dev/null || true
echo "listed. The indexer picks the registry change up within a minute; Render's indexer within its poll interval."
