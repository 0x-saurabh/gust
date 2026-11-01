#!/bin/bash
# One-time: stores the keeper wallet's private key for the keeper service. Input is hidden and never echoed.
# The key is written to ~/.kyte/keeper.key with permissions 600 (only your user can read it).
set -euo pipefail
mkdir -p "$HOME/.kyte" && chmod 700 "$HOME/.kyte"
read -r -s -p "Paste the KEEPER wallet private key (hidden), then Enter: " KEY; echo
KEY="${KEY#0x}"
[[ "$KEY" =~ ^[0-9a-fA-F]{64}$ ]] || { echo "That is not a 64-hex-character private key. Nothing saved."; exit 1; }
umask 077; printf '0x%s\n' "$KEY" > "$HOME/.kyte/keeper.key"; chmod 600 "$HOME/.kyte/keeper.key"; unset KEY
ADDR=$("$HOME/.foundry/bin/cast" wallet address --private-key "$(cat "$HOME/.kyte/keeper.key")")
echo "Saved for keeper wallet $ADDR."
EXPECTED=$(node -e "console.log(require('/Volumes/my_files/newii/gust-website/contracts/deployments/4663.json').keeper)" 2>/dev/null || true)
if [ -n "$EXPECTED" ] && [ "$(echo $ADDR | tr A-F a-f)" != "$(echo $EXPECTED | tr A-F a-f)" ]; then
  echo "WARNING: the BuybackBurner's keeper is $EXPECTED, not $ADDR. Expiries and splits will work, buybacks will not."
fi
launchctl kickstart -k "gui/$(id -u)/sh.kyte.keeper" 2>/dev/null && echo "Keeper service restarted with the key." || true
