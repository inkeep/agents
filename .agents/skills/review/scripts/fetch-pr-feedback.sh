#!/usr/bin/env bash
# fetch-pr-feedback.sh — Fetch all PR feedback data for the review iteration loop.
#
# Fetches three types of GitHub PR feedback + CI/CD status:
#   1. Reviews (body + state: APPROVED/CHANGES_REQUESTED/COMMENTED)
#   2. Inline review comments (line-specific, includes suggestion blocks)
#   3. Issue-level comments (general PR discussion thread)
#   4. CI/CD check status
#
# Why this script exists:
#   - `gh pr view --comments` and `--json comments` miss inline review comments
#   - `gh pr view --json reviews` returns review bodies but not line comments
#   - The agent frequently reaches for deprecated/incomplete commands without this
#
# Usage:
#   ./fetch-pr-feedback.sh <pr-number> [--repo owner/repo] [--reviews-only] [--checks-only]
#
# Options:
#   --repo owner/repo    Explicit repo (default: inferred from git remote)
#   --reviews-only       Only fetch review data (skip CI/CD checks)
#   --checks-only        Only fetch CI/CD check status
#   --since DATETIME     Only show comments after this ISO timestamp (e.g., 2025-01-01T00:00:00Z)
#
# Output: Structured markdown to stdout, suitable for agent consumption.

set -euo pipefail

# --- Argument parsing ---
PR_NUMBER=""
REPO=""
REVIEWS_ONLY=false
CHECKS_ONLY=false
SINCE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --reviews-only)
      REVIEWS_ONLY=true
      shift
      ;;
    --checks-only)
      CHECKS_ONLY=true
      shift
      ;;
    --since)
      SINCE="$2"
      shift 2
      ;;
    -h|--help)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *)
      if [[ -z "$PR_NUMBER" ]]; then
        PR_NUMBER="$1"
      else
        echo "Error: unexpected argument '$1'" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$PR_NUMBER" ]]; then
  echo "Error: PR number required. Usage: $0 <pr-number> [--repo owner/repo]" >&2
  exit 1
fi

# Infer repo from git remote if not specified
if [[ -z "$REPO" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || true)
  if [[ -z "$REPO" ]]; then
    echo "Error: Could not infer repo. Use --repo owner/repo or run from a git directory." >&2
    exit 1
  fi
fi

OWNER="${REPO%%/*}"
REPO_NAME="${REPO##*/}"

# --- Helper: filter by --since if set ---
filter_since() {
  if [[ -n "$SINCE" ]]; then
    jq --arg since "$SINCE" '[.[] | select(.created_at > $since or .updated_at > $since)]'
  else
    cat
  fi
}

# --- Section 1: Reviews ---
fetch_reviews() {
  echo "## Reviews"
  echo ""

  local reviews
  reviews=$(gh api "repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/reviews" --paginate 2>/dev/null || echo "[]")

  local count
  count=$(echo "$reviews" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    echo "_No reviews yet._"
    echo ""
    return
  fi

  echo "$reviews" | jq -r '.[] | "### Review by \(.user.login) — \(.state)\n_Submitted: \(.submitted_at)_\n\n\(.body // "_No review body._")\n\n---\n"'
}

# --- Section 2: Inline review comments ---
fetch_inline_comments() {
  echo "## Inline Review Comments"
  echo ""

  local comments
  comments=$(gh api "repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/comments" --paginate 2>/dev/null | filter_since || echo "[]")

  local count
  count=$(echo "$comments" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    echo "_No inline review comments._"
    echo ""
    return
  fi

  echo "**${count} inline comment(s)**"
  echo ""

  # Group by file path for readability
  echo "$comments" | jq -r '
    group_by(.path) | .[] |
    "### \(.[0].path)\n" +
    ([.[] |
      "**Line \(.line // .original_line // "?")** by \(.user.login) (\(.created_at))" +
      (if .in_reply_to_id then " _(reply)_" else "" end) +
      "\n\(.body)\n"
    ] | join("\n---\n")) +
    "\n"
  '
}

# --- Section 3: Review threads (GraphQL — includes thread node IDs for resolution) ---
fetch_review_threads() {
  echo "## Review Threads"
  echo ""

  local query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:1){nodes{body author{login}}}}}}}}'

  local result
  result=$(gh api graphql \
    -f query="$query" \
    -f owner="$OWNER" \
    -f repo="$REPO_NAME" \
    -F pr="$PR_NUMBER" \
    2>/dev/null || echo "")

  if [[ -z "$result" ]]; then
    echo "_Could not fetch review threads via GraphQL._"
    echo ""
    return
  fi

  local threads
  threads=$(echo "$result" | jq '.data.repository.pullRequest.reviewThreads.nodes // []')

  local total unresolved_count
  total=$(echo "$threads" | jq 'length')
  unresolved_count=$(echo "$threads" | jq '[.[] | select(.isResolved == false)] | length')

  if [[ "$total" -eq 0 ]]; then
    echo "_No review threads._"
    echo ""
    return
  fi

  echo "**${unresolved_count} unresolved** of ${total} total thread(s)"
  echo ""

  # Show unresolved threads with their node IDs (needed for resolveReviewThread mutation)
  echo "$threads" | jq -r '
    [.[] | select(.isResolved == false)] | .[] |
    "- **\(.path):\(.line // "?")** by \(.comments.nodes[0].author.login // "unknown") — thread_id: `\(.id)`" +
    (if .isOutdated then " _(outdated)_" else "" end) +
    "\n  > \(.comments.nodes[0].body | split("\n")[0] | if length > 120 then .[:120] + "..." else . end)\n"
  '

  # Note resolved threads
  local resolved_count
  resolved_count=$(echo "$threads" | jq '[.[] | select(.isResolved == true)] | length')
  if [[ "$resolved_count" -gt 0 ]]; then
    echo "_${resolved_count} resolved thread(s) not shown._"
    echo ""
  fi
}

# --- Section 4: Issue-level comments ---
fetch_issue_comments() {
  echo "## PR Discussion Comments"
  echo ""

  local comments
  comments=$(gh api "repos/${OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments" --paginate 2>/dev/null | filter_since || echo "[]")

  local count
  count=$(echo "$comments" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    echo "_No discussion comments._"
    echo ""
    return
  fi

  echo "**${count} comment(s)**"
  echo ""

  echo "$comments" | jq -r '.[] | "### \(.user.login) (\(.created_at))\n\(.body)\n\n---\n"'
}

# --- Section 5: CI/CD checks ---
fetch_checks() {
  echo "## CI/CD Status"
  echo ""

  local checks
  checks=$(gh pr checks "$PR_NUMBER" --repo "${OWNER}/${REPO_NAME}" 2>/dev/null || echo "")

  if [[ -z "$checks" ]]; then
    echo "_No checks available yet._"
    echo ""
    return
  fi

  echo '```'
  echo "$checks"
  echo '```'
  echo ""

  # Summary counts
  local pass_count fail_count pending_count
  pass_count=$(echo "$checks" | grep -c "pass" || true)
  fail_count=$(echo "$checks" | grep -c "fail" || true)
  pending_count=$(echo "$checks" | grep -c "pending\|queued\|in_progress" || true)

  echo "**Summary:** ${pass_count} passed, ${fail_count} failed, ${pending_count} pending"
  echo ""
}

# --- Main output ---
echo "# PR #${PR_NUMBER} Feedback — ${REPO}"
echo "_Fetched: $(date -u +%Y-%m-%dT%H:%M:%SZ)_"
if [[ -n "$SINCE" ]]; then
  echo "_Filtered: comments after ${SINCE}_"
fi
echo ""

if [[ "$CHECKS_ONLY" == "true" ]]; then
  fetch_checks
elif [[ "$REVIEWS_ONLY" == "true" ]]; then
  fetch_reviews
  fetch_inline_comments
  fetch_review_threads
  fetch_issue_comments
else
  fetch_reviews
  fetch_inline_comments
  fetch_review_threads
  fetch_issue_comments
  fetch_checks
fi
