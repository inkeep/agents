#!/usr/bin/env bash
#
# Stale Vercel preview env cleanup.
#
# This script is safe to run manually or from a scheduled janitor workflow.
# It removes branch-scoped preview-only env vars for branches that no longer
# have an open PR, which repairs missed close events and prevents preview env
# storage from filling up again.
#
# Usage:
#   # Dry run (preview what would be deleted)
#   DRY_RUN=true VERCEL_ORG_ID=inkeep VERCEL_API_PROJECT_ID=agents-api \
#     VERCEL_MANAGE_UI_PROJECT_ID=agents-manage-ui bash cleanup-vercel-stale-env.sh
#
#   # Execute
#   VERCEL_ORG_ID=inkeep VERCEL_API_PROJECT_ID=agents-api \
#     VERCEL_MANAGE_UI_PROJECT_ID=agents-manage-ui bash cleanup-vercel-stale-env.sh
#
# Auto-detects VERCEL_TOKEN from local Vercel CLI auth if not set.
# Requires `gh` CLI authenticated with repo read access.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

if [ -z "${VERCEL_TOKEN:-}" ]; then
  VERCEL_AUTH_FILE="${HOME}/Library/Application Support/com.vercel.cli/auth.json"
  if [ ! -f "${VERCEL_AUTH_FILE}" ]; then
    VERCEL_AUTH_FILE="${HOME}/.local/share/com.vercel.cli/auth.json"
  fi
  if [ -f "${VERCEL_AUTH_FILE}" ]; then
    VERCEL_TOKEN="$(jq -r '.token // empty' "${VERCEL_AUTH_FILE}")"
    if [ -n "${VERCEL_TOKEN}" ]; then
      echo "Using VERCEL_TOKEN from local Vercel CLI auth."
    fi
  fi
fi

require_env_vars \
  VERCEL_TOKEN \
  VERCEL_ORG_ID \
  VERCEL_API_PROJECT_ID \
  VERCEL_MANAGE_UI_PROJECT_ID

DRY_RUN="${DRY_RUN:-false}"
MAX_RETRIES="${MAX_RETRIES:-3}"

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI is required. Install from https://cli.github.com" >&2
  exit 1
fi

branch_has_open_pr() {
  local branch="$1"
  local count=""
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then
    count="$(gh pr list --repo "${GITHUB_REPOSITORY}" --head "${branch}" --state open --json number --jq 'length' 2>/dev/null || echo "0")"
  else
    count="$(gh pr list --head "${branch}" --state open --json number --jq 'length' 2>/dev/null || echo "0")"
  fi
  [ "${count}" -gt 0 ]
}

delete_env_var_with_retry() {
  local project_id="$1"
  local env_id="$2"
  local attempt=""
  local response=""
  local http_code=""

  for attempt in $(seq 1 "${MAX_RETRIES}"); do
    http_code="$(curl -sS -o /dev/null -w '%{http_code}' \
      --connect-timeout 10 \
      --max-time 60 \
      -X DELETE \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      "https://api.vercel.com/v10/projects/${project_id}/env/${env_id}?teamId=${VERCEL_ORG_ID}" \
      2>/dev/null)" || http_code="000"

    case "${http_code}" in
      200|204)
        return 0
        ;;
      429)
        if [ "${attempt}" -lt "${MAX_RETRIES}" ]; then
          local backoff=$(( attempt * 2 ))
          echo "  Rate limited, waiting ${backoff}s before retry ${attempt}/${MAX_RETRIES}..." >&2
          sleep "${backoff}"
          continue
        fi
        ;;
      *)
        if [ "${attempt}" -lt "${MAX_RETRIES}" ]; then
          sleep 1
          continue
        fi
        ;;
    esac
  done
  return 1
}

delete_stale_branch_env_vars() {
  local project_id="$1"
  local envs_json=""
  local entries=""
  local count=""

  if ! envs_json="$(vercel_list_preview_only_env_vars "${project_id}")"; then
    return 1
  fi

  entries="$(printf '%s' "${envs_json}" | jq -c \
    '[.envs[] | select(.gitBranch != null and .gitBranch != "" and (.target | sort) == ["preview"]) | {id, key, gitBranch}]')"

  count="$(printf '%s' "${entries}" | jq 'length')"
  if [ "${count}" -eq 0 ]; then
    echo "No branch-scoped preview env vars found for project ${project_id}."
    return 0
  fi

  local branches=""
  branches="$(printf '%s' "${entries}" | jq -r '[.[].gitBranch] | unique | .[]')"
  local branch_count=""
  branch_count="$(printf '%s' "${branches}" | grep -c . || true)"

  echo "Found ${count} branch-scoped env var(s) across ${branch_count} branch(es) for project ${project_id}."
  echo "Checking each branch for open PRs..."

  local stale_branches=()
  local open_branches=()
  local branch=""
  while IFS= read -r branch; do
    [ -z "${branch}" ] && continue
    if branch_has_open_pr "${branch}"; then
      open_branches+=("${branch}")
    else
      stale_branches+=("${branch}")
    fi
  done <<< "${branches}"

  if [ "${#open_branches[@]}" -gt 0 ]; then
    echo "Skipping ${#open_branches[@]} branch(es) with open PRs:"
    printf '  - %s\n' "${open_branches[@]}"
  fi

  if [ "${#stale_branches[@]}" -eq 0 ]; then
    echo "No stale branches found — all branch-scoped env vars belong to open PRs."
    return 0
  fi

  local stale_entries=""
  stale_entries="$(printf '%s' "${entries}" | jq -c \
    --argjson stale "$(printf '%s\n' "${stale_branches[@]}" | jq -R . | jq -sc .)" \
    '[.[] | select(.gitBranch as $b | $stale | index($b))]')"

  local stale_count=""
  stale_count="$(printf '%s' "${stale_entries}" | jq 'length')"

  echo "Will delete ${stale_count} env var(s) across ${#stale_branches[@]} stale branch(es):"
  printf '  - %s\n' "${stale_branches[@]}"

  if [ "${DRY_RUN}" = "true" ]; then
    echo "[DRY RUN] Would delete ${stale_count} env var(s). Set DRY_RUN=false to execute."
    return 0
  fi

  local deleted=0
  local failed=0
  local env_id=""
  local env_key=""
  local env_branch=""

  for row in $(printf '%s' "${stale_entries}" | jq -r '.[] | @base64'); do
    env_id="$(printf '%s' "${row}" | base64 -d | jq -r '.id')"
    env_key="$(printf '%s' "${row}" | base64 -d | jq -r '.key')"
    env_branch="$(printf '%s' "${row}" | base64 -d | jq -r '.gitBranch')"

    if delete_env_var_with_retry "${project_id}" "${env_id}"; then
      deleted=$((deleted + 1))
    else
      echo "  Warning: failed to delete ${env_key} (branch: ${env_branch}) after ${MAX_RETRIES} attempts" >&2
      failed=$((failed + 1))
    fi
  done

  echo "Deleted ${deleted}/${stale_count} env var(s) for project ${project_id}."
  if [ "${failed}" -gt 0 ]; then
    echo "  ${failed} deletion(s) failed." >&2
  fi
}

echo "=== Manage UI project ==="
delete_stale_branch_env_vars "${VERCEL_MANAGE_UI_PROJECT_ID}"

echo ""
echo "=== API project ==="
delete_stale_branch_env_vars "${VERCEL_API_PROJECT_ID}"
