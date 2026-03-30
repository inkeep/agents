#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  RAILWAY_API_TOKEN \
  RAILWAY_PROJECT_ID \
  RAILWAY_TEMPLATE_ENVIRONMENT \
  RAILWAY_OUTPUT_SERVICE \
  RAILWAY_MANAGE_DB_SERVICE \
  RAILWAY_RUN_DB_SERVICE \
  RAILWAY_MANAGE_DB_TCP_PORT \
  RAILWAY_RUN_DB_TCP_PORT \
  RAILWAY_SPICEDB_SERVICE \
  RAILWAY_SPICEDB_TCP_PORT \
  RAILWAY_SPICEDB_PRESHARED_KEY_KEY \
  RAILWAY_MANAGE_DB_URL_KEY \
  RAILWAY_RUN_DB_URL_KEY \
  RAILWAY_SPICEDB_ENDPOINT_KEY \
  SPICEDB_PRESHARED_KEY \
  PR_NUMBER \
  GITHUB_OUTPUT \
  GITHUB_STEP_SUMMARY

RAILWAY_ENV_NAME="$(pr_env_name "${PR_NUMBER}")"

railway_link_service "${RAILWAY_PROJECT_ID}" "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_TEMPLATE_ENVIRONMENT}"

ENV_EXISTS="$(railway_env_exists_count "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}")"

if [ "${ENV_EXISTS}" = "0" ]; then
  if ! railway_cli_with_retry railway environment new "${RAILWAY_ENV_NAME}" \
    --copy "${RAILWAY_TEMPLATE_ENVIRONMENT}"; then
    echo "Initial create attempt failed; re-checking whether ${RAILWAY_ENV_NAME} now exists."
    if ! railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 30 2 >/dev/null; then
      echo "Failed to create Railway environment ${RAILWAY_ENV_NAME}."
      exit 1
    fi
  fi
else
  echo "Railway environment ${RAILWAY_ENV_NAME} already exists"
fi

railway_ensure_tcp_proxy "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" "${RAILWAY_MANAGE_DB_SERVICE}" "${RAILWAY_MANAGE_DB_TCP_PORT}"
railway_ensure_tcp_proxy "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" "${RAILWAY_RUN_DB_SERVICE}" "${RAILWAY_RUN_DB_TCP_PORT}"
railway_ensure_tcp_proxy "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" "${RAILWAY_SPICEDB_SERVICE}" "${RAILWAY_SPICEDB_TCP_PORT}"

TEMPLATE_SERVICE_ENV_JSON="$(
  railway_variable_list_json "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_TEMPLATE_ENVIRONMENT}"
)"

SERVICE_ENV_JSON="$(
  railway_variable_list_json "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_ENV_NAME}"
)"

json_get_var() {
  local json="$1"
  local key="$2"

  jq -r --arg key "${key}" '.[$key] // empty' <<< "${json}"
}

validate_spicedb_preshared_key() {
  local spicedb_service_env_json=""
  local current_value=""

  spicedb_service_env_json="$(
    railway_variable_list_json "${RAILWAY_SPICEDB_SERVICE}" "${RAILWAY_ENV_NAME}"
  )"
  current_value="$(json_get_var "${spicedb_service_env_json}" "${RAILWAY_SPICEDB_PRESHARED_KEY_KEY}")"

  if [ -z "${current_value}" ]; then
    echo "Missing ${RAILWAY_SPICEDB_PRESHARED_KEY_KEY} on Railway service ${RAILWAY_SPICEDB_SERVICE} in env ${RAILWAY_ENV_NAME}." >&2
    echo "Set the preview SpiceDB key on ${RAILWAY_TEMPLATE_ENVIRONMENT}/${RAILWAY_SPICEDB_SERVICE} before rerunning preview provisioning." >&2
    exit 1
  fi

  if [ "${current_value}" != "${SPICEDB_PRESHARED_KEY}" ]; then
    echo "Railway service ${RAILWAY_SPICEDB_SERVICE} in env ${RAILWAY_ENV_NAME} is not using PREVIEW_SPICEDB_PRESHARED_KEY." >&2
    echo "Update ${RAILWAY_TEMPLATE_ENVIRONMENT}/${RAILWAY_SPICEDB_SERVICE} ${RAILWAY_SPICEDB_PRESHARED_KEY_KEY} to match the GitHub secret and recreate the PR environment." >&2
    exit 1
  fi
}

refresh_service_env_dump() {
  SERVICE_ENV_JSON="$(
    railway_variable_list_json "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_ENV_NAME}"
  )"
  SERVICE_ENV_DUMP="$(jq -r 'to_entries[] | "\(.key)=\(.value)"' <<< "${SERVICE_ENV_JSON}")"
}

ensure_runtime_var_seeded() {
  local key="$1"
  local explicit_template="$2"
  local existing=""
  local seed_value=""
  local source_label=""
  local action="Seeded"

  existing="$(json_get_var "${SERVICE_ENV_JSON}" "${key}")"

  if [ -n "${explicit_template}" ]; then
    if [ "${existing}" = "${explicit_template}" ]; then
      return
    fi
    seed_value="${explicit_template}"
    source_label="repository template override"
  else
    if [ -n "${existing}" ]; then
      return
    fi

    seed_value="$(json_get_var "${TEMPLATE_SERVICE_ENV_JSON}" "${key}")"
    source_label="template environment ${RAILWAY_TEMPLATE_ENVIRONMENT}"
  fi

  if [ -z "${seed_value}" ]; then
    echo "Missing runtime variable ${key} in Railway service ${RAILWAY_OUTPUT_SERVICE} for env ${RAILWAY_ENV_NAME}." >&2
    echo "Set ${key} in ${RAILWAY_TEMPLATE_ENVIRONMENT} or provide an explicit template repo var override for this key." >&2
    exit 1
  fi

  railway_cli_with_retry railway variable set \
    --service "${RAILWAY_OUTPUT_SERVICE}" \
    --environment "${RAILWAY_ENV_NAME}" \
    --skip-deploys \
    "${key}=${seed_value}" >/dev/null

  if [ -n "${existing}" ]; then
    action="Updated"
  fi

  echo "${action} ${key} in ${RAILWAY_ENV_NAME} from ${source_label}."
  refresh_service_env_dump
}

extract_runtime_var() {
  local key="$1"
  local max_attempts="${2:-30}"
  local sleep_seconds="${3:-2}"
  local attempt=""
  local line=""
  local value=""

  for attempt in $(seq 1 "${max_attempts}"); do
    line="$(printf '%s\n' "${SERVICE_ENV_DUMP}" | grep -m1 "^${key}=" || true)"
    if [ -n "${line}" ]; then
      value="${line#*=}"
      if ! printf '%s' "${value}" | grep -q '\$[{][{]'; then
        printf '%s' "${value}"
        return 0
      fi
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep_with_jitter "${sleep_seconds}"
      refresh_service_env_dump
    fi
  done

  if [ -z "${line}" ]; then
    echo "Missing runtime variable ${key} in Railway service ${RAILWAY_OUTPUT_SERVICE} for env ${RAILWAY_ENV_NAME}." >&2
  else
    echo "Runtime variable ${key} is unresolved (${value}) after waiting for Railway interpolation." >&2
  fi
  exit 1
}

refresh_service_env_dump

DEFAULT_SPICEDB_ENDPOINT_TEMPLATE="\${{${RAILWAY_SPICEDB_SERVICE}.RAILWAY_TCP_PROXY_DOMAIN}}:\${{${RAILWAY_SPICEDB_SERVICE}.RAILWAY_TCP_PROXY_PORT}}"

ensure_runtime_var_seeded "${RAILWAY_MANAGE_DB_URL_KEY}" "${RAILWAY_MANAGE_DB_URL_TEMPLATE:-}"
ensure_runtime_var_seeded "${RAILWAY_RUN_DB_URL_KEY}" "${RAILWAY_RUN_DB_URL_TEMPLATE:-}"
ensure_runtime_var_seeded "${RAILWAY_SPICEDB_ENDPOINT_KEY}" "${RAILWAY_SPICEDB_ENDPOINT_TEMPLATE:-${DEFAULT_SPICEDB_ENDPOINT_TEMPLATE}}"

MANAGE_DB_URL="$(extract_runtime_var "${RAILWAY_MANAGE_DB_URL_KEY}")"
RUN_DB_URL="$(extract_runtime_var "${RAILWAY_RUN_DB_URL_KEY}")"
SPICEDB_ENDPOINT="$(extract_runtime_var "${RAILWAY_SPICEDB_ENDPOINT_KEY}")"

mask_env_vars MANAGE_DB_URL RUN_DB_URL SPICEDB_ENDPOINT SPICEDB_PRESHARED_KEY

validate_spicedb_preshared_key

echo "manage_db_url=${MANAGE_DB_URL}" >> "${GITHUB_OUTPUT}"
echo "run_db_url=${RUN_DB_URL}" >> "${GITHUB_OUTPUT}"
echo "spicedb_endpoint=${SPICEDB_ENDPOINT}" >> "${GITHUB_OUTPUT}"

{
  echo "## Tier 1 Provisioning"
  echo "- Railway environment: \`${RAILWAY_ENV_NAME}\`"
  echo "- Template environment: \`${RAILWAY_TEMPLATE_ENVIRONMENT}\`"
  echo "- Runtime variable source service: \`${RAILWAY_OUTPUT_SERVICE}\`"
  echo "- Manage DB TCP proxy ready: ✅"
  echo "- Run DB TCP proxy ready: ✅"
  echo "- SpiceDB TCP proxy ready: ✅"
  echo "- Resolved manage DB URL: ✅"
  echo "- Resolved run DB URL: ✅"
  echo "- Resolved SpiceDB endpoint: ✅"
  echo "- Preview SpiceDB auth key matches GitHub secret: ✅"
} >> "${GITHUB_STEP_SUMMARY}"
