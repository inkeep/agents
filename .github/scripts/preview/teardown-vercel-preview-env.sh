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
  PR_BRANCH

if ! [[ "${PR_BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Invalid PR branch value: ${PR_BRANCH}"
  exit 1
fi

delete_branch_env_vars() {
  local project_id="$1"
  local branch="$2"
  local envs_json=""
  local ids=""
  local count=""

  if ! envs_json="$(
    curl --fail-with-body -sS \
      --connect-timeout 10 \
      --max-time 60 \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      "https://api.vercel.com/v10/projects/${project_id}/env?teamId=${VERCEL_ORG_ID}" \
      2>&1
  )"; then
    echo "Failed to list env vars for project ${project_id}." >&2
    printf '%s\n' "${envs_json}" >&2
    return 1
  fi

  ids="$(printf '%s' "${envs_json}" | jq -r --arg branch "${branch}" \
    '[.envs[] | select(.gitBranch == $branch) | .id] | .[]')"

  count="$(printf '%s' "${ids}" | grep -c . || true)"
  if [ "${count}" -eq 0 ]; then
    echo "No branch-scoped env vars found for project ${project_id} branch ${branch}."
    return 0
  fi

  echo "Deleting ${count} env var(s) for project ${project_id} branch ${branch}..."

  local env_id=""
  while IFS= read -r env_id; do
    [ -z "${env_id}" ] && continue
    if ! curl --fail-with-body -sS \
      --connect-timeout 10 \
      --max-time 60 \
      -X DELETE \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      "https://api.vercel.com/v10/projects/${project_id}/env/${env_id}?teamId=${VERCEL_ORG_ID}" \
      >/dev/null 2>&1; then
      echo "Warning: failed to delete env var ${env_id} for project ${project_id}." >&2
    fi
  done <<< "${ids}"

  echo "Deleted ${count} env var(s) for project ${project_id} branch ${branch}."
}

delete_branch_env_vars "${VERCEL_MANAGE_UI_PROJECT_ID}" "${PR_BRANCH}"
delete_branch_env_vars "${VERCEL_API_PROJECT_ID}" "${PR_BRANCH}"
