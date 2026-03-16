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

require_env_vars \
  VERCEL_TOKEN \
  VERCEL_ORG_ID \
  VERCEL_API_PROJECT_ID \
  VERCEL_MANAGE_UI_PROJECT_ID \
  PR_BRANCH \
  PR_HEAD_SHA \
  API_URL \
  UI_URL \
  GITHUB_REPOSITORY \
  GITHUB_OUTPUT \
  GITHUB_STEP_SUMMARY

npm install -g vercel@50.32.5

REPO_OWNER="${GITHUB_REPOSITORY%%/*}"
REPO_NAME="${GITHUB_REPOSITORY#*/}"

API_DOMAIN="${API_URL#https://}"
API_DOMAIN="${API_DOMAIN#http://}"
API_DOMAIN="${API_DOMAIN%%/*}"

UI_DOMAIN="${UI_URL#https://}"
UI_DOMAIN="${UI_DOMAIN#http://}"
UI_DOMAIN="${UI_DOMAIN%%/*}"

deploy_and_alias() {
  local project_id="$1"
  local alias_domain="$2"
  local output_key="$3"
  local deployment_url=""
  local env_file=".vercel/.env.preview.local"
  local log_file=""

  export VERCEL_PROJECT_ID="${project_id}"
  vercel pull --yes --environment=preview --git-branch="${PR_BRANCH}" --token="${VERCEL_TOKEN}" --scope="${VERCEL_ORG_ID}"

  if [ "${output_key}" = "api_deployment_url" ]; then
    emit_preview_env_debug() {
      if [ ! -f "${env_file}" ]; then
        {
          echo "## API Preview Env Snapshot"
          echo "- Missing \`${env_file}\` after \`vercel pull\`"
        } | tee -a "${GITHUB_STEP_SUMMARY}"
        return
      fi

      debug_key() {
        local key="$1"
        local raw=""
        local value=""
        local length=""

        raw="$(grep -m1 "^${key}=" "${env_file}" || true)"
        if [ -z "${raw}" ]; then
          echo "- \`${key}\`: absent"
          return
        fi

        value="${raw#*=}"
        length="${#value}"

        case "${key}" in
          ENVIRONMENT|NODE_ENV|LOG_LEVEL|SPICEDB_TLS_ENABLED)
            echo "- \`${key}\`: present, value=\`${value}\`, len=${length}"
            ;;
          *)
            echo "- \`${key}\`: present, len=${length}"
            ;;
        esac
      }

      {
        echo "## API Preview Env Snapshot"
        debug_key "ENVIRONMENT"
        debug_key "NODE_ENV"
        debug_key "LOG_LEVEL"
        debug_key "INKEEP_AGENTS_MANAGE_DATABASE_URL"
        debug_key "INKEEP_AGENTS_RUN_DATABASE_URL"
        debug_key "INKEEP_AGENTS_MANAGE_UI_USERNAME"
        debug_key "INKEEP_AGENTS_MANAGE_UI_PASSWORD"
        debug_key "INKEEP_ANON_JWT_SECRET"
        debug_key "INKEEP_ANON_SESSION_LIFETIME_SECONDS"
        debug_key "INKEEP_POW_HMAC_SECRET"
        debug_key "INKEEP_POW_DIFFICULTY"
        debug_key "SPICEDB_ENDPOINT"
        debug_key "SPICEDB_PRESHARED_KEY"
        debug_key "SPICEDB_TLS_ENABLED"
        debug_key "ANTHROPIC_API_KEY"
        debug_key "BETTER_AUTH_SECRET"
        debug_key "INKEEP_AGENTS_JWT_SIGNING_SECRET"
        debug_key "GITHUB_STATE_SIGNING_SECRET"
        debug_key "INKEEP_COPILOT_TENANT_ID"
        debug_key "INKEEP_COPILOT_PROJECT_ID"
        debug_key "INKEEP_COPILOT_AGENT_ID"
        debug_key "BLOB_READ_WRITE_TOKEN"
        debug_key "BLOB_STORAGE_S3_BUCKET"
        debug_key "BLOB_STORAGE_S3_REGION"
        debug_key "BLOB_STORAGE_S3_ACCESS_KEY_ID"
        debug_key "BLOB_STORAGE_S3_SECRET_ACCESS_KEY"
      } | tee -a "${GITHUB_STEP_SUMMARY}"
    }

    emit_preview_env_debug
  fi

  log_file="$(mktemp)"
  vercel deploy \
    --yes \
    --token="${VERCEL_TOKEN}" \
    --scope="${VERCEL_ORG_ID}" \
    -m githubDeployment=1 \
    -m githubCommitRef="${PR_BRANCH}" \
    -m githubCommitSha="${PR_HEAD_SHA}" \
    -m githubOrg="${REPO_OWNER}" \
    -m githubRepo="${REPO_NAME}" \
    -m githubCommitOrg="${REPO_OWNER}" \
    -m githubCommitRepo="${REPO_NAME}" \
    2>&1 | tee "${log_file}"

  deployment_url="$(
    grep -E 'Preview:[[:space:]]+https://' "${log_file}" |
      tail -n1 |
      sed -E 's/.*Preview:[[:space:]]+(https:\/\/[^[:space:]]+).*/\1/' ||
      true
  )"
  if [ -z "${deployment_url}" ]; then
    deployment_url="$(grep -Eo 'https://[^[:space:]]+' "${log_file}" | tail -n1 || true)"
  fi
  if [ -z "${deployment_url}" ]; then
    echo "Unable to parse deployment URL for project ${project_id}."
    echo "Last deploy log lines:"
    tail -n 20 "${log_file}" || true
    exit 1
  fi

  vercel alias set "${deployment_url}" "${alias_domain}" --token="${VERCEL_TOKEN}" --scope="${VERCEL_ORG_ID}"
  echo "${output_key}=${deployment_url}" >> "${GITHUB_OUTPUT}"

  {
    echo "## Vercel Preview Alias"
    echo "- Project: \`${project_id}\`"
    echo "- Deployment: \`${deployment_url}\`"
    echo "- Alias: \`${alias_domain}\`"
  } >> "${GITHUB_STEP_SUMMARY}"
}

deploy_and_alias "${VERCEL_API_PROJECT_ID}" "${API_DOMAIN}" "api_deployment_url"
deploy_and_alias "${VERCEL_MANAGE_UI_PROJECT_ID}" "${UI_DOMAIN}" "ui_deployment_url"
