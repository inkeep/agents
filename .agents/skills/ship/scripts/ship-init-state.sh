#!/bin/bash

# ship-init-state.sh — Initialize ship execution state files deterministically.
#
# Creates:
#   tmp/ship/state.json  — workflow state (phases, feature, spec, capabilities)
#   tmp/ship/loop.md     — loop control (activates stop hook for autonomous execution)
#
# Usage:
#   ship-init-state.sh \
#     --feature <name> --spec <path> --branch <branch> \
#     [--worktree <path>] [--scope <feature|enhancement|bugfix>] \
#     [--test-cmd <cmd>] [--typecheck-cmd <cmd>] [--lint-cmd <cmd>] \
#     [--gh <true|false>] [--browser <true|false>] \
#     [--peekaboo <true|false>] [--docker <true|false>] \
#     [--max-iterations <N>]
#
# Requires: jq

set -euo pipefail

# --- Ship directory (configurable via CLAUDE_SHIP_DIR env var) ---
SHIP_DIR="${CLAUDE_SHIP_DIR:-tmp/ship}"

# --- Defaults ---
FEATURE_NAME=""
SPEC_PATH=""
BRANCH=""
WORKTREE_PATH=""
SCOPE="feature"
QG_TEST=""
QG_TYPECHECK=""
QG_LINT=""
CAP_GH=true
CAP_BROWSER=false
CAP_PEEKABOO=false
CAP_DOCKER=false
MAX_ITERATIONS=20

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature)        FEATURE_NAME="$2"; shift 2 ;;
    --spec)           SPEC_PATH="$2"; shift 2 ;;
    --branch)         BRANCH="$2"; shift 2 ;;
    --worktree)       WORKTREE_PATH="$2"; shift 2 ;;
    --scope)          SCOPE="$2"; shift 2 ;;
    --test-cmd)       QG_TEST="$2"; shift 2 ;;
    --typecheck-cmd)  QG_TYPECHECK="$2"; shift 2 ;;
    --lint-cmd)       QG_LINT="$2"; shift 2 ;;
    --gh)             CAP_GH="$2"; shift 2 ;;
    --browser)        CAP_BROWSER="$2"; shift 2 ;;
    --peekaboo)       CAP_PEEKABOO="$2"; shift 2 ;;
    --docker)         CAP_DOCKER="$2"; shift 2 ;;
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    *) echo "Error: Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Validate required fields ---
ERRORS=()
[[ -z "$FEATURE_NAME" ]] && ERRORS+=("--feature is required")
[[ -z "$SPEC_PATH" ]]    && ERRORS+=("--spec is required")
[[ -z "$BRANCH" ]]       && ERRORS+=("--branch is required")

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "Error: Missing required arguments:" >&2
  for err in "${ERRORS[@]}"; do
    echo "  - $err" >&2
  done
  echo "" >&2
  echo "Usage: ship-init-state.sh --feature <name> --spec <path> --branch <branch> [options]" >&2
  exit 1
fi

# --- Validate jq is available ---
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not found" >&2
  exit 1
fi

# --- Validate scope ---
case "$SCOPE" in
  feature|enhancement|bugfix) ;;
  *) echo "Error: --scope must be one of: feature, enhancement, bugfix (got: '$SCOPE')" >&2; exit 1 ;;
esac

# --- Validate max-iterations is numeric ---
if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "Error: --max-iterations must be a positive integer (got: '$MAX_ITERATIONS')" >&2
  exit 1
fi

# --- Validate boolean capability flags ---
for flag_name in gh browser peekaboo docker; do
  eval "flag_val=\$CAP_$(echo "$flag_name" | tr '[:lower:]' '[:upper:]')"
  if [[ "$flag_val" != "true" && "$flag_val" != "false" ]]; then
    echo "Error: --$flag_name must be true or false (got: '$flag_val')" >&2
    exit 1
  fi
done

# --- Create directory ---
mkdir -p "$SHIP_DIR"

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Write state.json using jq for safe JSON construction ---
jq -n \
  --arg feature "$FEATURE_NAME" \
  --arg spec "$SPEC_PATH" \
  --arg branch "$BRANCH" \
  --arg worktree "$WORKTREE_PATH" \
  --arg scope "$SCOPE" \
  --arg qgTest "$QG_TEST" \
  --arg qgTypecheck "$QG_TYPECHECK" \
  --arg qgLint "$QG_LINT" \
  --argjson capGh "$CAP_GH" \
  --argjson capBrowser "$CAP_BROWSER" \
  --argjson capPeekaboo "$CAP_PEEKABOO" \
  --argjson capDocker "$CAP_DOCKER" \
  --arg now "$NOW" \
  '{
    currentPhase: "Phase 2",
    featureName: $feature,
    specPath: $spec,
    specJsonPath: "'"$SHIP_DIR"'/spec.json",
    branch: $branch,
    worktreePath: (if $worktree == "" then null else $worktree end),
    prNumber: null,
    qualityGates: {
      test: $qgTest,
      typecheck: $qgTypecheck,
      lint: $qgLint
    },
    completedPhases: ["Phase 0", "Phase 1"],
    capabilities: {
      gh: $capGh,
      browser: $capBrowser,
      peekaboo: $capPeekaboo,
      docker: $capDocker
    },
    scopeCalibration: $scope,
    amendments: [],
    lastUpdated: $now
  }' > "$SHIP_DIR/state.json"

# --- Write loop.md ---
cat > "$SHIP_DIR/loop.md" << EOF
---
active: true
iteration: 1
max_iterations: ${MAX_ITERATIONS}
completion_promise: "SHIP COMPLETE"
started_at: "${NOW}"
---
EOF

# --- Confirmation ---
echo "Ship state initialized:"
echo "  state.json: $SHIP_DIR/state.json"
echo "  loop.md:    $SHIP_DIR/loop.md"
echo "  Feature:    $FEATURE_NAME"
echo "  Branch:     $BRANCH"
echo "  Spec:       $SPEC_PATH"
echo "  Scope:      $SCOPE"
