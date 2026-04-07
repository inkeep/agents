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

SPICEDB_TRANSIENT_RETRY_PATTERN='(No connection established|UNAVAILABLE|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|deadline exceeded|Protocol error|transport is closing)'

run_with_transient_spicedb_retry() {
  local label="$1"
  local attempts="$2"
  shift 2

  local attempt=""
  local log_file=""
  local status="0"

  for attempt in $(seq 1 "${attempts}"); do
    preview_log "${label} (attempt ${attempt}/${attempts})."
    log_file="$(mktemp)"

    set +e
    "$@" 2>&1 | tee "${log_file}"
    status="${PIPESTATUS[0]}"
    set -e

    if [ "${status}" = "0" ]; then
      rm -f "${log_file}"
      return 0
    fi

    if [ "${attempt}" -lt "${attempts}" ] && grep -Eqi "${SPICEDB_TRANSIENT_RETRY_PATTERN}" "${log_file}"; then
      preview_log "${label} failed with a transient SpiceDB transport error; retrying."
      rm -f "${log_file}"
      sleep_with_backoff_and_jitter 2 "${attempt}" 10
      continue
    fi

    rm -f "${log_file}"
    return "${status}"
  done

  return 1
}

if [ -z "${RUN_DB_URL:-}" ] || [ -z "${SPICEDB_ENDPOINT:-}" ]; then
  require_env_vars \
    RAILWAY_API_TOKEN \
    RAILWAY_PROJECT_ID \
    RAILWAY_OUTPUT_SERVICE \
    RAILWAY_RUN_DB_URL_KEY \
    RAILWAY_SPICEDB_ENDPOINT_KEY \
    PR_NUMBER

  RAILWAY_ENV_NAME="$(pr_env_name "${PR_NUMBER}")"
  preview_log "Resolving runtime bootstrap values from Railway environment ${RAILWAY_ENV_NAME}."
  RAILWAY_ENV_ID="$(railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 10 2)"
  OUTPUT_SERVICE_ID="$(railway_project_service_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_OUTPUT_SERVICE}")"
  OUTPUT_SERVICE_ENV_JSON="$(
    railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_ID}" "${OUTPUT_SERVICE_ID}"
  )"

  if [ -z "${RUN_DB_URL:-}" ]; then
    RUN_DB_URL="$(jq -r --arg key "${RAILWAY_RUN_DB_URL_KEY}" '.[$key] // empty' <<< "${OUTPUT_SERVICE_ENV_JSON}")"
  fi

  if [ -z "${SPICEDB_ENDPOINT:-}" ]; then
    SPICEDB_ENDPOINT="$(jq -r --arg key "${RAILWAY_SPICEDB_ENDPOINT_KEY}" '.[$key] // empty' <<< "${OUTPUT_SERVICE_ENV_JSON}")"
  fi

  mask_env_vars RUN_DB_URL SPICEDB_ENDPOINT
fi

require_env_vars RUN_DB_URL SPICEDB_ENDPOINT
preview_log "Bootstrapping preview auth for tenant ${TENANT_ID:-default} via ${API_URL}."

export INKEEP_AGENTS_API_URL="${API_URL}"
export INKEEP_AGENTS_RUN_DATABASE_URL="${RUN_DB_URL}"
export SPICEDB_ENDPOINT
export TENANT_ID="${TENANT_ID:-default}"
export SPICEDB_READY_MAX_ATTEMPTS="${SPICEDB_READY_MAX_ATTEMPTS:-20}"
export SPICEDB_READY_INTERVAL_MS="${SPICEDB_READY_INTERVAL_MS:-2000}"

echo "::group::Run preview runtime migrations"
preview_log "Running preview runtime migrations."
pnpm db:run:migrate
echo "::endgroup::"

if [ -n "${RAILWAY_API_TOKEN:-}" ] &&
  [ -n "${RAILWAY_PROJECT_ID:-}" ] &&
  [ -n "${RAILWAY_SPICEDB_SERVICE:-}" ] &&
  [ -n "${PR_NUMBER:-}" ]; then
  echo "::group::Wait for Railway SpiceDB deployment"
  preview_log "Waiting for Railway deployment state for ${RAILWAY_SPICEDB_SERVICE} in $(pr_env_name "${PR_NUMBER}") before probing gRPC readiness."
  railway_wait_for_service_deployment_ready \
    "${RAILWAY_PROJECT_ID}" \
    "$(pr_env_name "${PR_NUMBER}")" \
    "${RAILWAY_SPICEDB_SERVICE}" \
    15 \
    4
  echo "::endgroup::"
fi

echo "::group::Wait for SpiceDB readiness"
preview_log "Running SpiceDB schema readiness probe with max attempts ${SPICEDB_READY_MAX_ATTEMPTS} and interval ${SPICEDB_READY_INTERVAL_MS}ms."
pnpm --filter @inkeep/agents-core exec tsx src/auth/wait-for-spicedb.ts
echo "::endgroup::"

echo "::group::Initialize preview auth"
run_with_transient_spicedb_retry "Initialize preview auth" 2 pnpm db:auth:init
echo "::endgroup::"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Preview Auth Bootstrap"
    echo "- Tenant: \`${TENANT_ID}\`"
    echo "- Admin email: \`${INKEEP_AGENTS_MANAGE_UI_USERNAME}\`"
    echo "- Runtime migrations: \`pnpm db:run:migrate\`"
    echo "- Railway deployment gate: \`${RAILWAY_SPICEDB_SERVICE:-spicedb}\` latest deployment ready"
    echo "- SpiceDB readiness probe: \`tsx src/auth/wait-for-spicedb.ts\`"
    echo "- Auth seed: \`pnpm db:auth:init\`"
  } >> "${GITHUB_STEP_SUMMARY}"
fi
