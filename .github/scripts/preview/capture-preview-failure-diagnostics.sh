#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

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
