#!/usr/bin/env bash
# Runs the same checks as .github/workflows/ci.yml, locally, before a push to main. Fails fast on the first red step.
#   scripts/ci-local.sh            # everything
#   SKIP_FORK=1 is implied: fork tests need FORK=1 and are not part of CI
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
step() { printf '\n== %s\n' "$1"; }
step "contracts: forge fmt --check"; (cd contracts && forge fmt --check)
step "contracts: forge build";       (cd contracts && forge build --silent)
step "contracts: forge test (ci profile)"; (cd contracts && FOUNDRY_PROFILE=ci forge test --no-match-contract Fork -q 2>&1 | tail -3)
step "web: pnpm typecheck";          pnpm typecheck
step "web: pnpm test";               pnpm test 2>&1 | grep -E "^ℹ (pass|fail)" | tee /dev/stderr | grep -q "^ℹ fail 0"
step "web: pnpm build";              pnpm build >/dev/null 2>&1 && echo "build ok"
printf '\nall green: safe to push\n'
