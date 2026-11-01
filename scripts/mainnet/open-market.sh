#!/usr/bin/env bash
# ONE command to open the market: imports the two owner wallets the first time, asks every password up front,
# schedules the 7 timelock actions through the admin Safe, keeps the Mac awake for the 48 h timelock, then
# executes them. Safe to re-run: it resumes where it stopped.
#
#   cd /Volumes/my_files/newii/gust-website && scripts/mainnet/open-market.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
CAST=$HOME/.foundry/bin/cast
have() { $CAST wallet list 2>/dev/null | grep -q "^$1 "; }

for k in deployer owner1 owner2; do
  if ! have "$k"; then
    if [ "$k" = deployer ]; then echo "missing keystore 'deployer'"; exit 1; fi
    echo; echo "First time: import Safe owner wallet '$k' (paste its private key, then pick a password)."
    echo "Use two DIFFERENT wallets out of the three Safe owners."
    $CAST wallet import "$k" --interactive
  fi
done

# -i keeps the Mac from sleeping while the timelock runs (display may still turn off)
exec caffeinate -i node scripts/mainnet/safe-run.mjs auto
