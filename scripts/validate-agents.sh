#!/usr/bin/env bash
# Validates YAML frontmatter in all Claude Code agent definition files.
# Catches broken frontmatter that silently prevents agent discovery at runtime.
#
# Usage: ./scripts/validate-agents.sh
# Exit code: 0 if all valid, 1 if any fail

set -euo pipefail

AGENTS_DIR=".claude/agents"
FAIL=0
TOTAL=0

if [ ! -d "$AGENTS_DIR" ]; then
  echo "No agents directory found at $AGENTS_DIR"
  exit 0
fi

for file in "$AGENTS_DIR"/*.md; do
  [ -f "$file" ] || continue
  TOTAL=$((TOTAL + 1))

  result=$(python3 -c "
import sys, yaml

with open('$file') as f:
    content = f.read()

parts = content.split('---', 2)
if len(parts) < 3:
    print('ERROR: no YAML frontmatter delimiters (---) found')
    sys.exit(1)

try:
    data = yaml.safe_load(parts[1])
except yaml.YAMLError as e:
    # Extract useful context from the error
    print(f'ERROR: invalid YAML frontmatter: {e}')
    sys.exit(1)

if not isinstance(data, dict):
    print(f'ERROR: frontmatter parsed as {type(data).__name__}, expected mapping')
    sys.exit(1)

if 'name' not in data:
    print('ERROR: missing required \"name\" field')
    sys.exit(1)

if 'description' not in data:
    print('ERROR: missing required \"description\" field')
    sys.exit(1)

name = data['name']
expected_name = '$(basename "$file" .md)'
if name != expected_name:
    print(f'WARNING: name \"{name}\" does not match filename \"{expected_name}\"')

print('OK')
" 2>&1)

  if echo "$result" | grep -q "^ERROR"; then
    echo "FAIL $file: $result"
    FAIL=$((FAIL + 1))
  elif echo "$result" | grep -q "^WARNING"; then
    echo "WARN $file: $result"
  fi
done

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "FAILED: $FAIL of $TOTAL agent files have invalid frontmatter"
  echo ""
  echo "Common fix: ensure all content inside 'description: |' is indented by at least 2 spaces."
  echo "Lines at column 0 (like <example>, <commentary>) break the YAML block scalar."
  exit 1
else
  echo "All $TOTAL agent files have valid frontmatter"
  exit 0
fi
