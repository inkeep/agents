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
RECREATE_PREVIEW_ENV="${RECREATE_PREVIEW_ENV:-false}"

preview_log "Resolving Railway template environment and service IDs for ${RAILWAY_ENV_NAME}."
RAILWAY_TEMPLATE_ENV_ID="$(railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_TEMPLATE_ENVIRONMENT}" 5 1)"
OUTPUT_SERVICE_ID="$(railway_project_service_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_OUTPUT_SERVICE}")"
SPICEDB_SERVICE_ID="$(railway_project_service_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_SPICEDB_SERVICE}")"

if [ -z "${OUTPUT_SERVICE_ID}" ]; then
  echo "Unable to resolve Railway output service ${RAILWAY_OUTPUT_SERVICE} in project ${RAILWAY_PROJECT_ID}." >&2
  exit 1
fi

if [ -z "${SPICEDB_SERVICE_ID}" ]; then
  echo "Unable to resolve Railway SpiceDB service ${RAILWAY_SPICEDB_SERVICE} in project ${RAILWAY_PROJECT_ID}." >&2
  exit 1
fi

create_preview_environment() {
  local max_attempts="${1:-6}"
  local attempt=""
  local error_file=""
  local create_error=""
  local existing_env_id=""

  for attempt in $(seq 1 "${max_attempts}"); do
    preview_log "Creating Railway environment ${RAILWAY_ENV_NAME} from ${RAILWAY_TEMPLATE_ENVIRONMENT} (attempt ${attempt}/${max_attempts})."
    error_file="$(mktemp)"

    if railway_environment_create_from_source \
      "${RAILWAY_PROJECT_ID}" \
      "${RAILWAY_ENV_NAME}" \
      "${RAILWAY_TEMPLATE_ENV_ID}" \
      >/dev/null 2>"${error_file}"; then
      rm -f "${error_file}"
      return 0
    fi

    create_error="$(cat "${error_file}")"
    rm -f "${error_file}"

    existing_env_id="$(railway_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}")"
    if [ -n "${existing_env_id}" ]; then
      preview_log "Railway create returned an error, but ${RAILWAY_ENV_NAME} now exists with ID ${existing_env_id}; continuing."
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ] && printf '%s' "${create_error}" | grep -qi 'already exists'; then
      preview_log "Railway still reports ${RAILWAY_ENV_NAME} exists after delete; waiting before retrying create."
      railway_wait_for_environment_absent "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 5 2 || true
      sleep_with_backoff_and_jitter 2 "${attempt}" 10
      continue
    fi

    echo "${create_error:-Failed to create Railway environment ${RAILWAY_ENV_NAME}.}" >&2
    return 1
  done

  echo "Failed to create Railway environment ${RAILWAY_ENV_NAME} after ${max_attempts} attempts." >&2
  return 1
}

transactional_recreate_environment() {
  local existing_env_id="$1"
  local parked_name="${RAILWAY_ENV_NAME}-parked-$(date +%s)"

  preview_log "Transactional recreate: renaming ${RAILWAY_ENV_NAME} to ${parked_name}."
  if ! railway_environment_rename "${existing_env_id}" "${parked_name}" >/dev/null; then
    echo "Failed to rename ${RAILWAY_ENV_NAME}; aborting recreate." >&2
    return 1
  fi

  railway_wait_for_environment_absent "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 10 2 || true

  preview_log "Transactional recreate: creating fresh ${RAILWAY_ENV_NAME} from ${RAILWAY_TEMPLATE_ENVIRONMENT}."
  if create_preview_environment && \
     railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 20 4 >/dev/null; then
    preview_log "Fresh ${RAILWAY_ENV_NAME} is live; deleting parked ${parked_name}."
    railway_environment_delete_by_id "${existing_env_id}" >/dev/null 2>&1 || \
      preview_log "Warning: failed to delete ${parked_name}; janitor will clean it up."
    return 0
  fi

  preview_log "Transactional recreate FAILED. Rolling back."
  local partial_env_id=""
  partial_env_id="$(railway_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}")"
  if [ -n "${partial_env_id}" ] && [ "${partial_env_id}" != "${existing_env_id}" ]; then
    railway_environment_delete_by_id "${partial_env_id}" >/dev/null 2>&1 || true
    railway_wait_for_environment_absent "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 10 2 || true
  fi

  if railway_environment_rename "${existing_env_id}" "${RAILWAY_ENV_NAME}" >/dev/null; then
    preview_log "Rollback succeeded: ${parked_name} restored to ${RAILWAY_ENV_NAME}."
    return 0
  fi

  echo "CRITICAL: recreate failed and rollback rename failed. Env exists as ${parked_name}. Manual intervention required." >&2
  return 1
}

ENV_EXISTS="$(railway_env_exists_count "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}")"

if [ "${RECREATE_PREVIEW_ENV}" = "true" ] && [ "${ENV_EXISTS}" != "0" ]; then
  preview_log "Recreate requested for ${RAILWAY_ENV_NAME}; using transactional rename-park-create."
  EXISTING_ENV_ID="$(railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 10 2)"
  if transactional_recreate_environment "${EXISTING_ENV_ID}"; then
    ENV_EXISTS="$(railway_env_exists_count "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}")"
  else
    echo "Transactional recreate of ${RAILWAY_ENV_NAME} failed." >&2
    exit 1
  fi
fi

if [ "${ENV_EXISTS}" = "0" ]; then
  if ! create_preview_environment; then
    if ! railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 20 4 >/dev/null; then
      echo "Failed to create Railway environment ${RAILWAY_ENV_NAME}."
      exit 1
    fi
  fi
else
  preview_log "Railway environment ${RAILWAY_ENV_NAME} already exists."
fi

preview_log "Resolving Railway environment ID for ${RAILWAY_ENV_NAME}."
RAILWAY_ENV_ID="$(railway_wait_for_environment_id "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" 20 4)"

preview_log "Ensuring Railway TCP proxies are ACTIVE for ${RAILWAY_ENV_NAME}."
railway_ensure_tcp_proxy "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" "${RAILWAY_MANAGE_DB_SERVICE}" "${RAILWAY_MANAGE_DB_TCP_PORT}"
railway_ensure_tcp_proxy "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" "${RAILWAY_RUN_DB_SERVICE}" "${RAILWAY_RUN_DB_TCP_PORT}"
railway_ensure_tcp_proxy "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" "${RAILWAY_SPICEDB_SERVICE}" "${RAILWAY_SPICEDB_TCP_PORT}"

preview_log "Loading Railway service variables for ${RAILWAY_ENV_NAME}."
TEMPLATE_SERVICE_ENV_JSON="$(
  railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_TEMPLATE_ENV_ID}" "${OUTPUT_SERVICE_ID}" true
)"

SERVICE_ENV_JSON="$(
  railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_ID}" "${OUTPUT_SERVICE_ID}" true
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
    railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_ID}" "${SPICEDB_SERVICE_ID}" true
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
    railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_ID}" "${OUTPUT_SERVICE_ID}" true
  )"
}

runtime_var_is_unresolved() {
  local value="${1:-}"

  [ -z "${value}" ] || printf '%s' "${value}" | grep -q '\$[{][{]'
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

  railway_variable_collection_upsert \
    "${RAILWAY_PROJECT_ID}" \
    "${RAILWAY_ENV_ID}" \
    "${OUTPUT_SERVICE_ID}" \
    true \
    "$(jq -nc --arg key "${key}" --arg value "${seed_value}" '{($key): $value}')" >/dev/null

  if [ -n "${existing}" ]; then
    action="Updated"
  fi

  echo "${action} ${key} in ${RAILWAY_ENV_NAME} from ${source_label}."
  refresh_service_env_dump
}

resolve_runtime_vars() {
  local max_attempts="${1:-20}"
  local sleep_seconds="${2:-4}"
  local attempt=""
  local key=""
  local value=""
  local rendered_service_env_json=""
  local manage_db_url=""
  local run_db_url=""
  local spicedb_endpoint=""
  local unresolved=()

  for attempt in $(seq 1 "${max_attempts}"); do
    rendered_service_env_json="$(
      railway_variables_json "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_ID}" "${OUTPUT_SERVICE_ID}"
    )"
    manage_db_url="$(json_get_var "${rendered_service_env_json}" "${RAILWAY_MANAGE_DB_URL_KEY}")"
    run_db_url="$(json_get_var "${rendered_service_env_json}" "${RAILWAY_RUN_DB_URL_KEY}")"
    spicedb_endpoint="$(json_get_var "${rendered_service_env_json}" "${RAILWAY_SPICEDB_ENDPOINT_KEY}")"

    if ! runtime_var_is_unresolved "${manage_db_url}" &&
      ! runtime_var_is_unresolved "${run_db_url}" &&
      ! runtime_var_is_unresolved "${spicedb_endpoint}"; then
      MANAGE_DB_URL="${manage_db_url}"
      RUN_DB_URL="${run_db_url}"
      SPICEDB_ENDPOINT="${spicedb_endpoint}"
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      if preview_should_log_wait_attempt "${attempt}" "${max_attempts}"; then
        unresolved=()
        if runtime_var_is_unresolved "${manage_db_url}"; then
          unresolved+=("${RAILWAY_MANAGE_DB_URL_KEY}")
        fi
        if runtime_var_is_unresolved "${run_db_url}"; then
          unresolved+=("${RAILWAY_RUN_DB_URL_KEY}")
        fi
        if runtime_var_is_unresolved "${spicedb_endpoint}"; then
          unresolved+=("${RAILWAY_SPICEDB_ENDPOINT_KEY}")
        fi
        preview_log "Waiting for Railway runtime variable interpolation in ${RAILWAY_ENV_NAME} (attempt ${attempt}/${max_attempts}): ${unresolved[*]}"
      fi
      sleep_with_jitter "${sleep_seconds}"
      refresh_service_env_dump
    fi
  done

  for key in \
    "${RAILWAY_MANAGE_DB_URL_KEY}" \
    "${RAILWAY_RUN_DB_URL_KEY}" \
    "${RAILWAY_SPICEDB_ENDPOINT_KEY}"; do
    value="$(json_get_var "${rendered_service_env_json}" "${key}")"
    if [ -z "${value}" ]; then
      echo "Missing runtime variable ${key} in Railway service ${RAILWAY_OUTPUT_SERVICE} for env ${RAILWAY_ENV_NAME}." >&2
    else
      echo "Runtime variable ${key} is unresolved (${value}) after waiting for Railway interpolation." >&2
    fi
  done
  exit 1
}

refresh_service_env_dump

DEFAULT_SPICEDB_ENDPOINT_TEMPLATE="\${{${RAILWAY_SPICEDB_SERVICE}.RAILWAY_TCP_PROXY_DOMAIN}}:\${{${RAILWAY_SPICEDB_SERVICE}.RAILWAY_TCP_PROXY_PORT}}"

preview_log "Ensuring required runtime variables are seeded for ${RAILWAY_ENV_NAME}."
ensure_runtime_var_seeded "${RAILWAY_MANAGE_DB_URL_KEY}" "${RAILWAY_MANAGE_DB_URL_TEMPLATE:-}"
ensure_runtime_var_seeded "${RAILWAY_RUN_DB_URL_KEY}" "${RAILWAY_RUN_DB_URL_TEMPLATE:-}"
ensure_runtime_var_seeded "${RAILWAY_SPICEDB_ENDPOINT_KEY}" "${RAILWAY_SPICEDB_ENDPOINT_TEMPLATE:-${DEFAULT_SPICEDB_ENDPOINT_TEMPLATE}}"

preview_log "Resolving rendered runtime variables for ${RAILWAY_ENV_NAME}."
resolve_runtime_vars

mask_env_vars MANAGE_DB_URL RUN_DB_URL SPICEDB_ENDPOINT SPICEDB_PRESHARED_KEY

preview_log "Validating SpiceDB preshared key for ${RAILWAY_ENV_NAME}."
validate_spicedb_preshared_key

echo "manage_db_url=${MANAGE_DB_URL}" >> "${GITHUB_OUTPUT}"
echo "run_db_url=${RUN_DB_URL}" >> "${GITHUB_OUTPUT}"
echo "spicedb_endpoint=${SPICEDB_ENDPOINT}" >> "${GITHUB_OUTPUT}"

{
  echo "## Tier 1 Provisioning"
  echo "- Railway environment: \`${RAILWAY_ENV_NAME}\`"
  echo "- Template environment: \`${RAILWAY_TEMPLATE_ENVIRONMENT}\`"
  echo "- Manual recreate requested: \`${RECREATE_PREVIEW_ENV}\`"
  echo "- Runtime variable source service: \`${RAILWAY_OUTPUT_SERVICE}\`"
  echo "- Manage DB TCP proxy ready: ✅"
  echo "- Run DB TCP proxy ready: ✅"
  echo "- SpiceDB TCP proxy ready: ✅"
  echo "- Resolved manage DB URL: ✅"
  echo "- Resolved run DB URL: ✅"
  echo "- Resolved SpiceDB endpoint: ✅"
  echo "- Preview SpiceDB auth key matches GitHub secret: ✅"
} >> "${GITHUB_STEP_SUMMARY}"
