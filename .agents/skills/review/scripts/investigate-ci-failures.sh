#!/usr/bin/env bash
# investigate-ci-failures.sh — Investigate CI/CD failures for a PR.
#
# For each failing check on the PR, fetches:
#   1. The failing job name and step
#   2. The failure logs (truncated to last N lines per job)
#   3. Optionally, comparison with main branch CI status
#
# Why this script exists:
#   - The agent often struggles with the multi-step process of finding run IDs,
#     fetching logs, and comparing with main
#   - gh run view --log-failed can produce enormous output that overwhelms context
#   - Structured output helps the agent classify failures quickly
#
# Usage:
#   ./investigate-ci-failures.sh <pr-number> [--repo owner/repo] [--compare-main] [--log-lines N]
#
# Options:
#   --repo owner/repo    Explicit repo (default: inferred from git remote)
#   --compare-main       Also check if failures exist on main (pre-existing)
#   --log-lines N        Number of log lines to show per failing job (default: 80)
#
# Output: Structured markdown to stdout, suitable for agent consumption.

set -euo pipefail

# --- Argument parsing ---
PR_NUMBER=""
REPO=""
COMPARE_MAIN=false
LOG_LINES=80

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --compare-main)
      COMPARE_MAIN=true
      shift
      ;;
    --log-lines)
      LOG_LINES="$2"
      shift 2
      ;;
    -h|--help)
      head -20 "$0" | tail -16
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

# --- Get PR head SHA ---
HEAD_SHA=$(gh api "repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}" --jq '.head.sha' 2>/dev/null || true)
if [[ -z "$HEAD_SHA" ]]; then
  echo "Error: Could not get head SHA for PR #${PR_NUMBER}" >&2
  exit 1
fi

# --- Main output ---
echo "# CI/CD Investigation — PR #${PR_NUMBER}"
echo "_Repo: ${REPO} | Head: ${HEAD_SHA:0:8} | Fetched: $(date -u +%Y-%m-%dT%H:%M:%SZ)_"
echo ""

# --- Section 1: Check overview ---
echo "## Check Status Overview"
echo ""

CHECKS_OUTPUT=$(gh pr checks "$PR_NUMBER" --repo "${OWNER}/${REPO_NAME}" 2>/dev/null || echo "")

if [[ -z "$CHECKS_OUTPUT" ]]; then
  echo "_No checks available yet._"
  echo ""
  exit 0
fi

echo '```'
echo "$CHECKS_OUTPUT"
echo '```'
echo ""

# Summary counts
pass_count=$(echo "$CHECKS_OUTPUT" | grep -c "pass" || true)
fail_count=$(echo "$CHECKS_OUTPUT" | grep -c "fail" || true)
pending_count=$(echo "$CHECKS_OUTPUT" | grep -c "pending\|queued\|in_progress" || true)
skip_count=$(echo "$CHECKS_OUTPUT" | grep -c "skipping" || true)

echo "**Summary:** ${pass_count} passed, ${fail_count} failed, ${pending_count} pending, ${skip_count} skipped"
echo ""

if [[ "$fail_count" -eq 0 ]]; then
  echo "_No failures to investigate._"
  echo ""
  exit 0
fi

# --- Section 2: Failure details ---
echo "## Failure Details"
echo ""

# Get check runs via API for structured data
CHECK_RUNS=$(gh api "repos/${OWNER}/${REPO_NAME}/commits/${HEAD_SHA}/check-runs" --paginate --jq '.check_runs[] | select(.conclusion == "failure")' 2>/dev/null || echo "")

if [[ -z "$CHECK_RUNS" ]]; then
  echo "_Could not fetch check run details via API. Use the overview above to identify failures._"
  echo ""
else
  # Process each failing check run
  echo "$CHECK_RUNS" | jq -r '[.name, .details_url] | @tsv' | while IFS=$'\t' read -r check_name details_url; do
    echo "### ${check_name}"
    echo ""
    echo "_URL: ${details_url}_"
    echo ""

    # Extract run ID from the details URL
    run_id=$(echo "$details_url" | grep -oE 'runs/[0-9]+' | head -1 | cut -d'/' -f2 || true)

    if [[ -z "$run_id" ]]; then
      echo "_Could not extract run ID from URL._"
      echo ""
      continue
    fi

    # Get failing jobs for this run
    FAILING_JOBS=$(gh api "repos/${OWNER}/${REPO_NAME}/actions/runs/${run_id}/jobs" --jq '.jobs[] | select(.conclusion == "failure")' 2>/dev/null || echo "")

    if [[ -z "$FAILING_JOBS" ]]; then
      echo "_Could not fetch job details._"
      echo ""
      continue
    fi

    echo "$FAILING_JOBS" | jq -r '[.id, .name] | @tsv' | while IFS=$'\t' read -r job_id job_name; do
      # Get failing steps
      failing_steps=$(echo "$FAILING_JOBS" | jq -r "select(.id == ${job_id}) | .steps[] | select(.conclusion == \"failure\") | .name" 2>/dev/null || true)

      if [[ -n "$failing_steps" ]]; then
        echo "**Failing step(s):** ${failing_steps}"
        echo ""
      fi

      # Fetch job logs (truncated)
      echo "**Logs (last ${LOG_LINES} lines):**"
      echo '```'
      JOB_LOGS=$(gh api "repos/${OWNER}/${REPO_NAME}/actions/jobs/${job_id}/logs" 2>/dev/null || echo "")
      if [[ -n "$JOB_LOGS" ]]; then
        echo "$JOB_LOGS" | tail -"${LOG_LINES}"
      else
        echo "(Could not fetch logs)"
      fi
      echo '```'
      echo ""
    done

    echo "---"
    echo ""
  done
fi

# --- Section 3: Compare with main (optional) ---
if [[ "$COMPARE_MAIN" == "true" ]]; then
  echo "## Main Branch CI Comparison"
  echo ""
  echo "_Checking if failures also exist on main (pre-existing)..._"
  echo ""

  # Get recent workflow runs on main
  MAIN_RUNS=$(gh run list --repo "${OWNER}/${REPO_NAME}" --branch main --limit 5 --json conclusion,databaseId,displayTitle,name,workflowName 2>/dev/null || echo "[]")

  if [[ "$MAIN_RUNS" == "[]" || -z "$MAIN_RUNS" ]]; then
    echo "_No recent runs found on main._"
  else
    echo "**Recent main branch runs:**"
    echo ""
    echo "| Workflow | Conclusion | Title |"
    echo "|---|---|---|"
    echo "$MAIN_RUNS" | jq -r '.[] | "| \(.workflowName) | \(.conclusion) | \(.displayTitle[:60]) |"'
    echo ""

    # Check for failures on main
    main_failures=$(echo "$MAIN_RUNS" | jq '[.[] | select(.conclusion == "failure")] | length')
    if [[ "$main_failures" -gt 0 ]]; then
      echo "**Note:** ${main_failures} recent failure(s) on main. Some PR failures may be pre-existing."
      echo ""

      # Show details of main failures
      echo "$MAIN_RUNS" | jq -r '.[] | select(.conclusion == "failure") | "- **\(.workflowName)**: \(.displayTitle[:80]) (run \(.databaseId))"'
      echo ""
    else
      echo "**Main is green.** All recent runs passed. PR failures are likely caused by this PR's changes."
      echo ""
    fi
  fi
fi
