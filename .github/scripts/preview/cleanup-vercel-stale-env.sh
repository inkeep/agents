#!/usr/bin/env bash
# Removes all branch-scoped preview env vars from Vercel projects.
# Safe to run at any time — open PRs will re-create their env vars on the next push.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  VERCEL_TOKEN \
  VERCEL_ORG_ID \
  VERCEL_API_PROJECT_ID \
  VERCEL_MANAGE_UI_PROJECT_ID

DRY_RUN="${DRY_RUN:-false}"

delete_all_branch_scoped_env_vars() {
  local project_id="$1"
  local envs_json=""
  local entries=""
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

  entries="$(printf '%s' "${envs_json}" | jq -c \
    '[.envs[] | select(.gitBranch != null and .gitBranch != "") | {id, key, gitBranch}]')"

  count="$(printf '%s' "${entries}" | jq 'length')"
  if [ "${count}" -eq 0 ]; then
    echo "No branch-scoped env vars found for project ${project_id}."
    return 0
  fi

  local branches=""
  branches="$(printf '%s' "${entries}" | jq -r '[.[].gitBranch] | unique | .[]')"
  local branch_count=""
  branch_count="$(printf '%s' "${branches}" | grep -c . || true)"

  echo "Found ${count} branch-scoped env var(s) across ${branch_count} branch(es) for project ${project_id}:"
  printf '%s\n' "${branches}" | sed 's/^/  - /'

  if [ "${DRY_RUN}" = "true" ]; then
    echo "[DRY RUN] Would delete ${count} env var(s). Set DRY_RUN=false to execute."
    return 0
  fi

  local deleted=0
  local failed=0
  local env_id=""
  local env_key=""
  local env_branch=""

  for row in $(printf '%s' "${entries}" | jq -r '.[] | @base64'); do
    env_id="$(printf '%s' "${row}" | base64 -d | jq -r '.id')"
    env_key="$(printf '%s' "${row}" | base64 -d | jq -r '.key')"
    env_branch="$(printf '%s' "${row}" | base64 -d | jq -r '.gitBranch')"

    if curl --fail-with-body -sS \
      --connect-timeout 10 \
      --max-time 60 \
      -X DELETE \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      "https://api.vercel.com/v10/projects/${project_id}/env/${env_id}?teamId=${VERCEL_ORG_ID}" \
      >/dev/null 2>&1; then
      deleted=$((deleted + 1))
    else
      echo "  Warning: failed to delete ${env_key} (branch: ${env_branch})" >&2
      failed=$((failed + 1))
    fi
  done

  echo "Deleted ${deleted}/${count} env var(s) for project ${project_id}."
  if [ "${failed}" -gt 0 ]; then
    echo "  ${failed} deletion(s) failed." >&2
  fi
}

echo "=== Manage UI project ==="
delete_all_branch_scoped_env_vars "${VERCEL_MANAGE_UI_PROJECT_ID}"

echo ""
echo "=== API project ==="
delete_all_branch_scoped_env_vars "${VERCEL_API_PROJECT_ID}"
