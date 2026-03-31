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
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${pr_number}"
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
  railway_environment_delete_by_id "${env_id}" >/dev/null
  railway_wait_for_environment_absent "${RAILWAY_PROJECT_ID}" "${env_name}" 10 2
}

ENVIRONMENTS_JSON="$(railway_project_environments_json "${RAILWAY_PROJECT_ID}")"
PR_ENVIRONMENTS_JSON="$(jq -c '[.[] | select(.name | test("^pr-[0-9]+$"))]' <<< "${ENVIRONMENTS_JSON}")"
PR_ENVIRONMENT_COUNT="$(jq 'length' <<< "${PR_ENVIRONMENTS_JSON}")"

if [ "${PR_ENVIRONMENT_COUNT}" = "0" ]; then
  preview_log "No Railway PR environments found in project ${RAILWAY_PROJECT_ID}."
  exit 0
fi

preview_log "Evaluating ${PR_ENVIRONMENT_COUNT} Railway PR environment(s) for stale state."

deleted=0
kept=0
unknown_seen=0
unknown_skipped=0
stale_targets=0
errors=0
deleted_names=()
unknown_names=()

while IFS= read -r row; do
  [ -z "${row}" ] && continue

  env_id="$(jq -r '.id' <<< "${row}")"
  env_name="$(jq -r '.name' <<< "${row}")"
  pr_number="${env_name#pr-}"

  pr_state="$(github_pr_state "${pr_number}")" || {
    errors=$((errors + 1))
    continue
  }

  case "${pr_state}" in
    open)
      kept=$((kept + 1))
      ;;
    closed)
      stale_targets=$((stale_targets + 1))
      if [ "${DRY_RUN}" = "true" ]; then
        preview_log "[dry-run] Would delete stale Railway preview environment ${env_name}."
      else
        delete_env_and_verify "${env_id}" "${env_name}"
        deleted=$((deleted + 1))
        deleted_names+=("${env_name}")
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
          delete_env_and_verify "${env_id}" "${env_name}"
          deleted=$((deleted + 1))
          deleted_names+=("${env_name}")
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
done < <(jq -rc '.[]' <<< "${PR_ENVIRONMENTS_JSON}")

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Railway Preview Janitor"
    echo "- Dry run: \`${DRY_RUN}\`"
    echo "- Evaluated PR envs: \`${PR_ENVIRONMENT_COUNT}\`"
    echo "- Open PR envs kept: \`${kept}\`"
    echo "- Closed/orphaned PR envs targeted: \`${stale_targets}\`"
    echo "- Railway envs deleted: \`${deleted}\`"
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

if [ "${errors}" -gt 0 ]; then
  echo "Encountered ${errors} GitHub lookup error(s) during Railway preview janitor." >&2
  exit 1
fi
