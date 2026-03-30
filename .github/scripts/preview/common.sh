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

sleep_with_jitter() {
  local sleep_seconds="$1"
  local jittered_sleep=""

  jittered_sleep="$(
    python3 - <<PY
import random
base = float(${sleep_seconds})
print(base * (0.5 + random.random()))
PY
  )"

  sleep "${jittered_sleep}"
}

sleep_with_backoff_and_jitter() {
  local base_sleep_seconds="$1"
  local attempt="$2"
  local max_sleep_seconds="${3:-30}"
  local jittered_sleep=""

  jittered_sleep="$(
    python3 - <<PY
import random
base = float(${base_sleep_seconds})
attempt = int(${attempt})
cap = float(${max_sleep_seconds})
sleep_seconds = min(base * (2 ** max(attempt - 1, 0)), cap)
print(sleep_seconds * (0.5 + random.random()))
PY
  )"

  sleep "${jittered_sleep}"
}

pr_env_name() {
  local pr_number="$1"

  require_pr_number "${pr_number}"
  printf 'pr-%s' "${pr_number}"
}

railway_env_exists_count() {
  local project_id="$1"
  local env_name="$2"
  local env_id=""

  env_id="$(railway_environment_id "${project_id}" "${env_name}")"
  if [ -n "${env_id}" ]; then
    printf '1'
  else
    printf '0'
  fi
}

mask_env_vars() {
  local var_name
  for var_name in "$@"; do
    if [ -n "${!var_name:-}" ]; then
      echo "::add-mask::${!var_name}"
    fi
  done
}

railway_graphql_has_errors() {
  local response="$1"

  jq -e '.errors and (.errors | length > 0)' >/dev/null 2>&1 <<< "${response}"
}

railway_graphql_first_error_message() {
  local response="$1"

  jq -r '.errors[0].message // "unknown GraphQL error"' <<< "${response}"
}

railway_require_graphql_success() {
  local response="$1"
  local context="$2"

  if railway_graphql_has_errors "${response}"; then
    echo "${context}: $(railway_graphql_first_error_message "${response}")" >&2
    return 1
  fi
}

railway_graphql() {
  local query="$1"
  local variables_json="${2:-}"
  local payload=""
  local max_attempts="${RAILWAY_GRAPHQL_MAX_ATTEMPTS:-6}"
  local sleep_seconds="${RAILWAY_GRAPHQL_SLEEP_SECONDS:-3}"
  local max_sleep_seconds="${RAILWAY_GRAPHQL_MAX_SLEEP_SECONDS:-30}"
  local attempt=""
  local body_file=""
  local header_file=""
  local status=""
  local retry_after=""
  local exit_code="0"

  if [ -n "${variables_json}" ]; then
    payload="$(jq -nc --arg query "${query}" --argjson variables "${variables_json}" '{query: $query, variables: $variables}')"
  else
    payload="$(jq -nc --arg query "${query}" '{query: $query}')"
  fi

  body_file="$(mktemp)"
  header_file="$(mktemp)"

  for attempt in $(seq 1 "${max_attempts}"); do
    exit_code="0"
    : > "${body_file}"
    : > "${header_file}"
    status="$(
      curl --connect-timeout 10 --max-time 30 -sS \
        -D "${header_file}" \
        -o "${body_file}" \
        -w '%{http_code}' \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${RAILWAY_API_TOKEN}" \
        -H "User-Agent: inkeep-preview-ci" \
        -d "${payload}" \
        https://backboard.railway.com/graphql/v2
    )" || exit_code="$?"

    if [ "${exit_code}" = "0" ] && [ "${status}" = "200" ]; then
      cat "${body_file}"
      rm -f "${body_file}" "${header_file}"
      return 0
    fi

    retry_after="$(
      awk 'tolower($1) == "retry-after:" {print $2}' "${header_file}" |
      tr -d '\r' |
      tail -n 1
    )"

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      if [ -n "${retry_after}" ] && [[ "${retry_after}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
        sleep_with_jitter "${retry_after}"
      elif [ "${exit_code}" != "0" ] || [[ "${status}" =~ ^(429|5[0-9]{2}|000)$ ]]; then
        sleep_with_backoff_and_jitter "${sleep_seconds}" "${attempt}" "${max_sleep_seconds}"
      else
        cat "${body_file}" >&2
        rm -f "${body_file}" "${header_file}"
        return 1
      fi
    fi
  done

  cat "${body_file}" >&2
  rm -f "${body_file}" "${header_file}"
  return 1
}

railway_environment_create_from_source() {
  local project_id="$1"
  local env_name="$2"
  local source_environment_id="$3"
  local variables_json=""

  variables_json="$(jq -nc \
    --arg project_id "${project_id}" \
    --arg env_name "${env_name}" \
    --arg source_environment_id "${source_environment_id}" \
    '{input: {projectId: $project_id, name: $env_name, sourceEnvironmentId: $source_environment_id}}')"

  railway_graphql 'mutation($input: EnvironmentCreateInput!) { environmentCreate(input: $input) { id name } }' "${variables_json}"
}

railway_environment_delete_by_id() {
  local environment_id="$1"
  local variables_json=""

  variables_json="$(jq -nc --arg environment_id "${environment_id}" '{id: $environment_id}')"

  railway_graphql 'mutation($id: String!) { environmentDelete(id: $id) }' "${variables_json}"
}

railway_project_service_id() {
  local project_id="$1"
  local service_ref="$2"
  local response=""
  local variables_json=""

  if [[ "${service_ref}" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    printf '%s' "${service_ref}"
    return 0
  fi

  variables_json="$(jq -nc --arg project_id "${project_id}" '{projectId: $project_id}')"

  response="$(
    railway_graphql 'query($projectId: String!) { project(id: $projectId) { services { edges { node { id name } } } } }' "${variables_json}"
  )"
  railway_require_graphql_success "${response}" "GraphQL error querying Railway services" || return 1

  jq -r --arg service_ref "${service_ref}" '
    .data.project.services.edges[]
    | .node
    | select(.id == $service_ref or .name == $service_ref or .name == ("@inkeep/" + $service_ref))
    | .id
  ' <<< "${response}" | head -n 1
}

railway_variables_json() {
  local project_id="$1"
  local environment_id="$2"
  local service_id="$3"
  local unrendered="${4:-false}"
  local variables_json=""
  local response=""

  variables_json="$(jq -nc \
    --arg project_id "${project_id}" \
    --arg environment_id "${environment_id}" \
    --arg service_id "${service_id}" \
    --argjson unrendered "${unrendered}" \
    '{projectId: $project_id, environmentId: $environment_id, serviceId: $service_id, unrendered: $unrendered}')"

  response="$(
    railway_graphql 'query($projectId: String!, $environmentId: String!, $serviceId: String!, $unrendered: Boolean) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, unrendered: $unrendered) }' "${variables_json}"
  )"
  railway_require_graphql_success "${response}" "GraphQL error fetching Railway variables" || return 1

  jq -c '.data.variables // {}' <<< "${response}"
}

railway_variable_collection_upsert() {
  local project_id="$1"
  local environment_id="$2"
  local service_id="$3"
  local skip_deploys="${4:-true}"
  local variables_payload="$5"
  local variables_json=""

  variables_json="$(jq -nc \
    --arg project_id "${project_id}" \
    --arg environment_id "${environment_id}" \
    --arg service_id "${service_id}" \
    --argjson skip_deploys "${skip_deploys}" \
    --argjson variables "${variables_payload}" \
    '{input: {projectId: $project_id, environmentId: $environment_id, serviceId: $service_id, skipDeploys: $skip_deploys, variables: $variables}}')"

  railway_graphql 'mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }' "${variables_json}"
}

railway_environment_id() {
  local project_id="$1"
  local env_name="$2"
  local response=""
  local variables_json=""

  variables_json="$(jq -nc --arg project_id "${project_id}" '{projectId: $project_id}')"

  response="$(
    railway_graphql 'query($projectId: String!) {
  environments(projectId: $projectId) {
    edges {
      node {
        id
        name
      }
    }
  }
}' "${variables_json}"
  )"
  railway_require_graphql_success "${response}" "GraphQL error querying Railway environments" || return 1

  jq -r --arg env_name "${env_name}" '.data.environments.edges[] | select(.node.name == $env_name) | .node.id' <<< "${response}"
}

railway_wait_for_environment_id() {
  local project_id="$1"
  local env_name="$2"
  local max_attempts="${3:-20}"
  local sleep_seconds="${4:-4}"
  local attempt=""
  local env_id=""

  for attempt in $(seq 1 "${max_attempts}"); do
    env_id="$(railway_environment_id "${project_id}" "${env_name}")"
    if [ -n "${env_id}" ]; then
      printf '%s' "${env_id}"
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep_with_jitter "${sleep_seconds}"
    fi
  done

  echo "Unable to resolve Railway environment ID for ${env_name}." >&2
  return 1
}

railway_ensure_tcp_proxy() {
  local project_id="$1"
  local env_name="$2"
  local service_name="$3"
  local application_port="$4"
  local max_attempts="${5:-20}"
  local sleep_seconds="${6:-4}"
  local env_id=""
  local service_id=""
  local response=""
  local count=""
  local active=""
  local attempt=""
  local create_error=""

  env_id="$(railway_wait_for_environment_id "${project_id}" "${env_name}" "${max_attempts}" "${sleep_seconds}")" || return 1
  service_id="$(railway_project_service_id "${project_id}" "${service_name}")"
  if [ -z "${service_id}" ]; then
    echo "Unable to resolve Railway service ID for ${service_name} in project ${project_id}." >&2
    return 1
  fi

  for attempt in $(seq 1 "${max_attempts}"); do
    response="$(
      railway_graphql 'query($environmentId: String!, $serviceId: String!) {
  tcpProxies(environmentId: $environmentId, serviceId: $serviceId) {
    applicationPort
    syncStatus
  }
}' "$(jq -nc --arg environment_id "${env_id}" --arg service_id "${service_id}" '{environmentId: $environment_id, serviceId: $service_id}')"
    )"
    if railway_graphql_has_errors "${response}"; then
      create_error="$(railway_graphql_first_error_message "${response}")"
      if [ "${attempt}" -lt "${max_attempts}" ]; then
        sleep_with_jitter "${sleep_seconds}"
        continue
      fi
      echo "Failed to query TCP proxies for ${service_name} in ${env_name}: ${create_error}" >&2
      return 1
    fi

    count="$(jq -r --argjson application_port "${application_port}" '[.data.tcpProxies // [] | .[] | select(.applicationPort == $application_port)] | length' <<< "${response}")"
    active="$(jq -r --argjson application_port "${application_port}" '[.data.tcpProxies // [] | .[] | select(.applicationPort == $application_port and .syncStatus == "ACTIVE")] | length' <<< "${response}")"
    if [ "${active}" != "0" ]; then
      return 0
    fi

    if [ "${count}" = "0" ]; then
      response="$(
        railway_graphql 'mutation($environmentId: String!, $serviceId: String!, $applicationPort: Int!) {
  tcpProxyCreate(input: {
    environmentId: $environmentId
    serviceId: $serviceId
    applicationPort: $applicationPort
  }) {
    id
  }
}' "$(jq -nc --arg environment_id "${env_id}" --arg service_id "${service_id}" --argjson application_port "${application_port}" '{environmentId: $environment_id, serviceId: $service_id, applicationPort: $application_port}')"
      )"

      if railway_graphql_has_errors "${response}"; then
        create_error="$(railway_graphql_first_error_message "${response}")"
      else
        create_error=""
      fi
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep_with_jitter "${sleep_seconds}"
    fi
  done

  if [ -n "${create_error}" ]; then
    echo "TCP proxy for ${service_name} in ${env_name} did not become ACTIVE. Last create error: ${create_error}" >&2
    return 1
  fi

  echo "TCP proxy for ${service_name} in ${env_name} did not become ACTIVE." >&2
  return 1
}

vercel_list_preview_only_env_vars() {
  local project_id="$1"
  local envs_json=""

  if ! envs_json="$(
    curl --fail-with-body -sS \
      --connect-timeout 10 \
      --max-time 60 \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      "https://api.vercel.com/v10/projects/${project_id}/env?teamId=${VERCEL_ORG_ID}" \
      2>&1
  )"; then
    echo "Failed to list env vars for project ${project_id}." >&2
    printf '%s\n' "${envs_json}" >&2
    return 1
  fi

  local non_preview=""
  non_preview="$(printf '%s' "${envs_json}" | jq \
    '[.envs[] | select(.gitBranch != null and .gitBranch != "") | select((.target | sort) != ["preview"])] | length')"
  if [ "${non_preview}" -gt 0 ]; then
    echo "SAFETY: found ${non_preview} branch-scoped env var(s) targeting production or development — refusing to proceed." >&2
    printf '%s' "${envs_json}" | jq -r \
      '.envs[] | select(.gitBranch != null and .gitBranch != "") | select((.target | sort) != ["preview"]) | "  \(.key) target=\(.target) branch=\(.gitBranch)"' >&2
    return 1
  fi

  printf '%s' "${envs_json}"
}

redact_preview_logs() {
  sed -E \
    -e 's#(postgres(ql)?://)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#([A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z_]*[:=])[^\r\n[:space:]]+#\1[REDACTED]#g' \
    -e 's#((s|S)et-(c|C)ookie:[[:space:]]*better-auth[^=]*=)[^;[:space:]]+#\1[REDACTED]#g' \
    -e 's#(better-auth\.[^=]+=)[^;[:space:]]+#\1[REDACTED]#g' \
    -e 's#(Bearer )[A-Za-z0-9._-]+#\1[REDACTED]#g'
}
