#!/bin/bash
set -e

# Implement Iteration Loop
# Spawns independent Claude Code processes to implement user stories from spec.json.
# Each iteration is a fresh process with no memory — state persists via files and git.

# --- Ship directory (configurable via CLAUDE_SHIP_DIR env var) ---
SHIP_DIR="${CLAUDE_SHIP_DIR:-tmp/ship}"

# --- Defaults ---
MAX_ITERATIONS=10
MAX_TURNS=75
PROMPT_FILE="$SHIP_DIR/implement-prompt.md"
SPEC_FILE="$SHIP_DIR/spec.json"
PROGRESS_FILE="$SHIP_DIR/progress.txt"
FORCE=false
PROTECTED_BRANCHES="main master"

# --- Script paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-spec.ts"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- Usage ---
usage() {
    echo "Usage: implement.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --max-iterations N   Max iteration loops (default: 10)"
    echo "  --max-turns N        Max agentic turns per iteration (default: 75)"
    echo "  --prompt FILE        Prompt file path (default: tmp/ship/implement-prompt.md)"
    echo "  --spec FILE          Spec JSON file path (default: tmp/ship/spec.json)"
    echo "  --force              Skip uncommitted changes prompt"
    echo "  --create-branch, -b  Create/checkout branch from spec.json branchName"
    echo "  -h, --help           Show this help"
    exit 0
}

# --- Parse arguments ---
CREATE_BRANCH=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
        --max-turns) MAX_TURNS="$2"; shift 2 ;;
        --prompt) PROMPT_FILE="$2"; shift 2 ;;
        --spec) SPEC_FILE="$2"; shift 2 ;;
        --force) FORCE=true; shift ;;
        --create-branch|-b) CREATE_BRANCH=true; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Implement Iteration Loop${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# --- Get current branch ---
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# --- Branch safety check ---
for protected in $PROTECTED_BRANCHES; do
    if [[ "$CURRENT_BRANCH" == "$protected" ]]; then
        echo -e "${RED}Error: Cannot run on '$CURRENT_BRANCH' branch.${NC}"
        echo ""
        echo "Options:"
        echo "  1. Create branch from spec.json: implement.sh --create-branch"
        echo "  2. Create branch manually:      git checkout -b feat/my-feature"
        exit 1
    fi
done

# --- Create branch from spec.json ---
if [[ "$CREATE_BRANCH" == true ]]; then
    if [[ ! -f "$SPEC_FILE" ]]; then
        echo -e "${RED}Error: $SPEC_FILE not found. Cannot create branch.${NC}"
        exit 1
    fi

    if command -v jq &> /dev/null; then
        SPEC_BRANCH=$(jq -r '.branchName // empty' "$SPEC_FILE")
    else
        SPEC_BRANCH=$(grep -o '"branchName"[[:space:]]*:[[:space:]]*"[^"]*"' "$SPEC_FILE" | sed 's/.*: *"\([^"]*\)"/\1/')
    fi

    if [[ -z "$SPEC_BRANCH" ]]; then
        echo -e "${RED}Error: No 'branchName' field in $SPEC_FILE${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Creating branch: $SPEC_BRANCH${NC}"
    if git show-ref --verify --quiet "refs/heads/$SPEC_BRANCH"; then
        git checkout "$SPEC_BRANCH"
    else
        git checkout -b "$SPEC_BRANCH"
    fi
    CURRENT_BRANCH="$SPEC_BRANCH"

    # Warn if progress.txt references a different branch (stale from a previous feature).
    if [[ -f "$PROGRESS_FILE" ]]; then
        PROGRESS_BRANCH=$(head -1 "$PROGRESS_FILE" | sed -n 's/^# Progress Log - //p')
        if [[ -n "$PROGRESS_BRANCH" && "$PROGRESS_BRANCH" != "$CURRENT_BRANCH" ]]; then
            echo -e "${YELLOW}Warning: $PROGRESS_FILE references branch '$PROGRESS_BRANCH' (current: '$CURRENT_BRANCH').${NC}"
            echo -e "${YELLOW}Consider archiving it before continuing. Use /implement Phase 1 for full archiving.${NC}"
        fi
    fi
fi

echo -e "${YELLOW}Branch:${NC}          $CURRENT_BRANCH"
echo -e "${YELLOW}Max iterations:${NC}  $MAX_ITERATIONS"
echo -e "${YELLOW}Max turns:${NC}       $MAX_TURNS"
echo -e "${YELLOW}Prompt:${NC}          $PROMPT_FILE"
echo -e "${YELLOW}Spec JSON:${NC}       $SPEC_FILE"
echo ""

# --- Check required files ---
if [[ ! -f "$PROMPT_FILE" ]]; then
    echo -e "${RED}Error: Prompt file not found: $PROMPT_FILE${NC}"
    echo "Run /implement to generate the implementation prompt first."
    exit 1
fi

if [[ ! -f "$SPEC_FILE" ]]; then
    echo -e "${RED}Error: Spec JSON file not found: $SPEC_FILE${NC}"
    echo "Run /implement to generate spec.json first."
    exit 1
fi

# --- Check for uncommitted changes ---
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    if [[ "$FORCE" == true ]]; then
        echo -e "${YELLOW}Warning: Uncommitted changes detected (continuing with --force)${NC}"
    else
        echo -e "${YELLOW}Warning: You have uncommitted changes.${NC}"
        echo "The implement loop commits its own changes. Consider committing or stashing first."
        echo "Use --force to skip this check."
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# --- Initialize progress file ---
if [[ ! -f "$PROGRESS_FILE" ]]; then
    echo "# Progress Log - $CURRENT_BRANCH" > "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
fi

# --- Main iteration loop ---
for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Iteration $i of $MAX_ITERATIONS${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo "## Iteration $i - $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"

    OUTPUT_FILE=$(mktemp)

    # Spawn a fresh Claude Code process for this iteration.
    # env -u: unset vars that prevent nested Claude Code sessions.
    # -p: non-interactive mode (prompt from file).
    # --dangerously-skip-permissions: no TTY for confirmation in -p mode.
    # --max-turns: prevent runaway iterations.
    # --output-format json: structured output for completion detection.
    env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude \
        -p "$(cat "$PROMPT_FILE")" \
        --dangerously-skip-permissions \
        --max-turns "$MAX_TURNS" \
        --output-format json \
        2>&1 | tee "$OUTPUT_FILE" || true

    # --- Post-iteration status ---
    TOTAL_STORIES=0
    PASSING_STORIES=0
    if command -v jq &> /dev/null; then
        TOTAL_STORIES=$(jq '.userStories | length' "$SPEC_FILE" 2>/dev/null || echo "0")
        PASSING_STORIES=$(jq '[.userStories[] | select(.passes == true)] | length' "$SPEC_FILE" 2>/dev/null || echo "0")
    else
        TOTAL_STORIES=$(grep -c '"id"' "$SPEC_FILE" 2>/dev/null || echo "0")
        PASSING_STORIES=$(grep -c '"passes"[[:space:]]*:[[:space:]]*true' "$SPEC_FILE" 2>/dev/null || echo "0")
    fi
    echo ""
    echo -e "${GREEN}Iteration $i complete. Stories: $PASSING_STORIES/$TOTAL_STORIES passing.${NC}"

    # --- Optional: validate spec.json integrity after iteration ---
    if command -v bun &> /dev/null && [[ -f "$VALIDATE_SCRIPT" ]]; then
        if ! bun "$VALIDATE_SCRIPT" "$SPEC_FILE" >/dev/null; then
            echo -e "${YELLOW}Warning: spec.json validation issue detected after iteration $i.${NC}"
            echo "spec.json validation warning after iteration $i" >> "$PROGRESS_FILE"
            echo "" >> "$PROGRESS_FILE"
        fi
    fi

    # Check for completion signal.
    # The iteration agent outputs <promise>IMPLEMENTATION COMPLETE</promise> when all stories pass.
    if grep -q "IMPLEMENTATION COMPLETE" "$OUTPUT_FILE"; then
        # Verify spec.json actually has all stories complete.
        # Prevents premature exit from false completion signals.
        INCOMPLETE=0
        if command -v jq &> /dev/null; then
            INCOMPLETE=$(jq '[.userStories[] | select(.passes == false)] | length' "$SPEC_FILE" 2>/dev/null || echo "0")
        else
            INCOMPLETE=$(grep -c '"passes"[[:space:]]*:[[:space:]]*false' "$SPEC_FILE" 2>/dev/null || echo "0")
        fi

        if [[ "$INCOMPLETE" -gt 0 ]]; then
            echo -e "${YELLOW}Warning: Completion signal detected but $INCOMPLETE stories still incomplete.${NC}"
            echo -e "${YELLOW}Continuing iteration...${NC}"
            echo "Warning: false completion signal — $INCOMPLETE stories still at passes: false" >> "$PROGRESS_FILE"
            echo "" >> "$PROGRESS_FILE"
            rm -f "$OUTPUT_FILE"
            sleep 2
            continue
        fi

        rm -f "$OUTPUT_FILE"
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  All stories complete.${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo "" >> "$PROGRESS_FILE"
        echo "## COMPLETED - $(date)" >> "$PROGRESS_FILE"
        echo ""
        echo "Next steps:"
        echo "  1. Review: git log --oneline"
        echo "  2. Push:   git push origin $CURRENT_BRANCH"
        echo "  3. Create PR"
        exit 0
    fi

    rm -f "$OUTPUT_FILE"

    echo "" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"

    sleep 2
done

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Max iterations reached ($MAX_ITERATIONS).${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Check $SHIP_DIR/spec.json for incomplete stories and $SHIP_DIR/progress.txt for blockers."
exit 1
