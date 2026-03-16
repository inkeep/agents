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

require_env_vars API_URL UI_URL GITHUB_STEP_SUMMARY

echo "## Smoke Failure Diagnostics" >> "${GITHUB_STEP_SUMMARY}"

{
  echo "### API /health response"
  curl --connect-timeout 5 --max-time 15 -i -sS "${API_URL}/health" || true
  echo
  echo "### API / response"
  curl --connect-timeout 5 --max-time 15 -i -sS "${API_URL}/" || true
  echo
  echo "### UI response"
  curl --connect-timeout 5 --max-time 15 -I -sS "${UI_URL}" || true
} | tee /tmp/preview-smoke-diagnostics.txt
