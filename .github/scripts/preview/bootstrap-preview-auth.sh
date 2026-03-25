#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  API_URL \
  SPICEDB_PRESHARED_KEY \
  INKEEP_AGENTS_MANAGE_UI_USERNAME \
  INKEEP_AGENTS_MANAGE_UI_PASSWORD \
  BETTER_AUTH_SECRET

mask_env_vars RUN_DB_URL SPICEDB_ENDPOINT SPICEDB_PRESHARED_KEY INKEEP_AGENTS_MANAGE_UI_PASSWORD BETTER_AUTH_SECRET

if [ -z "${RUN_DB_URL:-}" ] || [ -z "${SPICEDB_ENDPOINT:-}" ]; then
  require_env_vars \
    RAILWAY_API_TOKEN \
    RAILWAY_PROJECT_ID \
    RAILWAY_OUTPUT_SERVICE \
    RAILWAY_RUN_DB_URL_KEY \
    RAILWAY_SPICEDB_ENDPOINT_KEY \
    PR_NUMBER

  RAILWAY_ENV_NAME="$(pr_env_name "${PR_NUMBER}")"

  railway_link_service "${RAILWAY_PROJECT_ID}" "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_ENV_NAME}"

  if [ -z "${RUN_DB_URL:-}" ]; then
    RUN_DB_URL="$(railway_extract_runtime_var "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_ENV_NAME}" "${RAILWAY_RUN_DB_URL_KEY}")"
  fi

  if [ -z "${SPICEDB_ENDPOINT:-}" ]; then
    SPICEDB_ENDPOINT="$(railway_extract_runtime_var "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_ENV_NAME}" "${RAILWAY_SPICEDB_ENDPOINT_KEY}")"
  fi

  mask_env_vars RUN_DB_URL SPICEDB_ENDPOINT
fi

require_env_vars RUN_DB_URL SPICEDB_ENDPOINT

echo "::group::Wait for SpiceDB endpoint"
wait_for_tcp_endpoint "${SPICEDB_ENDPOINT}" "SpiceDB endpoint"
echo "::endgroup::"

export INKEEP_AGENTS_API_URL="${API_URL}"
export INKEEP_AGENTS_RUN_DATABASE_URL="${RUN_DB_URL}"
export SPICEDB_ENDPOINT
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
