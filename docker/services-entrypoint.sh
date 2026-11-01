#!/bin/sh
# Entrypoint for the indexer/keeper image. A mounted volume or disk can be owned by root:
# fix the data dir's owner, then drop to the unprivileged `node` user for the actual process.
set -e
if [ "$(id -u)" = 0 ]; then
  chown node:node /app/indexer/data 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi
exec "$@"
