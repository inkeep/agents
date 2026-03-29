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

railway_link_service() {
  local project_id="$1"
  local service="$2"
  local env_name="$3"

  if ! railway link \
    --project "${project_id}" \
    --service "${service}" \
    --environment "${env_name}" \
    >/dev/null; then
    echo "Failed to link Railway CLI to project ${project_id} service ${service} env ${env_name}." >&2
    return 1
  fi
}

railway_extract_runtime_var() {
  local service="$1"
  local env_name="$2"
  local key="$3"
  local max_attempts="${4:-20}"
  local sleep_seconds="${5:-2}"
  local attempt=""
  local value=""

  for attempt in $(seq 1 "${max_attempts}"); do
    value="$(
      railway variable list \
        --service "${service}" \
        --environment "${env_name}" \
        --json |
      jq -r --arg key "${key}" '.[$key] // empty'
    )"

    if [ -n "${value}" ] && ! printf '%s' "${value}" | grep -q '\$[{][{]'; then
      printf '%s' "${value}"
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep_with_jitter "${sleep_seconds}"
    fi
  done

  if [ -z "${value:-}" ]; then
    echo "Missing runtime variable ${key} in Railway service ${service} for env ${env_name}." >&2
  else
    echo "Runtime variable ${key} is unresolved (${value}) after waiting for Railway interpolation." >&2
  fi
  return 1
}

mask_env_vars() {
  local var_name
  for var_name in "$@"; do
    if [ -n "${!var_name:-}" ]; then
      echo "::add-mask::${!var_name}"
    fi
  done
}

railway_graphql() {
  local query="$1"
  local payload=""

  payload="$(jq -nc --arg query "${query}" '{query: $query}')"

  curl --connect-timeout 10 --max-time 30 -fsS \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${RAILWAY_API_TOKEN}" \
    -H "User-Agent: Mozilla/5.0" \
    -H "Origin: https://railway.com" \
    -H "Referer: https://railway.com/" \
    -d "${payload}" \
    https://backboard.railway.com/graphql/v2
}

railway_environment_id() {
  local project_id="$1"
  local env_name="$2"
  local response=""

  response="$(
    railway_graphql "$(cat <<EOF
query {
  environments(projectId: "${project_id}") {
    edges {
      node {
        id
        name
      }
    }
  }
}
EOF
)"
  )"

  jq -r --arg env_name "${env_name}" '.data.environments.edges[] | select(.node.name == $env_name) | .node.id' <<< "${response}"
}

railway_service_id_for_env() {
  local env_id="$1"
  local service_name="$2"
  local response=""

  response="$(
    railway_graphql "$(cat <<EOF
query {
  environment(id: "${env_id}") {
    serviceInstances {
      edges {
        node {
          serviceId
          serviceName
        }
      }
    }
  }
}
EOF
)"
  )"

  jq -r --arg service_name "${service_name}" '.data.environment.serviceInstances.edges[] | select(.node.serviceName == $service_name) | .node.serviceId' <<< "${response}"
}

railway_wait_for_environment_id() {
  local project_id="$1"
  local env_name="$2"
  local max_attempts="${3:-30}"
  local sleep_seconds="${4:-2}"
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

railway_wait_for_service_id_for_env() {
  local env_id="$1"
  local service_name="$2"
  local env_name="$3"
  local max_attempts="${4:-30}"
  local sleep_seconds="${5:-2}"
  local attempt=""
  local service_id=""

  for attempt in $(seq 1 "${max_attempts}"); do
    service_id="$(railway_service_id_for_env "${env_id}" "${service_name}")"
    if [ -n "${service_id}" ]; then
      printf '%s' "${service_id}"
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep_with_jitter "${sleep_seconds}"
    fi
  done

  echo "Unable to resolve Railway service ID for ${service_name} in ${env_name}." >&2
  return 1
}

railway_ensure_tcp_proxy() {
  local project_id="$1"
  local env_name="$2"
  local service_name="$3"
  local application_port="$4"
  local max_attempts="${5:-30}"
  local sleep_seconds="${6:-2}"
  local env_id=""
  local service_id=""
  local response=""
  local count=""
  local active=""
  local attempt=""

  env_id="$(railway_wait_for_environment_id "${project_id}" "${env_name}" "${max_attempts}" "${sleep_seconds}")" || return 1
  service_id="$(railway_wait_for_service_id_for_env "${env_id}" "${service_name}" "${env_name}" "${max_attempts}" "${sleep_seconds}")" || return 1

  response="$(
    railway_graphql "$(cat <<EOF
query {
  tcpProxies(environmentId: "${env_id}", serviceId: "${service_id}") {
    id
    domain
    proxyPort
    applicationPort
    syncStatus
  }
}
EOF
)"
  )"

  count="$(jq -r --argjson application_port "${application_port}" '[.data.tcpProxies[] | select(.applicationPort == $application_port)] | length' <<< "${response}")"
  if [ "${count}" = "0" ]; then
    response="$(
      railway_graphql "$(cat <<EOF
mutation {
  tcpProxyCreate(input: {
    environmentId: "${env_id}"
    serviceId: "${service_id}"
    applicationPort: ${application_port}
  }) {
    id
  }
}
EOF
)"
    )"

    if echo "${response}" | jq -e '.errors' >/dev/null 2>&1; then
      echo "Failed to create TCP proxy for ${service_name} in ${env_name}: $(echo "${response}" | jq -r '.errors[0].message // "unknown error"')" >&2
      return 1
    fi
  fi

  for attempt in $(seq 1 "${max_attempts}"); do
    response="$(
      railway_graphql "$(cat <<EOF
query {
  tcpProxies(environmentId: "${env_id}", serviceId: "${service_id}") {
    applicationPort
    syncStatus
  }
}
EOF
)"
    )"

    active="$(jq -r --argjson application_port "${application_port}" '[.data.tcpProxies[] | select(.applicationPort == $application_port and .syncStatus == "ACTIVE")] | length' <<< "${response}")"
    if [ "${active}" != "0" ]; then
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep_with_jitter "${sleep_seconds}"
    fi
  done

  echo "TCP proxy for ${service_name} in ${env_name} did not become ACTIVE." >&2
  return 1
}

redact_preview_logs() {
  sed -E \
    -e 's#(postgres(ql)?://)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#([A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z_]*[:=])[^\r\n[:space:]]+#\1[REDACTED]#g' \
    -e 's#((s|S)et-(c|C)ookie:[[:space:]]*better-auth[^=]*=)[^;[:space:]]+#\1[REDACTED]#g' \
    -e 's#(better-auth\.[^=]+=)[^;[:space:]]+#\1[REDACTED]#g' \
    -e 's#(Bearer )[A-Za-z0-9._-]+#\1[REDACTED]#g'
}
