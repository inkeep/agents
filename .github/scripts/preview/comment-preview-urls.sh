#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/scripts/preview/common.sh
source "${SCRIPT_DIR}/common.sh"

require_env_vars \
  GITHUB_TOKEN \
  GITHUB_API_URL \
  GITHUB_REPOSITORY \
  PR_NUMBER \
  API_URL \
  UI_URL

COMMENT_MARKER="<!-- preview-environments:stable-urls -->"
COMMENTS_ENDPOINT="${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments"
COMMENT_UPDATE_ENDPOINT="${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/comments"
API_HEALTH_URL="${API_URL%/}/health"
COMMENT_BODY_FILE="$(mktemp)"
trap 'rm -f "${COMMENT_BODY_FILE}"' EXIT

cat > "${COMMENT_BODY_FILE}" <<EOF
${COMMENT_MARKER}
## Preview URLs

Use these stable preview aliases for testing this PR:

- UI: [${UI_URL}](${UI_URL})
- API: [${API_URL}](${API_URL})
- API health: [${API_HEALTH_URL}](${API_HEALTH_URL})

These point to the same Vercel preview deployment as the bot comment, but they stay stable and easier to find.
EOF

if [ -n "${UI_DEPLOYMENT_URL:-}" ] || [ -n "${API_DEPLOYMENT_URL:-}" ]; then
  {
    echo
    echo "<details>"
    echo "<summary>Raw Vercel deployment URLs</summary>"
    echo
    if [ -n "${UI_DEPLOYMENT_URL:-}" ]; then
      echo "- UI deployment: [${UI_DEPLOYMENT_URL}](${UI_DEPLOYMENT_URL})"
    fi
    if [ -n "${API_DEPLOYMENT_URL:-}" ]; then
      echo "- API deployment: [${API_DEPLOYMENT_URL}](${API_DEPLOYMENT_URL})"
    fi
    echo "</details>"
  } >> "${COMMENT_BODY_FILE}"
fi

EXISTING_COMMENT_ID=""
PAGE=1
while :; do
  PAGE_JSON="$(
    curl --connect-timeout 10 --max-time 30 -fsS \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "${COMMENTS_ENDPOINT}?per_page=100&page=${PAGE}"
  )"

  PAGE_MATCH="$(
    jq -r \
      --arg marker "${COMMENT_MARKER}" \
      '[.[] | select(.user.login == "github-actions[bot]" and (.body | contains($marker)))] | last | .id // empty' \
      <<< "${PAGE_JSON}"
  )"

  if [ -n "${PAGE_MATCH}" ]; then
    EXISTING_COMMENT_ID="${PAGE_MATCH}"
  fi

  PAGE_COUNT="$(jq 'length' <<< "${PAGE_JSON}")"
  if [ "${PAGE_COUNT}" -lt 100 ]; then
    break
  fi

  PAGE=$((PAGE + 1))
done

COMMENT_PAYLOAD="$(jq -Rs '{body: .}' < "${COMMENT_BODY_FILE}")"

if [ -n "${EXISTING_COMMENT_ID}" ]; then
  curl --connect-timeout 10 --max-time 30 -fsS \
    -X PATCH \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "${COMMENT_UPDATE_ENDPOINT}/${EXISTING_COMMENT_ID}" \
    --data "${COMMENT_PAYLOAD}" >/dev/null
else
  curl --connect-timeout 10 --max-time 30 -fsS \
    -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "${COMMENTS_ENDPOINT}" \
    --data "${COMMENT_PAYLOAD}" >/dev/null
fi
