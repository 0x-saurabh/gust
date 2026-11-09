#!/usr/bin/env bash
# Publishes scripts/hermes/repo/ as the public repo usekyte-org/hermes-kyte (a Hermes Agent skills tap).
#
#   scripts/hermes/publish.sh            # push
#   scripts/hermes/publish.sh --dry-run  # list the tree, push nothing
#
# Same model as scripts/public/publish.sh: the tree is copied as-is, scanned for anything private, committed as
# "Kyte <contact@kyte.sh>" on top of the repo's history and pushed with the GitHub CLI's login.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO=usekyte-org/hermes-kyte
SRC=scripts/hermes/repo
CRED=(-c credential.helper= -c "credential.helper=!gh auth git-credential")
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

if grep -rEil 'saurabh|onrender\.com|dashboard\.render|trig_[A-Za-z0-9]|Co-Authored-By' "$SRC"; then
  echo "private text found in $SRC, refusing" >&2; exit 1
fi
for f in "$SRC"/skills/*/SKILL.md; do head -1 "$f" | grep -q '^---$' || { echo "$f: missing frontmatter" >&2; exit 1; }; done
echo "== $SRC -> $REPO"; find "$SRC" -type f | sed "s|$SRC/|   |"
[ $DRY = 1 ] && { echo "dry run: pushed nothing"; exit 0; }

WORK=$(mktemp -d -t hermes-kyte); trap 'rm -rf "$WORK"' EXIT
gh repo view "$REPO" >/dev/null 2>&1 || gh repo create "$REPO" --public --description "Kyte options market for Hermes Agent: skills + MCP config. Read and prepare only; you sign." >/dev/null
if git "${CRED[@]}" clone -q "https://github.com/$REPO.git" "$WORK/repo" 2>/dev/null && [ -n "$(git -C "$WORK/repo" log --oneline -1 2>/dev/null)" ]; then
  echo "   updating existing history"
else
  rm -rf "$WORK/repo"; git init -q -b main "$WORK/repo"; git -C "$WORK/repo" remote add origin "https://github.com/$REPO.git"; echo "   first publish"
fi
find "$WORK/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$SRC"/. "$WORK/repo"/
git -C "$WORK/repo" -c user.name=Kyte -c user.email=contact@kyte.sh add -A
if git -C "$WORK/repo" diff --cached --quiet; then echo "   nothing changed"; exit 0; fi
MSG=$([ -n "$(git -C "$WORK/repo" log --oneline -1 2>/dev/null)" ] && echo "Update $(date -u +%Y-%m-%d)" || echo "Initial release")
git -C "$WORK/repo" -c user.name=Kyte -c user.email=contact@kyte.sh commit -q -m "$MSG"
git -C "$WORK/repo" "${CRED[@]}" push -q -u origin main && echo "   pushed: $MSG ($(git -C "$WORK/repo" rev-parse --short HEAD))"
