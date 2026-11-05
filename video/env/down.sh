#!/usr/bin/env bash
# Stop the demo stack started by up.sh: only the pids it recorded in $DEMO_DIR (never :3010, other anvils, ~/.kyte).
set -uo pipefail
JOB="${CLAUDE_JOB_DIR:-/Users/apple/.claude/jobs/9eeca95c}"
DEMO_DIR="${DEMO_DIR:-$JOB/tmp/demo}"
for name in site indexer anvil fork-proxy; do
  f="$DEMO_DIR/$name.pid"
  [ -f "$f" ] || continue
  pid=$(cat "$f")
  if kill -0 "$pid" 2>/dev/null; then
    pkill -TERM -P "$pid" 2>/dev/null # npx -> next start child
    kill "$pid" 2>/dev/null && echo "[down] stopped $name ($pid)"
  fi
  rm -f "$f"
done
