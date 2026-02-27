#!/usr/bin/env bash
set -euo pipefail

# isolated-env.sh — Manage parallel isolated dev environments.
#
# Usage:
#   ./scripts/isolated-env.sh up <name>        Start containers only
#   ./scripts/isolated-env.sh setup <name>     Start + migrate + auth init (full setup)
#   ./scripts/isolated-env.sh down <name>      Stop and remove everything
#   ./scripts/isolated-env.sh status           List all running instances
#   ./scripts/isolated-env.sh env <name>       Print .env overrides (source-able)
#
# Docker assigns random available host ports — unlimited parallelism, zero collisions.
# Each instance gets its own COMPOSE_PROJECT_NAME, containers, volumes, and network.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.isolated.yml"
STATE_DIR="$REPO_ROOT/.isolated-envs"

usage() {
  cat <<EOF
Usage: $0 <command> [name]

Commands:
  up <name>        Start an isolated environment (containers only)
  setup <name>     Start + run migrations + auth init (full dev setup)
  down <name>      Stop and remove an isolated environment
  status           List all running isolated environments
  env <name>       Print .env overrides for connecting to an instance

Examples:
  $0 setup feature-auth                    # Full setup
  source <(\$0 env feature-auth)            # Point your app at it
  pnpm dev                                  # Run app against isolated env
  $0 down feature-auth                     # Tear down

  $0 up feature-billing                    # Just containers (no migrations)
  eval "\$(\$0 env feature-billing)"         # Export env vars
  pnpm db:manage:migrate && pnpm db:run:migrate  # Manual migration
EOF
  exit 1
}

compose_cmd() {
  if docker compose version &>/dev/null; then
    echo "docker compose"
  elif docker-compose version &>/dev/null; then
    echo "docker-compose"
  else
    echo "Error: docker compose not found" >&2
    echo "Install Docker Desktop or docker-compose." >&2
    exit 1
  fi
}

# Preflight: check Docker is running
check_docker() {
  if ! docker info &>/dev/null 2>&1; then
    echo "Error: Docker is not running." >&2
    echo "Start Docker Desktop and try again." >&2
    exit 1
  fi
}

# Discover the host port Docker assigned to a service's container port.
discover_port() {
  local project="$1" service="$2" container_port="$3"
  local compose
  compose=$(compose_cmd)

  local result
  result=$($compose -p "$project" -f "$COMPOSE_FILE" port "$service" "$container_port" 2>/dev/null) || {
    echo "0"
    return
  }
  echo "${result##*:}"
}

# Wait for a service to become healthy (up to 60s)
wait_healthy() {
  local project="$1" service="$2"
  local compose
  compose=$(compose_cmd)
  local timeout=60
  local elapsed=0

  while [ $elapsed -lt $timeout ]; do
    local status
    status=$($compose -p "$project" -f "$COMPOSE_FILE" ps --format json "$service" 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    obj = json.loads(line)
    print(obj.get('Health', obj.get('health', 'unknown')))
    break
" 2>/dev/null) || status="unknown"

    if [ "$status" = "healthy" ]; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# Save instance state to JSON file for other commands to read.
save_state() {
  local name="$1" project="$2"

  local doltgres_port postgres_port spicedb_grpc_port spicedb_http_port spicedb_pg_port
  doltgres_port=$(discover_port "$project" "doltgres-db" "5432")
  postgres_port=$(discover_port "$project" "postgres-db" "5432")
  spicedb_grpc_port=$(discover_port "$project" "spicedb" "50051")
  spicedb_http_port=$(discover_port "$project" "spicedb" "8443")
  spicedb_pg_port=$(discover_port "$project" "spicedb-postgres" "5432")

  mkdir -p "$STATE_DIR"
  cat > "$STATE_DIR/${name}.json" <<EOF
{
  "name": "$name",
  "project": "$project",
  "ports": {
    "doltgres": $doltgres_port,
    "postgres": $postgres_port,
    "spicedb_grpc": $spicedb_grpc_port,
    "spicedb_http": $spicedb_http_port,
    "spicedb_pg": $spicedb_pg_port
  }
}
EOF

  echo "Ports assigned:"
  echo "  Doltgres (manage DB):  localhost:$doltgres_port"
  echo "  Postgres (runtime DB): localhost:$postgres_port"
  echo "  SpiceDB gRPC:          localhost:$spicedb_grpc_port"
  echo "  SpiceDB HTTP:          localhost:$spicedb_http_port"
}

cmd_up() {
  local name="$1"
  local project="agents-${name}"

  check_docker

  # Check if already running
  if [ -f "$STATE_DIR/${name}.json" ]; then
    echo "Environment '$name' already exists."
    echo "Use '$0 down $name' first, or '$0 env $name' to get connection info."
    exit 1
  fi

  local compose
  compose=$(compose_cmd)

  echo "Starting isolated environment: $name"
  echo "  Project: $project"
  echo ""

  COMPOSE_PROJECT_NAME="$project" $compose -f "$COMPOSE_FILE" up -d

  echo ""
  echo "Waiting for databases to become healthy..."

  local all_healthy=true
  for svc in doltgres-db postgres-db spicedb-postgres; do
    printf "  %-20s " "$svc"
    if wait_healthy "$project" "$svc"; then
      echo "✓ healthy"
    else
      echo "✗ timeout (may still be starting)"
      all_healthy=false
    fi
  done

  echo ""
  save_state "$name" "$project"

  echo ""
  echo "To connect your app, run:"
  echo "  source <($0 env $name)"
}

cmd_setup() {
  local name="$1"

  # Run 'up' first
  cmd_up "$name"

  echo ""
  echo "Running migrations..."

  # Source the env vars so pnpm commands use the isolated instance
  eval "$(cmd_env "$name")"

  echo "  Manage database migrations..."
  if pnpm db:manage:migrate 2>&1 | tail -1; then
    echo "  ✓ Manage migrations applied"
  else
    echo "  ✗ Manage migrations failed"
    return 1
  fi

  echo "  Runtime database migrations..."
  if pnpm db:run:migrate 2>&1 | tail -1; then
    echo "  ✓ Runtime migrations applied"
  else
    echo "  ✗ Runtime migrations failed"
    return 1
  fi

  echo ""
  echo "Initializing auth..."
  if pnpm db:auth:init 2>&1 | tail -3; then
    echo "  ✓ Auth initialized"
  else
    echo "  ✗ Auth init failed"
    return 1
  fi

  echo ""
  echo "=== Setup complete ==="
  echo ""
  echo "To use this environment:"
  echo "  source <($0 env $name)"
  echo "  pnpm dev"
}

cmd_down() {
  local name="$1"
  local project="agents-${name}"

  local compose
  compose=$(compose_cmd)

  # Check if state file exists
  if [ ! -f "$STATE_DIR/${name}.json" ]; then
    echo "Warning: No state file for '$name'. Attempting teardown anyway."
  fi

  echo "Stopping isolated environment: $name"

  COMPOSE_PROJECT_NAME="$project" $compose -f "$COMPOSE_FILE" down -v 2>&1

  rm -f "$STATE_DIR/${name}.json"
  echo "Environment '$name' removed (containers + volumes)."
}

cmd_status() {
  if [ ! -d "$STATE_DIR" ] || [ -z "$(ls -A "$STATE_DIR" 2>/dev/null)" ]; then
    echo "No isolated environments found."
    echo ""
    echo "Default environment (docker-compose.dbs.yml):"
    docker compose -f "$REPO_ROOT/docker-compose.dbs.yml" ps 2>/dev/null || echo "  Not running."
    return
  fi

  printf "%-20s %-25s %-10s %-10s %-10s\n" "NAME" "PROJECT" "DOLTGRES" "POSTGRES" "SPICEDB"
  printf "%-20s %-25s %-10s %-10s %-10s\n" "----" "-------" "--------" "--------" "-------"

  for state_file in "$STATE_DIR"/*.json; do
    [ -f "$state_file" ] || continue
    python3 - "$state_file" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
p = d['ports']
print(f"{d['name']:20s} {d['project']:25s} {p['doltgres']:<10} {p['postgres']:<10} {p['spicedb_grpc']:<10}")
PYEOF
  done
}

cmd_env() {
  local name="$1"
  local state_file="$STATE_DIR/${name}.json"

  if [ ! -f "$state_file" ]; then
    echo "# Error: environment '$name' not found. Run '$0 up $name' first." >&2
    exit 1
  fi

  python3 - "$state_file" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
p = d['ports']
print(f"export INKEEP_AGENTS_MANAGE_DATABASE_URL='postgresql://appuser:password@localhost:{p['doltgres']}/inkeep_agents'")
print(f"export INKEEP_AGENTS_RUN_DATABASE_URL='postgresql://appuser:password@localhost:{p['postgres']}/inkeep_agents'")
print(f"export SPICEDB_ENDPOINT='localhost:{p['spicedb_grpc']}'")
PYEOF
}

# --- Main ---

[ $# -lt 1 ] && usage

CMD="$1"
shift

case "$CMD" in
  up)
    [ $# -lt 1 ] && { echo "Error: 'up' requires a name"; usage; }
    cmd_up "$1"
    ;;
  setup)
    [ $# -lt 1 ] && { echo "Error: 'setup' requires a name"; usage; }
    cmd_setup "$1"
    ;;
  down)
    [ $# -lt 1 ] && { echo "Error: 'down' requires a name"; usage; }
    cmd_down "$1"
    ;;
  status)
    cmd_status
    ;;
  env)
    [ $# -lt 1 ] && { echo "Error: 'env' requires a name"; usage; }
    cmd_env "$1"
    ;;
  *)
    echo "Unknown command: $CMD"
    usage
    ;;
esac
