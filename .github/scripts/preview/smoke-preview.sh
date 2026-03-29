#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars API_URL UI_URL INKEEP_AGENTS_MANAGE_UI_USERNAME INKEEP_AGENTS_MANAGE_UI_PASSWORD

wait_for_success_url() {
  local url="$1"
  local attempts="${2:-30}"
  local sleep_seconds="${3:-5}"
  local attempt=""

  for attempt in $(seq 1 "${attempts}"); do
    if curl --connect-timeout 5 --max-time 15 -fsS "${url}" >/dev/null; then
      return 0
    fi

    if [ "${attempt}" -lt "${attempts}" ]; then
      sleep "${sleep_seconds}"
    fi
  done

  echo "Timed out waiting for ${url}" >&2
  return 1
}

wait_for_ui_url() {
  local url="$1"
  local attempts="${2:-30}"
  local sleep_seconds="${3:-5}"
  local attempt=""
  local status_code=""

  for attempt in $(seq 1 "${attempts}"); do
    status_code="$(
      curl --connect-timeout 5 --max-time 15 -sS -o /dev/null -w '%{http_code}' "${url}" || true
    )"
    case "${status_code}" in
      200|204|301|302|307|308|401|403)
        return 0
        ;;
    esac

    if [ "${attempt}" -lt "${attempts}" ]; then
      sleep "${sleep_seconds}"
    fi
  done

  echo "Timed out waiting for UI preview at ${url}; last status=${status_code:-unknown}" >&2
  return 1
}

run_preview_auth_smoke() {
  local tenant_id="${TENANT_ID:-default}"
  local tmpdir cookie_jar sign_in_body sign_in_headers manage_body
  local sign_in_status manage_status

  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir}"' RETURN

  cookie_jar="${tmpdir}/cookies.txt"
  sign_in_body="${tmpdir}/sign-in-body.txt"
  sign_in_headers="${tmpdir}/sign-in-headers.txt"
  manage_body="${tmpdir}/manage-projects-body.txt"

  sign_in_status="$(
    curl --connect-timeout 5 --max-time 20 -sS \
      -c "${cookie_jar}" \
      -D "${sign_in_headers}" \
      -o "${sign_in_body}" \
      -w '%{http_code}' \
      -H 'Content-Type: application/json' \
      -H "Origin: ${UI_URL}" \
      -d "$(jq -cn \
        --arg email "${INKEEP_AGENTS_MANAGE_UI_USERNAME}" \
        --arg password "${INKEEP_AGENTS_MANAGE_UI_PASSWORD}" \
        '{email:$email, password:$password}')" \
      "${API_URL}/api/auth/sign-in/email"
  )"

  if [ "${sign_in_status}" != "200" ]; then
    echo "Preview sign-in failed with status ${sign_in_status}" >&2
    cat "${sign_in_body}" | redact_preview_logs >&2
    return 1
  fi

  if ! grep -Eq 'better-auth\.[^[:space:]]+' "${cookie_jar}"; then
    echo "Preview sign-in did not produce a Better Auth session cookie." >&2
    cat "${sign_in_headers}" | redact_preview_logs >&2
    return 1
  fi

  manage_status="$(
    curl --connect-timeout 5 --max-time 20 -sS \
      -b "${cookie_jar}" \
      -o "${manage_body}" \
      -w '%{http_code}' \
      -H 'Accept: application/json' \
      "${API_URL}/manage/tenants/${tenant_id}/projects"
  )"

  if [ "${manage_status}" != "200" ]; then
    echo "Preview manage auth check failed with status ${manage_status}" >&2
    cat "${manage_body}" | redact_preview_logs >&2
    return 1
  fi
}

wait_for_success_url "${API_URL}/health" 30 5
wait_for_ui_url "${UI_URL}" 30 5
run_preview_auth_smoke
