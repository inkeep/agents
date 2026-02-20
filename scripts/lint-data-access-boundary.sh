#!/usr/bin/env bash
# Enforces that drizzle-orm imports only appear in allowed directories.
# Designed to run via lint-staged on staged files only.
#
# Usage: scripts/lint-data-access-boundary.sh file1.ts file2.ts ...

set -euo pipefail

VIOLATIONS=()

for file in "$@"; do
  # Skip allowed directories
  case "$file" in
    */data-access/* | */db/* | */dolt/* | */__tests__/* | *.test.ts | *.spec.ts | */test-*)
      continue
      ;;
  esac

  # Check for drizzle-orm imports
  if grep -qE "from ['\"]drizzle-orm" "$file" 2>/dev/null; then
    VIOLATIONS+=("$file")
  fi
done

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo ""
  echo "ERROR: drizzle-orm imports found outside the data-access layer:"
  echo ""
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v"
  done
  echo ""
  echo "Move database queries to packages/agents-core/src/data-access/ and import"
  echo "the data-access functions instead. See CLAUDE.md for architecture guidelines."
  echo ""
  exit 1
fi
