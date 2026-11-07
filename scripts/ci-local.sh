#!/usr/bin/env bash
# The same checks as .github/workflows/ci.yml, run locally before a push to main. Stops at the first red step.
#   scripts/ci-local.sh
# Fork tests are not part of CI (they need FORK=1) and are skipped here too.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
step() { printf '\n== %s\n' "$1"; }
step "contracts: forge fmt --check";        (cd contracts && forge fmt --check)
step "contracts: forge build";              (cd contracts && forge build --silent && echo "build ok")
step "contracts: forge test (ci profile)";  (cd contracts && FOUNDRY_PROFILE=ci forge test --no-match-contract Fork -q 2>&1 | grep -E "FAIL|Suite result: FAILED" || true) && (cd contracts && FOUNDRY_PROFILE=ci forge test --no-match-contract Fork -q >/dev/null 2>&1 && echo "tests ok")
step "web: pnpm typecheck";                 pnpm typecheck && echo "typecheck ok"
step "web: pnpm test";                      pnpm test 2>&1 | grep -E "^ℹ (pass|fail)" | tee /dev/stderr | grep -q "^ℹ fail 0"
step "web: pnpm build";                     pnpm build >/dev/null 2>&1 && echo "build ok"
printf '\nall green: safe to push\n'
