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
  echo
  if [ -n "${INKEEP_AGENTS_MANAGE_UI_USERNAME:-}" ] && [ -n "${INKEEP_AGENTS_MANAGE_UI_PASSWORD:-}" ]; then
    tenant_id="${TENANT_ID:-default}"
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "${tmpdir}"' EXIT

    cookie_jar="${tmpdir}/cookies.txt"
    sign_in_headers="${tmpdir}/sign-in-headers.txt"
    sign_in_body="${tmpdir}/sign-in-body.txt"
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
        "${API_URL}/api/auth/sign-in/email" || true
    )"

    echo "### API sign-in response (${sign_in_status})"
    cat "${sign_in_headers}"
    cat "${sign_in_body}"
    echo

    manage_status="$(
      curl --connect-timeout 5 --max-time 20 -sS \
        -b "${cookie_jar}" \
        -o "${manage_body}" \
        -w '%{http_code}' \
        -H 'Accept: application/json' \
        "${API_URL}/manage/tenants/${tenant_id}/projects" || true
    )"

    echo "### Authenticated manage/projects response (${manage_status})"
    cat "${manage_body}"
    echo
  fi
} | redact_preview_logs | tee /tmp/preview-smoke-diagnostics.txt
