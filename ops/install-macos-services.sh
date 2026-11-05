#!/bin/bash
# Installs the indexer + keeper as macOS background services (launchd): they start at login, restart on crash,
# and need no Terminal window.
#
# macOS does not let background services read files on external drives ("Operation not permitted"), and this
# project lives on one. So the installer copies what the services need (a few MB) to ~/.kyte/app on the internal
# disk and runs them from there. Re-run it after pulling new indexer/keeper code.
#
#   ops/install-macos-services.sh            install or update
#   ops/install-macos-services.sh --remove   uninstall
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP="${KYTE_APP:-$HOME/.kyte/app}"
U=$(id -u)
NODE_BIN="$(command -v node || echo "$HOME/.nvm/versions/node/v25.9.0/bin/node")"
COPY_ONLY=0; [ "${1:-}" = "--copy-only" ] && COPY_ONLY=1   # build the runtime folder, touch no services

[ $COPY_ONLY = 1 ] || for svc in indexer keeper; do
  launchctl bootout "gui/$U/sh.kyte.$svc" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/sh.kyte.$svc.plist"
done
if [ "${1:-}" = "--remove" ]; then echo "Kyte services removed."; exit 0; fi

echo "Copying the service runtime to $APP ..."
mkdir -p "$APP/indexer" "$APP/keeper" "$APP/contracts" "$APP/src/lib/generated" "$APP/ops" "$HOME/.kyte"
chmod 700 "$HOME/.kyte"
rsync -a --delete "$SRC/indexer/src/" "$APP/indexer/src/"
rsync -a --delete "$SRC/indexer/abis/" "$APP/indexer/abis/"
rsync -a --delete "$SRC/keeper/src/" "$APP/keeper/src/"
rsync -a --delete --exclude '*.dry-run.json' "$SRC/contracts/deployments/" "$APP/contracts/deployments/"
cp "$SRC/src/lib/generated/deployments.json" "$APP/src/lib/generated/deployments.json"
cp "$SRC/ops/run-indexer.sh" "$SRC/ops/run-keeper.sh" "$APP/ops/"
if [ ! -d "$APP/node_modules/viem" ]; then
  [ -f "$APP/package.json" ] || echo '{"name":"kyte-services","private":true,"type":"module"}' > "$APP/package.json"
  (cd "$APP" && npm install --no-audit --no-fund --silent viem@2.57.13)
fi
if [ $COPY_ONLY = 1 ]; then echo "Runtime ready in $APP (no services touched)."; exit 0; fi

# stop a hand-started mainnet indexer on :4201 so the service can take the port (the devnet one on :4200 is left alone)
pid=$(lsof -nP -iTCP:4201 -sTCP:LISTEN -t 2>/dev/null || true)
[ -n "$pid" ] && kill "$pid" && sleep 2

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
for svc in indexer keeper; do
  cat > "$HOME/Library/LaunchAgents/sh.kyte.$svc.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.kyte.$svc</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$APP/ops/run-$svc.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/kyte-$svc.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/kyte-$svc.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>$HOME</string>
    <key>KYTE_REPO</key><string>$APP</string>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST
  launchctl bootstrap "gui/$U" "$HOME/Library/LaunchAgents/sh.kyte.$svc.plist"
done

for i in $(seq 1 90); do curl -s localhost:4201/health >/dev/null 2>&1 && break; sleep 2; done
if curl -s localhost:4201/health >/dev/null; then echo "Indexer service running on :4201."; else echo "Indexer not answering yet: see ~/Library/Logs/kyte-indexer.log"; fi
if [ -s "$HOME/.kyte/keeper.key" ]; then echo "Keeper service running."; else echo "Keeper waits for its key: run ops/set-keeper-key.sh once."; fi
echo "Logs: ~/Library/Logs/kyte-indexer.log, ~/Library/Logs/kyte-keeper.log"
