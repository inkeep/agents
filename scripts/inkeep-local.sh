#!/usr/bin/env bash

# Context-aware local inkeep CLI wrapper
# This script finds and uses the local agents-cli from the current directory tree

set -e

# Function to find the agents-cli in current directory tree
find_local_cli() {
  local search_dir=$(pwd)
  
  while [[ "$search_dir" != "/" ]]; do
    # Check if agents-cli/dist/index.js exists
    if [[ -f "$search_dir/agents-cli/dist/index.js" ]]; then
      echo "$search_dir/agents-cli/dist/index.js"
      return 0
    fi
    
    # Check if we're directly in agents-cli directory
    if [[ -f "$search_dir/dist/index.js" && -f "$search_dir/package.json" ]]; then
      if grep -q '"name": "@inkeep/agents-cli"' "$search_dir/package.json" 2>/dev/null; then
        echo "$search_dir/dist/index.js"
        return 0
      fi
    fi
    
    # Move up one directory
    search_dir=$(dirname "$search_dir")
  done
  
  return 1
}

# Main execution
main() {
  # Set default environment if not already set
  : ${ENVIRONMENT:=development}
  export ENVIRONMENT
  
  # Try to find local CLI
  if cli_path=$(find_local_cli); then
    echo "Using local CLI from: $(dirname $(dirname $cli_path))" >&2
    exec node "$cli_path" "$@"
  else
    echo "No local agents-cli found in current directory tree" >&2
    echo "To use the published version, run: ENVIRONMENT=production inkeep" >&2
    exit 1
  fi
}

main "$@"