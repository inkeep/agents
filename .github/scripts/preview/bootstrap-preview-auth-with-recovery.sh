#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  GITHUB_OUTPUT \
  MANAGE_DB_URL \
  API_URL \
  SPICEDB_PRESHARED_KEY \
  INKEEP_AGENTS_MANAGE_UI_USERNAME \
  INKEEP_AGENTS_MANAGE_UI_PASSWORD \
  BETTER_AUTH_SECRET \
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
  PR_NUMBER

RECREATE_BACKUP_ENV_ID="${RECREATE_BACKUP_ENV_ID:-}"
RECREATE_BACKUP_ENV_NAME="${RECREATE_BACKUP_ENV_NAME:-}"

write_bootstrap_outputs() {
  {
    echo "manage_db_url=${MANAGE_DB_URL}"
    echo "run_db_url=${RUN_DB_URL}"
    echo "spicedb_endpoint=${SPICEDB_ENDPOINT}"
    echo "recreated_preview_env=${PREVIEW_ENV_RECREATED:-false}"
  } >> "${BOOTSTRAP_STEP_OUTPUT_FILE}"
}

bootstrap_failure_requires_recreate() {
  local log_file="$1"

  grep -Eqi \
    '(Railway deployment for .* entered terminal status FAILED|relation ".*" already exists)' \
    "${log_file}"
}

run_bootstrap_once() {
  local log_file="$1"
  local exit_code="0"

  set +e
  bash "${SCRIPT_DIR}/bootstrap-preview-auth.sh" 2>&1 | tee "${log_file}"
  exit_code="${PIPESTATUS[0]}"
  set -e

  return "${exit_code}"
}

load_reprovision_outputs() {
  local outputs_file="$1"
  local line=""
  local key=""
  local value=""

  while IFS= read -r line; do
    [ -z "${line}" ] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in
      manage_db_url) MANAGE_DB_URL="${value}" ;;
      run_db_url) RUN_DB_URL="${value}" ;;
      spicedb_endpoint) SPICEDB_ENDPOINT="${value}" ;;
      recreate_backup_env_id) RECREATE_BACKUP_ENV_ID="${value}" ;;
      recreate_backup_env_name) RECREATE_BACKUP_ENV_NAME="${value}" ;;
    esac
  done < "${outputs_file}"
}

delete_recreate_backup_if_present() {
  if [ -z "${RECREATE_BACKUP_ENV_ID}" ] || [ -z "${RECREATE_BACKUP_ENV_NAME}" ]; then
    return 0
  fi

  preview_log "Deleting recreate backup Railway environment ${RECREATE_BACKUP_ENV_NAME} after successful bootstrap."
  if ! railway_environment_delete_by_id "${RECREATE_BACKUP_ENV_ID}" >/dev/null; then
    preview_log "Failed to delete recreate backup Railway environment ${RECREATE_BACKUP_ENV_NAME}; leaving it in place."
  fi

  RECREATE_BACKUP_ENV_ID=""
  RECREATE_BACKUP_ENV_NAME=""
}

restore_recreate_backup_if_present() {
  local env_name=""
  local current_env_id=""

  if [ -z "${RECREATE_BACKUP_ENV_ID}" ] || [ -z "${RECREATE_BACKUP_ENV_NAME}" ]; then
    return 0
  fi

  env_name="$(pr_env_name "${PR_NUMBER}")"
  current_env_id="$(railway_environment_id "${RAILWAY_PROJECT_ID}" "${env_name}")"
  if [ -n "${current_env_id}" ]; then
    preview_log "Deleting failed replacement Railway environment ${env_name} before restoring ${RECREATE_BACKUP_ENV_NAME}."
    railway_environment_delete_by_id "${current_env_id}" >/dev/null
    railway_wait_for_environment_absent "${RAILWAY_PROJECT_ID}" "${env_name}" 10 2
  fi

  preview_log "Restoring recreate backup ${RECREATE_BACKUP_ENV_NAME} back to ${env_name}."
  railway_environment_rename_by_id "${RECREATE_BACKUP_ENV_ID}" "${env_name}" >/dev/null
  RECREATE_BACKUP_ENV_ID=""
  RECREATE_BACKUP_ENV_NAME=""
}

PREVIEW_ENV_RECREATED="false"
BOOTSTRAP_STEP_OUTPUT_FILE="${GITHUB_OUTPUT}"
initial_log_file="$(mktemp)"
retry_log_file="$(mktemp)"
reprovision_output_file="$(mktemp)"
trap 'rm -f "${initial_log_file}" "${retry_log_file}" "${reprovision_output_file}"' EXIT

if run_bootstrap_once "${initial_log_file}"; then
  delete_recreate_backup_if_present
  write_bootstrap_outputs
  exit 0
fi

if ! bootstrap_failure_requires_recreate "${initial_log_file}"; then
  restore_recreate_backup_if_present
  preview_log "Bootstrap failed with a non-recoverable error. Leaving the current preview environment intact."
  exit 1
fi

preview_log "Detected recoverable preview environment failure for $(pr_env_name "${PR_NUMBER}"); recreating the Railway environment once."
export RECREATE_PREVIEW_ENV="true"
export GITHUB_OUTPUT="${reprovision_output_file}"
bash "${SCRIPT_DIR}/provision-railway.sh"
export GITHUB_OUTPUT="${BOOTSTRAP_STEP_OUTPUT_FILE}"
load_reprovision_outputs "${reprovision_output_file}"
mask_env_vars MANAGE_DB_URL RUN_DB_URL SPICEDB_ENDPOINT
PREVIEW_ENV_RECREATED="true"

preview_log "Retrying preview auth bootstrap after recreating $(pr_env_name "${PR_NUMBER}")."
if ! run_bootstrap_once "${retry_log_file}"; then
  restore_recreate_backup_if_present
  preview_log "Bootstrap still failed after recreating $(pr_env_name "${PR_NUMBER}")."
  exit 1
fi

delete_recreate_backup_if_present

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Preview Bootstrap Recovery"
    echo "- Recreated preview environment after a recoverable bootstrap failure: \`true\`"
  } >> "${GITHUB_STEP_SUMMARY}"
fi

write_bootstrap_outputs
