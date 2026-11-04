#!/bin/bash
# ONE command: authorizes the dedicated keeper wallet for buybacks (BuybackBurner.setKeeper) through the admin
# Safe and the timelock. Asks every password up front (two Safe owners + deployer), schedules, waits out the
# timelock delay, executes. Re-run to resume.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/set-keeper.sh [0xNewKeeper]
set -euo pipefail
cd "$(dirname "$0")/../.."
NEW="${1:-$(cat "$HOME/.kyte/keeper.address" 2>/dev/null || true)}"
[[ "$NEW" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "usage: $0 0xNewKeeperAddress (or put it in ~/.kyte/keeper.address)"; exit 1; }
PLAN="scripts/mainnet/out/setkeeper-4663.json"
mkdir -p scripts/mainnet/out
rc=0; node scripts/mainnet/setkeeper-plan.mjs "$NEW" "$PLAN" || rc=$?
[ $rc = 3 ] && exit 0      # already the keeper
[ $rc = 0 ] || exit $rc
PLAN_FILE="$PLAN" RAW_FILE="scripts/mainnet/out/setkeeper-raw-4663.json" exec caffeinate -i node scripts/mainnet/safe-run.mjs auto
