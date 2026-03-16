#!/usr/bin/env bash
set -euo pipefail

require_env_vars() {
  local required
  for required in "$@"; do
    if [ -z "${!required:-}" ]; then
      echo "Missing required configuration: ${required}" >&2
      exit 1
    fi
  done
}

require_env_vars API_URL UI_URL

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

wait_for_success_url "${API_URL}/health" 30 5
wait_for_ui_url "${UI_URL}" 30 5
