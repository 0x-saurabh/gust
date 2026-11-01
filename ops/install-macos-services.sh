#!/bin/bash
# Installs the indexer + keeper as macOS background services (launchd): they start at login, restart on crash,
# and need no Terminal window. Run once:  ops/install-macos-services.sh      Remove:  ops/install-macos-services.sh --remove
set -euo pipefail
cd "$(dirname "$0")/.."
U=$(id -u)
for svc in indexer keeper; do launchctl bootout "gui/$U/sh.kyte.$svc" 2>/dev/null || true; rm -f "$HOME/Library/LaunchAgents/sh.kyte.$svc.plist"; done
if [ "${1:-}" = "--remove" ]; then echo "Kyte services removed."; exit 0; fi
# stop a hand-started mainnet indexer on :4201 so the service can take the port (the devnet one on :4200 is left alone)
pid=$(lsof -nP -iTCP:4201 -sTCP:LISTEN -t 2>/dev/null || true); [ -n "$pid" ] && kill "$pid" && sleep 2
mkdir -p "$HOME/Library/LaunchAgents"
for svc in indexer keeper; do
  sed "s|\$HOME|$HOME|g" "ops/macos/sh.kyte.$svc.plist" > "$HOME/Library/LaunchAgents/sh.kyte.$svc.plist"
  launchctl bootstrap "gui/$U" "$HOME/Library/LaunchAgents/sh.kyte.$svc.plist"
done
for i in $(seq 1 60); do curl -s localhost:4201/health >/dev/null 2>&1 && break; sleep 2; done
curl -s localhost:4201/health >/dev/null && echo "Indexer service running on :4201." || echo "Indexer not answering yet: see ~/Library/Logs/kyte-indexer.log"
[ -s "$HOME/.kyte/keeper.key" ] && echo "Keeper service running." || echo "Keeper waits for its key: run ops/set-keeper-key.sh once."
echo "Logs: ~/Library/Logs/kyte-indexer.log, ~/Library/Logs/kyte-keeper.log"
