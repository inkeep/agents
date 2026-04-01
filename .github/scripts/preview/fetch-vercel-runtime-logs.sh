#!/usr/bin/env bash
# Diagnostics should continue even when inspect/log fetch fails.
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  VERCEL_TOKEN \
  VERCEL_ORG_ID \
  VERCEL_API_PROJECT_ID \
  API_URL \
  GITHUB_STEP_SUMMARY

npm install -g vercel@50.32.5
export VERCEL_PROJECT_ID="${VERCEL_API_PROJECT_ID}"
TARGET_DEPLOYMENT="${API_DEPLOYMENT_URL:-${API_URL}}"

echo "## Vercel Deployment Inspect (API)" >> "${GITHUB_STEP_SUMMARY}"
vercel inspect "${TARGET_DEPLOYMENT}" --token="${VERCEL_TOKEN}" --scope="${VERCEL_ORG_ID}" 2>&1 | redact_preview_logs | tee /tmp/vercel-inspect.txt
echo "## Vercel Runtime Logs (API)" >> "${GITHUB_STEP_SUMMARY}"
vercel logs "${TARGET_DEPLOYMENT}" --token="${VERCEL_TOKEN}" --scope="${VERCEL_ORG_ID}" --since=1h --no-follow 2>&1 | redact_preview_logs | tail -n 200
