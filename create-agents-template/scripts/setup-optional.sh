#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
#
# Bootstrap shim — clones the companion repo and delegates to its setup script.
# The main logic lives at: https://github.com/inkeep/agents-optional-local-dev
#
# Usage:
#   sh scripts/setup-optional.sh              Start all optional services
#   sh scripts/setup-optional.sh --stop       Stop optional services
#   sh scripts/setup-optional.sh --status     Show status of optional services
#   sh scripts/setup-optional.sh --reset      Nuke data + re-setup from scratch
#   sh scripts/setup-optional.sh --no-update  Skip pulling latest companion changes
#
# Environment:
#   OPTIONAL_SERVICES_DIR  Override companion repo location (default: .optional-services/)

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPANION_DIR="${OPTIONAL_SERVICES_DIR:-$REPO_ROOT/.optional-services}"
COMPANION_SCRIPT="$COMPANION_DIR/scripts/setup.sh"

# Check if --no-update was passed (consumed here, passed through as no-op)
NO_UPDATE=0
for arg in "$@"; do [ "$arg" = "--no-update" ] && NO_UPDATE=1; done

# Ensure companion repo exists
if [ ! -d "$COMPANION_DIR" ]; then
  printf "Cloning optional services repository... "
  if git clone --quiet https://github.com/inkeep/agents-optional-local-dev.git "$COMPANION_DIR" 2>/dev/null; then
    echo "done."
  else
    echo "failed."
    [ -d "$COMPANION_DIR" ] && [ ! -d "$COMPANION_DIR/.git" ] && rm -rf "$COMPANION_DIR"
    printf '%b\n' "${RED}Check your internet connection and try again.${NC}"
    exit 1
  fi
elif [ "$NO_UPDATE" != "1" ]; then
  if ! git -C "$COMPANION_DIR" pull --ff-only origin main >/dev/null 2>&1; then
    printf '%b\n' "${YELLOW}Note: Could not update companion repo (local changes?). Continuing...${NC}"
  fi
fi

# Verify companion script exists (handles pre-migration clones)
if [ ! -f "$COMPANION_SCRIPT" ]; then
  printf '%b\n' "${RED}Error: $COMPANION_SCRIPT not found.${NC}"
  echo "  Your companion repo may be outdated. Try: cd $COMPANION_DIR && git pull"
  exit 1
fi

# Delegate to companion repo's setup script
export CALLER_ENV_FILE="$REPO_ROOT/.env"
export COMPANION_DIR
exec bash "$COMPANION_SCRIPT" "$@"
