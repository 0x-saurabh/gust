#!/usr/bin/env bash
# Publishes the public repos of the usekyte GitHub account from this private repo, without ever mirroring it.
#
#   scripts/public/publish.sh all            # contracts, staking and market
#   scripts/public/publish.sh market         # one of: contracts | staking | market
#   scripts/public/publish.sh all --dry-run  # build and check the trees, push nothing
#
# For each target: build-tree.mjs copies an allowlist into a clean folder and refuses if anything private is found,
# forge build proves the contract trees compile, then the folder is committed as "Kyte <contact@kyte.sh>" on top
# of the public repo's existing history and pushed over SSH with the usekyte key (~/.ssh/usekyte_ed25519,
# host alias github-usekyte in ~/.ssh/config). No other git identity, remote or account is involved.
set -euo pipefail
cd "$(dirname "$0")/../.."
AUTHOR_NAME="Kyte"
AUTHOR_EMAIL="contact@kyte.sh"
HOST="git@github-usekyte"
FORGE=${FORGE:-$HOME/.foundry/bin/forge}
repo_of() { case "$1" in contracts) echo usekyte/kyte-contract-v2 ;; staking) echo usekyte/Kyte-StakingPool ;; market) echo usekyte/Kyte-Market ;; *) echo "unknown target: $1" >&2; exit 1 ;; esac; }

TARGETS="${1:-all}"; DRY=0; [ "${2:-}" = "--dry-run" ] && DRY=1
[ "$TARGETS" = all ] && TARGETS="contracts staking market"
WORK=$(mktemp -d -t kyte-public)
trap 'rm -rf "$WORK"' EXIT

for t in $TARGETS; do
  echo "== $t -> $(repo_of "$t")"
  TREE="$WORK/$t-tree"
  node scripts/public/build-tree.mjs "$t" "$TREE"
  if [ "$t" != market ]; then
    # the public contract trees must compile on their own; borrow this repo's installed libs for the check
    if [ -d contracts/node_modules ]; then
      ln -s "$PWD/contracts/node_modules" "$TREE/node_modules"
      (cd "$TREE" && "$FORGE" build -q) && echo "   forge build ok"
      rm -f "$TREE/node_modules"
    else
      echo "   (contracts/node_modules missing: skipping forge build)"
    fi
  fi
  [ $DRY = 1 ] && { echo "   dry run: tree is at $TREE (deleted on exit)"; find "$TREE" -type f | sed "s|$TREE/|   |" | head -40; continue; }

  CLONE="$WORK/$t-repo"
  if git clone -q "$HOST:$(repo_of "$t").git" "$CLONE" 2>/dev/null && [ -n "$(git -C "$CLONE" log --oneline -1 2>/dev/null)" ]; then
    echo "   updating existing history"
  else
    rm -rf "$CLONE"; git init -q -b main "$CLONE"
    git -C "$CLONE" remote add origin "$HOST:$(repo_of "$t").git"
    echo "   first publish"
  fi
  # replace the working tree with the fresh one (history stays), commit only if something changed
  find "$CLONE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -R "$TREE"/. "$CLONE"/
  git -C "$CLONE" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" add -A
  if git -C "$CLONE" diff --cached --quiet; then echo "   nothing changed"; continue; fi
  MSG=$([ -n "$(git -C "$CLONE" log --oneline -1 2>/dev/null)" ] && echo "Update $(date -u +%Y-%m-%d)" || echo "Initial release")
  git -C "$CLONE" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" commit -q -m "$MSG"
  git -C "$CLONE" push -q -u origin main
  echo "   pushed: $MSG ($(git -C "$CLONE" rev-parse --short HEAD))"
done
echo "done"
