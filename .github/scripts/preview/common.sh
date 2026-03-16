#!/usr/bin/env bash
# Shared helpers for preview scripts. This file is sourced, so callers own shell strictness.

require_env_vars() {
  local required
  for required in "$@"; do
    if [ -z "${!required:-}" ]; then
      echo "Missing required configuration: ${required}" >&2
      exit 1
    fi
  done
}

require_pr_number() {
  local pr_number="$1"

  if ! [[ "${pr_number}" =~ ^[0-9]+$ ]]; then
    echo "Invalid PR number: ${pr_number}" >&2
    exit 1
  fi
}

pr_env_name() {
  local pr_number="$1"

  require_pr_number "${pr_number}"
  printf 'pr-%s' "${pr_number}"
}

railway_env_exists_count() {
  local project_id="$1"
  local env_name="$2"
  local output_path="${3:-/tmp/railway-projects.json}"

  if ! railway project list --json > "${output_path}"; then
    echo "Failed to list Railway environments for project ${project_id}." >&2
    return 1
  fi

  jq -r \
    --arg project_id "${project_id}" \
    --arg name "${env_name}" \
    '[.[] | select(.id == $project_id) | .environments.edges[].node | select(.name == $name)] | length' \
    "${output_path}"
}

mask_env_vars() {
  local var_name
  for var_name in "$@"; do
    if [ -n "${!var_name:-}" ]; then
      echo "::add-mask::${!var_name}"
    fi
  done
}

redact_preview_logs() {
  sed -E \
    -e 's#(postgres(ql)?://)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#([A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z_]*[:=])[^\r\n[:space:]]+#\1[REDACTED]#g' \
    -e 's#(Bearer )[A-Za-z0-9._-]+#\1[REDACTED]#g'
}
