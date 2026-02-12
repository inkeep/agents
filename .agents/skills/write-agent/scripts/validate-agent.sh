#!/bin/bash
# Agent File Validator (Minimal)
# Validates agent markdown files for correct structure
# Focuses on fields that cause silent failures if missing

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <path/to/agent.md>"
  echo ""
  echo "Validates agent file for:"
  echo "  - YAML frontmatter structure"
  echo "  - Required fields (name, description)"
  echo "  - Example blocks in description (warning only)"
  exit 1
fi

AGENT_FILE="$1"

echo "🔍 Validating: $AGENT_FILE"
echo ""

# Check: File exists
if [ ! -f "$AGENT_FILE" ]; then
  echo "❌ File not found: $AGENT_FILE"
  exit 1
fi

# Check: Starts with ---
FIRST_LINE=$(head -1 "$AGENT_FILE")
if [ "$FIRST_LINE" != "---" ]; then
  echo "❌ File must start with YAML frontmatter (---)"
  exit 1
fi
echo "✅ Frontmatter opens"

# Check: Has closing ---
if ! tail -n +2 "$AGENT_FILE" | grep -q '^---$'; then
  echo "❌ Frontmatter not closed (missing second ---)"
  exit 1
fi
echo "✅ Frontmatter closes"

# Extract frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$AGENT_FILE")

error_count=0
warning_count=0

# Check: name field
NAME=$(echo "$FRONTMATTER" | grep '^name:' | sed 's/name: *//' | sed 's/^"\(.*\)"$/\1/' || true)

if [ -z "$NAME" ]; then
  echo "❌ Missing required field: name"
  ((error_count++))
else
  echo "✅ name: $NAME"
fi

# Check: description field
DESCRIPTION=$(echo "$FRONTMATTER" | grep '^description:' | sed 's/description: *//' || true)

if [ -z "$DESCRIPTION" ]; then
  echo "❌ Missing required field: description"
  ((error_count++))
else
  echo "✅ description: present"

  # Check for example blocks (warning only)
  if ! echo "$FRONTMATTER" | grep -q '<example>'; then
    echo "⚠️  No <example> blocks in description (routing may be unreliable)"
    ((warning_count++))
  else
    example_count=$(echo "$FRONTMATTER" | grep -c '<example>' || true)
    echo "✅ <example> blocks: $example_count"
  fi
fi

# Check: System prompt exists (content after frontmatter)
SYSTEM_PROMPT=$(awk '/^---$/{i++; next} i>=2' "$AGENT_FILE")

if [ -z "$SYSTEM_PROMPT" ]; then
  echo "❌ System prompt is empty (nothing after frontmatter)"
  ((error_count++))
else
  prompt_length=${#SYSTEM_PROMPT}
  echo "✅ System prompt: $prompt_length characters"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $error_count -eq 0 ] && [ $warning_count -eq 0 ]; then
  echo "✅ All checks passed"
  exit 0
elif [ $error_count -eq 0 ]; then
  echo "⚠️  Passed with $warning_count warning(s)"
  exit 0
else
  echo "❌ Failed with $error_count error(s)"
  exit 1
fi
