#!/bin/bash
set -e

# Ralph Loop for Claude Code
# Runs Claude iteratively until PRD is complete or max iterations reached

MAX_ITERATIONS="${1:-10}"
PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
PROMPT_FILE="${2:-.ai-dev/ralph-prompt.md}"
LAST_BRANCH_FILE=".ralph-last-branch"
ARCHIVE_DIR=".ralph-archives"
PROTECTED_BRANCHES="main master"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🐕 Ralph Loop for Claude Code${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Get current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# === BRANCH SAFETY CHECK ===
for protected in $PROTECTED_BRANCHES; do
    if [[ "$CURRENT_BRANCH" == "$protected" ]]; then
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}  ❌ ERROR: Cannot run Ralph on '$CURRENT_BRANCH' branch!${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "Ralph must run on a feature branch to protect your main branch."
        echo ""
        echo "Options:"
        echo ""
        echo "  1. Create branch from PRD (if prd.json has 'branch' field):"
        echo -e "     ${YELLOW}.ai-dev/ralph.sh --create-branch${NC}"
        echo ""
        echo "  2. Create branch manually:"
        echo -e "     ${YELLOW}git checkout -b feature/my-feature${NC}"
        echo -e "     ${YELLOW}.ai-dev/ralph.sh${NC}"
        echo ""
        exit 1
    fi
done

# === CREATE BRANCH FROM PRD ===
if [[ "${1}" == "--create-branch" ]] || [[ "${1}" == "-b" ]]; then
    if [[ ! -f "$PRD_FILE" ]]; then
        echo -e "${RED}Error: No prd.json found. Create one first.${NC}"
        echo "  cp .ai-dev/prd-template.json prd.json"
        exit 1
    fi

    # Extract branch name from PRD
    if command -v jq &> /dev/null; then
        PRD_BRANCH=$(jq -r '.branch // empty' "$PRD_FILE")
    else
        # Fallback: grep for branch field
        PRD_BRANCH=$(grep -o '"branch"[[:space:]]*:[[:space:]]*"[^"]*"' "$PRD_FILE" | sed 's/.*: *"\([^"]*\)"/\1/')
    fi

    if [[ -z "$PRD_BRANCH" ]]; then
        echo -e "${RED}Error: No 'branch' field in prd.json${NC}"
        echo "Add a branch field to your PRD:"
        echo '  "branch": "feature/my-feature"'
        exit 1
    fi

    echo -e "${YELLOW}Creating branch from PRD: $PRD_BRANCH${NC}"

    # Check if branch exists
    if git show-ref --verify --quiet "refs/heads/$PRD_BRANCH"; then
        echo -e "${YELLOW}Branch exists, checking out...${NC}"
        git checkout "$PRD_BRANCH"
    else
        echo -e "${GREEN}Creating new branch...${NC}"
        git checkout -b "$PRD_BRANCH"
    fi

    CURRENT_BRANCH="$PRD_BRANCH"

    # Shift args so $1 becomes max_iterations again
    shift
    MAX_ITERATIONS="${1:-10}"
fi

echo -e "${YELLOW}Branch:${NC} $CURRENT_BRANCH"
echo -e "${YELLOW}Max iterations:${NC} $MAX_ITERATIONS"
echo -e "${YELLOW}PRD file:${NC} $PRD_FILE"
echo -e "${YELLOW}Prompt file:${NC} $PROMPT_FILE"
echo ""

# Check for required files
if [[ ! -f "$PROMPT_FILE" ]]; then
    echo -e "${RED}Error: Prompt file not found: $PROMPT_FILE${NC}"
    echo "Create a prompt file or specify one: ./ralph.sh 10 /path/to/prompt.md"
    exit 1
fi

if [[ ! -f "$PRD_FILE" ]]; then
    echo -e "${RED}Error: PRD file not found: $PRD_FILE${NC}"
    echo "Create a PRD first:"
    echo "  cp .ai-dev/prd-template.json prd.json"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    echo "Ralph will commit its own changes. Consider committing or stashing first."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Archive previous run if branch changed
if [[ -f "$LAST_BRANCH_FILE" ]]; then
    LAST_BRANCH=$(cat "$LAST_BRANCH_FILE")
    if [[ "$LAST_BRANCH" != "$CURRENT_BRANCH" ]]; then
        echo -e "${YELLOW}Branch changed from '$LAST_BRANCH' to '$CURRENT_BRANCH'${NC}"
        if [[ -f "$PROGRESS_FILE" ]]; then
            mkdir -p "$ARCHIVE_DIR"
            ARCHIVE_NAME="${LAST_BRANCH//\//-}"  # Replace / with -
            TIMESTAMP=$(date +%Y%m%d-%H%M%S)
            mv "$PROGRESS_FILE" "$ARCHIVE_DIR/progress-${ARCHIVE_NAME}-${TIMESTAMP}.txt"
            echo -e "${GREEN}Archived previous progress to $ARCHIVE_DIR/${NC}"
        fi
    fi
fi

# Save current branch
echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"

# Initialize progress file if needed
if [[ ! -f "$PROGRESS_FILE" ]]; then
    echo "# Progress Log - $CURRENT_BRANCH" > "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
fi

# Main loop
for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Iteration $i of $MAX_ITERATIONS${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Record iteration start in progress
    echo "## Iteration $i - $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"

    # Run Claude with the prompt
    # --dangerously-skip-permissions skips confirmation prompts
    # --print sends output to stdout as well
    OUTPUT=$(claude --dangerously-skip-permissions --print -p "$(cat "$PROMPT_FILE")" 2>&1) || true

    echo "$OUTPUT"

    # Check for completion signal
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  ✅ PRD COMPLETE! All stories passing.${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo "" >> "$PROGRESS_FILE"
        echo "## COMPLETED - $(date)" >> "$PROGRESS_FILE"
        echo ""
        echo "Next steps:"
        echo "  1. Review changes: git log --oneline $CURRENT_BRANCH"
        echo "  2. Push from host:  git push origin $CURRENT_BRANCH"
        echo "  3. Create PR"
        exit 0
    fi

    echo "" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"

    # Brief pause between iterations
    sleep 2
done

echo ""
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}  ⚠️  Max iterations reached without completion${NC}"
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "The PRD is not complete. Options:"
echo "  1. Continue with more iterations: .ai-dev/ralph.sh 20"
echo "  2. Check progress.txt for blockers"
echo "  3. Manually complete remaining stories"
exit 1
