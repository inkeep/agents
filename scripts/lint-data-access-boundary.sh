#!/usr/bin/env bash
# Enforce DAL boundary: drizzle-orm operator imports (eq, and, or, sql, etc.)
# should only appear inside allowed directories.
#
# Allowed locations:
#   - **/data-access/**    (DAL layer)
#   - **/db/**             (schema definitions, migrations, clients)
#   - **/dolt/**           (Dolt-specific utilities)
#   - **/validation/**     (Drizzle schema helpers for Zod)
#   - **/*-schema*         (schema files)
#   - **/branchScopedDb*   (infrastructure — DB client creation)
#
# This script is run as part of `pnpm check` to enforce the boundary in CI.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

violations=$(
  grep -rn "from 'drizzle-orm" \
    "$REPO_ROOT/packages" \
    "$REPO_ROOT/agents-api" \
    --include='*.ts' --include='*.tsx' \
    | grep -v '/data-access/' \
    | grep -v '/db/' \
    | grep -v '/dolt/' \
    | grep -v '/validation/' \
    | grep -v '/retry/' \
    | grep -v -- '-schema' \
    | grep -v 'branchScopedDb' \
    | grep -v 'node_modules' \
    | grep -v '__snapshots__' \
    | grep -v '__tests__' \
    | grep -v '.d.ts' \
    | grep -v ':\s*//' \
    || true
)

if [ -n "$violations" ]; then
  echo "❌ DAL boundary violation: drizzle-orm imports found outside allowed directories."
  echo ""
  echo "Move database queries to packages/agents-core/src/data-access/ and import from there."
  echo ""
  echo "Violations:"
  echo "$violations"
  exit 1
fi

echo "✅ DAL boundary check passed"
