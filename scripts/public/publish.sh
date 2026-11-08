#!/usr/bin/env bash
# Publishes the public repos of the usekyte-org GitHub organization from this repo, without ever mirroring it.
#
#   scripts/public/publish.sh all            # contracts, staking and market
#   scripts/public/publish.sh market         # one of: contracts | staking | market | profile | abis | docs
#   scripts/public/publish.sh all --dry-run  # build and check the trees, push nothing
#
# For each target: build-tree.mjs copies an allowlist into a clean folder and refuses if anything private is found,
# forge build proves the contract trees compile, then the folder is committed as "Kyte <contact@kyte.sh>" on top
# of the public repo's existing history and pushed over HTTPS with the GitHub CLI's login (an owner of usekyte-org).
# The commit author is always Kyte; the repo is created in the organization if it does not exist yet.
set -euo pipefail
cd "$(dirname "$0")/../.."
AUTHOR_NAME="Kyte"
AUTHOR_EMAIL="contact@kyte.sh"
ORG="usekyte-org"
CRED=(-c credential.helper= -c "credential.helper=!gh auth git-credential")
FORGE=${FORGE:-$HOME/.foundry/bin/forge}
# profile -> the organization's .github repo, whose profile/README.md is the org page
repo_of() { case "$1" in contracts) echo $ORG/kyte-contract-v2 ;; staking) echo $ORG/Kyte-StakingPool ;; market) echo $ORG/Kyte-Market ;; profile) echo $ORG/.github ;; abis) echo $ORG/kyte-abis ;; docs) echo $ORG/kyte-docs ;; *) echo "unknown target: $1" >&2; exit 1 ;; esac; }
url_of() { echo "https://github.com/$(repo_of "$1").git"; }

TARGETS="${1:-all}"; DRY=0; [ "${2:-}" = "--dry-run" ] && DRY=1
[ "$TARGETS" = all ] && TARGETS="contracts staking market profile abis docs"
WORK=$(mktemp -d -t kyte-public)
trap 'rm -rf "$WORK"' EXIT

for t in $TARGETS; do
  echo "== $t -> $(repo_of "$t")"
  TREE="$WORK/$t-tree"
  node scripts/public/build-tree.mjs "$t" "$TREE"
  if [ "$t" = contracts ] || [ "$t" = staking ]; then
    # the public contract trees must compile on their own; borrow this repo's installed libs for the check
    if [ -d contracts/node_modules ]; then
      ln -s "$PWD/contracts/node_modules" "$TREE/node_modules"
      (cd "$TREE" && "$FORGE" build -q) && echo "   forge build ok"
      rm -f "$TREE/node_modules"
    else
      echo "   (contracts/node_modules missing: skipping forge build)"
    fi
  fi
  if [ "$t" = profile ]; then mkdir -p "$TREE/profile"; mv "$TREE/README.md" "$TREE/profile/README.md"; [ -f "$TREE/banner.png" ] && mv "$TREE/banner.png" "$TREE/profile/banner.png"; fi
  [ $DRY = 1 ] && { echo "   dry run: tree is at $TREE (deleted on exit)"; find "$TREE" -type f | sed "s|$TREE/|   |" | head -40; continue; }

  CLONE="$WORK/$t-repo"
  gh repo view "$(repo_of "$t")" >/dev/null 2>&1 || gh repo create "$(repo_of "$t")" --public >/dev/null
  if git "${CRED[@]}" clone -q "$(url_of "$t")" "$CLONE" 2>/dev/null && [ -n "$(git -C "$CLONE" log --oneline -1 2>/dev/null)" ]; then
    echo "   updating existing history"
  else
    rm -rf "$CLONE"; git init -q -b main "$CLONE"
    git -C "$CLONE" remote add origin "$(url_of "$t")"
    echo "   first publish"
  fi
  # replace the working tree with the fresh one (history stays), commit only if something changed
  find "$CLONE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -R "$TREE"/. "$CLONE"/
  git -C "$CLONE" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" add -A
  if git -C "$CLONE" diff --cached --quiet; then echo "   nothing changed"; continue; fi
  MSG=$([ -n "$(git -C "$CLONE" log --oneline -1 2>/dev/null)" ] && echo "Update $(date -u +%Y-%m-%d)" || echo "Initial release")
  git -C "$CLONE" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" commit -q -m "$MSG"
  if git -C "$CLONE" "${CRED[@]}" push -q -u origin main 2>/dev/null; then
    echo "   pushed: $MSG ($(git -C "$CLONE" rev-parse --short HEAD))"
  else
    echo "   NOT PUSHED: $(repo_of "$t") could not be pushed. Check gh auth status and re-run."
  fi
done
echo "done"
