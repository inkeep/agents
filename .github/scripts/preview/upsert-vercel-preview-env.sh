#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  VERCEL_TOKEN \
  VERCEL_ORG_ID \
  VERCEL_API_PROJECT_ID \
  VERCEL_MANAGE_UI_PROJECT_ID \
  ANTHROPIC_API_KEY \
  BETTER_AUTH_SECRET \
  SPICEDB_PRESHARED_KEY \
  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET \
  PR_BRANCH \
  API_URL \
  UI_URL

if ! [[ "${PR_BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Invalid PR branch value: ${PR_BRANCH}"
  exit 1
fi

mask_env_vars ANTHROPIC_API_KEY BETTER_AUTH_SECRET SPICEDB_PRESHARED_KEY INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET MANAGE_DB_URL RUN_DB_URL SPICEDB_ENDPOINT

if [ -z "${MANAGE_DB_URL:-}" ] || [ -z "${RUN_DB_URL:-}" ] || [ -z "${SPICEDB_ENDPOINT:-}" ]; then
  require_env_vars \
    RAILWAY_API_TOKEN \
    RAILWAY_PROJECT_ID \
    RAILWAY_OUTPUT_SERVICE \
    RAILWAY_MANAGE_DB_URL_KEY \
    RAILWAY_RUN_DB_URL_KEY \
    RAILWAY_SPICEDB_ENDPOINT_KEY \
    PR_NUMBER

  RAILWAY_ENV_NAME="$(pr_env_name "${PR_NUMBER}")"
  RAILWAY_ENV_ID="$(railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 10 2)"
  OUTPUT_SERVICE_ID="$(railway_project_service_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_OUTPUT_SERVICE}")"
  OUTPUT_SERVICE_ENV_JSON="$(
    railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_ID}" "${OUTPUT_SERVICE_ID}"
  )"

  if [ -z "${MANAGE_DB_URL:-}" ]; then
    MANAGE_DB_URL="$(jq -r --arg key "${RAILWAY_MANAGE_DB_URL_KEY}" '.[$key] // empty' <<< "${OUTPUT_SERVICE_ENV_JSON}")"
  fi
  if [ -z "${RUN_DB_URL:-}" ]; then
    RUN_DB_URL="$(jq -r --arg key "${RAILWAY_RUN_DB_URL_KEY}" '.[$key] // empty' <<< "${OUTPUT_SERVICE_ENV_JSON}")"
  fi
  if [ -z "${SPICEDB_ENDPOINT:-}" ]; then
    SPICEDB_ENDPOINT="$(jq -r --arg key "${RAILWAY_SPICEDB_ENDPOINT_KEY}" '.[$key] // empty' <<< "${OUTPUT_SERVICE_ENV_JSON}")"
  fi

  mask_env_vars MANAGE_DB_URL RUN_DB_URL SPICEDB_ENDPOINT
fi

require_env_vars MANAGE_DB_URL RUN_DB_URL SPICEDB_ENDPOINT

upsert_env() {
  local project_id="$1"
  local key="$2"
  local value="$3"
  local payload=""
  local response=""

  payload="$(jq -n \
    --arg key "${key}" \
    --arg value "${value}" \
    --arg branch "${PR_BRANCH}" \
    '{key:$key, value:$value, type:"encrypted", target:["preview"], gitBranch:$branch}')"

  if ! response="$(
    curl --fail-with-body -sS \
      --connect-timeout 10 \
      --max-time 60 \
      -X POST \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      "https://api.vercel.com/v10/projects/${project_id}/env?upsert=true&teamId=${VERCEL_ORG_ID}" \
      --data "${payload}" \
      2>&1
  )"; then
    echo "Failed to upsert env var ${key} for project ${project_id}." >&2
    printf '%s\n' "${response}" >&2
    return 1
  fi
}

upsert_env "${VERCEL_MANAGE_UI_PROJECT_ID}" "INKEEP_AGENTS_API_URL" "${API_URL}"
upsert_env "${VERCEL_MANAGE_UI_PROJECT_ID}" "PUBLIC_INKEEP_AGENTS_API_URL" "${API_URL}"
upsert_env "${VERCEL_MANAGE_UI_PROJECT_ID}" "NEXT_PUBLIC_INKEEP_AGENTS_API_URL" "${API_URL}"
upsert_env "${VERCEL_MANAGE_UI_PROJECT_ID}" "INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET" "${INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET}"

upsert_env "${VERCEL_API_PROJECT_ID}" "INKEEP_AGENTS_API_URL" "${API_URL}"
upsert_env "${VERCEL_API_PROJECT_ID}" "INKEEP_AGENTS_MANAGE_UI_URL" "${UI_URL}"
upsert_env "${VERCEL_API_PROJECT_ID}" "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY}"
upsert_env "${VERCEL_API_PROJECT_ID}" "NODE_ENV" "production"
upsert_env "${VERCEL_API_PROJECT_ID}" "ENVIRONMENT" "production"
upsert_env "${VERCEL_API_PROJECT_ID}" "LOG_LEVEL" "info"
upsert_env "${VERCEL_API_PROJECT_ID}" "INKEEP_AGENTS_MANAGE_DATABASE_URL" "${MANAGE_DB_URL}"
upsert_env "${VERCEL_API_PROJECT_ID}" "INKEEP_AGENTS_RUN_DATABASE_URL" "${RUN_DB_URL}"
upsert_env "${VERCEL_API_PROJECT_ID}" "SPICEDB_ENDPOINT" "${SPICEDB_ENDPOINT}"
upsert_env "${VERCEL_API_PROJECT_ID}" "SPICEDB_TLS_ENABLED" "false"
upsert_env "${VERCEL_API_PROJECT_ID}" "BETTER_AUTH_SECRET" "${BETTER_AUTH_SECRET}"
upsert_env "${VERCEL_API_PROJECT_ID}" "SPICEDB_PRESHARED_KEY" "${SPICEDB_PRESHARED_KEY}"
upsert_env "${VERCEL_API_PROJECT_ID}" "INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET" "${INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET}"
