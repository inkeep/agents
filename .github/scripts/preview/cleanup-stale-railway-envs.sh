#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  RAILWAY_API_TOKEN \
  RAILWAY_PROJECT_ID \
  GH_TOKEN \
  GITHUB_REPOSITORY

DRY_RUN="${DRY_RUN:-false}"
DELETE_UNKNOWN_PREVIEW_ENVS="${DELETE_UNKNOWN_PREVIEW_ENVS:-false}"
GITHUB_API_URL="${GITHUB_API_URL:-https://api.github.com}"

github_pr_state() {
  local pr_number="$1"
  local response_file=""
  local status=""

  response_file="$(mktemp)"
  status="$(
    curl -sS \
      --connect-timeout 10 \
      --max-time 30 \
      -o "${response_file}" \
      -w '%{http_code}' \
      -H "Authorization: Bearer ${GH_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls/${pr_number}"
  )"

  case "${status}" in
    200)
      jq -r '.state' "${response_file}"
      ;;
    404)
      printf 'missing'
      ;;
    *)
      echo "Failed to query PR #${pr_number} from GitHub API (HTTP ${status})." >&2
      cat "${response_file}" >&2
      rm -f "${response_file}"
      return 1
      ;;
  esac

  rm -f "${response_file}"
}

delete_env_and_verify() {
  local env_id="$1"
  local env_name="$2"

  preview_log "Deleting stale Railway preview environment ${env_name}."
  if ! railway_environment_delete_by_id "${env_id}" >/dev/null; then
    echo "Failed to delete Railway environment ${env_name}." >&2
    return 1
  fi
  railway_wait_for_environment_absent "${RAILWAY_PROJECT_ID}" "${env_name}" 10 2
}

ENVIRONMENTS_JSON="$(railway_project_environments_json "${RAILWAY_PROJECT_ID}")"
PREVIEW_ENVIRONMENTS_JSON="$(
  jq -c '[.[] | select(.name | test("^(pr-[0-9]+|backup-pr-[0-9]+-.+)$"))]' <<< "${ENVIRONMENTS_JSON}"
)"
PREVIEW_ENVIRONMENT_COUNT="$(jq 'length' <<< "${PREVIEW_ENVIRONMENTS_JSON}")"

if [ "${PREVIEW_ENVIRONMENT_COUNT}" = "0" ]; then
  preview_log "No Railway preview environments found in project ${RAILWAY_PROJECT_ID}."
  exit 0
fi

preview_log "Evaluating ${PREVIEW_ENVIRONMENT_COUNT} Railway preview environment(s) for stale state."

deleted=0
kept=0
unknown_seen=0
unknown_skipped=0
stale_targets=0
errors=0
deletion_failures=0
deleted_names=()
unknown_names=()

while IFS= read -r row; do
  [ -z "${row}" ] && continue

  env_id="$(jq -r '.id' <<< "${row}")"
  env_name="$(jq -r '.name' <<< "${row}")"
  primary_env_name=""

  if [[ "${env_name}" =~ ^pr-([0-9]+)$ ]]; then
    pr_number="${BASH_REMATCH[1]}"
    primary_env_name="${env_name}"
  elif [[ "${env_name}" =~ ^backup-pr-([0-9]+)-.+$ ]]; then
    pr_number="${BASH_REMATCH[1]}"
    primary_env_name="pr-${pr_number}"
  else
    echo "Unexpected preview environment name: ${env_name}" >&2
    errors=$((errors + 1))
    continue
  fi

  pr_state="$(github_pr_state "${pr_number}")" || {
    errors=$((errors + 1))
    continue
  }

  case "${pr_state}" in
    open)
      if [[ "${env_name}" =~ ^backup-pr- ]]; then
        if [ -n "$(railway_environment_id "${RAILWAY_PROJECT_ID}" "${primary_env_name}")" ]; then
          stale_targets=$((stale_targets + 1))
          if [ "${DRY_RUN}" = "true" ]; then
            preview_log "[dry-run] Would delete stale Railway recreate backup ${env_name} because ${primary_env_name} exists."
          else
            if ! delete_env_and_verify "${env_id}" "${env_name}"; then
              deletion_failures=$((deletion_failures + 1))
            else
              deleted=$((deleted + 1))
              deleted_names+=("${env_name}")
            fi
          fi
        else
          kept=$((kept + 1))
          preview_log "Leaving Railway recreate backup ${env_name} in place because ${primary_env_name} does not exist."
        fi
      else
        kept=$((kept + 1))
      fi
      ;;
    closed)
      stale_targets=$((stale_targets + 1))
      if [ "${DRY_RUN}" = "true" ]; then
        preview_log "[dry-run] Would delete stale Railway preview environment ${env_name}."
      else
        if ! delete_env_and_verify "${env_id}" "${env_name}"; then
          deletion_failures=$((deletion_failures + 1))
        else
          deleted=$((deleted + 1))
          deleted_names+=("${env_name}")
        fi
      fi
      ;;
    missing)
      unknown_seen=$((unknown_seen + 1))
      unknown_names+=("${env_name}")
      if [ "${DELETE_UNKNOWN_PREVIEW_ENVS}" = "true" ]; then
        stale_targets=$((stale_targets + 1))
        if [ "${DRY_RUN}" = "true" ]; then
          preview_log "[dry-run] Would delete orphaned Railway preview environment ${env_name}."
        else
          if ! delete_env_and_verify "${env_id}" "${env_name}"; then
            deletion_failures=$((deletion_failures + 1))
          else
            deleted=$((deleted + 1))
            deleted_names+=("${env_name}")
          fi
        fi
      else
        unknown_skipped=$((unknown_skipped + 1))
        preview_log "Leaving Railway preview environment ${env_name} in place because GitHub PR lookup returned 404."
      fi
      ;;
    *)
      echo "Unexpected GitHub PR state for #${pr_number}: ${pr_state}" >&2
      errors=$((errors + 1))
      ;;
  esac
done < <(jq -rc '.[]' <<< "${PREVIEW_ENVIRONMENTS_JSON}")

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Railway Preview Janitor"
    echo "- Dry run: \`${DRY_RUN}\`"
    echo "- Evaluated preview envs: \`${PREVIEW_ENVIRONMENT_COUNT}\`"
    echo "- Open preview envs kept: \`${kept}\`"
    echo "- Closed/orphaned/stale backup envs targeted: \`${stale_targets}\`"
    echo "- Railway preview envs deleted: \`${deleted}\`"
    echo "- Railway deletion failures: \`${deletion_failures}\`"
    echo "- Unknown PR envs seen: \`${unknown_seen}\`"
    echo "- Unknown PR envs left in place: \`${unknown_skipped}\`"
    echo "- GitHub lookup errors: \`${errors}\`"
    if [ "${deleted}" -gt 0 ]; then
      echo "- Deleted envs: \`${deleted_names[*]}\`"
    fi
    if [ "${unknown_seen}" -gt 0 ]; then
      echo "- Unknown envs encountered: \`${unknown_names[*]}\`"
    fi
  } >> "${GITHUB_STEP_SUMMARY}"
fi

if [ "${errors}" -gt 0 ] || [ "${deletion_failures}" -gt 0 ]; then
  echo "Encountered ${errors} GitHub lookup error(s) and ${deletion_failures} Railway deletion failure(s) during Railway preview janitor." >&2
  exit 1
fi
