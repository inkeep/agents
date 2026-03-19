#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  API_URL \
  RUN_DB_URL \
  SPICEDB_ENDPOINT \
  SPICEDB_PRESHARED_KEY \
  INKEEP_AGENTS_MANAGE_UI_USERNAME \
  INKEEP_AGENTS_MANAGE_UI_PASSWORD \
  BETTER_AUTH_SECRET

mask_env_vars RUN_DB_URL SPICEDB_PRESHARED_KEY INKEEP_AGENTS_MANAGE_UI_PASSWORD BETTER_AUTH_SECRET

export INKEEP_AGENTS_API_URL="${API_URL}"
export INKEEP_AGENTS_RUN_DATABASE_URL="${RUN_DB_URL}"
export TENANT_ID="${TENANT_ID:-default}"

echo "::group::Run preview runtime migrations"
pnpm db:run:migrate
echo "::endgroup::"

echo "::group::Initialize preview auth"
pnpm db:auth:init
echo "::endgroup::"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Preview Auth Bootstrap"
    echo "- Tenant: \`${TENANT_ID}\`"
    echo "- Admin email: \`${INKEEP_AGENTS_MANAGE_UI_USERNAME}\`"
    echo "- Runtime migrations: \`pnpm db:run:migrate\`"
    echo "- Auth seed: \`pnpm db:auth:init\`"
  } >> "${GITHUB_STEP_SUMMARY}"
fi
