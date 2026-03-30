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
  PR_NUMBER \
  GITHUB_STEP_SUMMARY

RAILWAY_ENV_NAME="$(pr_env_name "${PR_NUMBER}")"

railway_link_service "${RAILWAY_PROJECT_ID}" "${RAILWAY_OUTPUT_SERVICE}" "${RAILWAY_TEMPLATE_ENVIRONMENT}"

ENV_EXISTS="$(railway_env_exists_count "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}")"
if [ "${ENV_EXISTS}" = "0" ]; then
  echo "Railway environment ${RAILWAY_ENV_NAME} does not exist; nothing to teardown."
  exit 0
fi

if ! railway_cli_with_retry railway environment delete "${RAILWAY_ENV_NAME}" --yes; then
  echo "Failed to delete Railway environment ${RAILWAY_ENV_NAME}." >&2
  exit 1
fi

POST_EXISTS="1"
for attempt in $(seq 1 10); do
  POST_EXISTS="$(railway_env_exists_count "${RAILWAY_PROJECT_ID}" "${RAILWAY_ENV_NAME}" /tmp/railway-projects-post.json)"
  if [ "${POST_EXISTS}" = "0" ]; then
    break
  fi

  if [ "${attempt}" -lt 10 ]; then
    sleep 2
  fi
done

if [ "${POST_EXISTS}" != "0" ]; then
  echo "Railway environment ${RAILWAY_ENV_NAME} still exists after teardown." >&2
  exit 1
fi

{
  echo "## Tier 1 Teardown"
  echo "- Railway environment: \`${RAILWAY_ENV_NAME}\`"
  echo "- Status: deleted"
} >> "${GITHUB_STEP_SUMMARY}"
