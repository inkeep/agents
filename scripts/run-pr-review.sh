#!/bin/bash
set -e

PR=${1:-1640}
REPO_ROOT="/Users/edwingomezcuellar/InkeepDev/agents"

cd "$REPO_ROOT"

echo "Fetching PR #$PR metadata..."
TITLE=$(gh pr view $PR --json title -q .title)
BASE=$(gh pr view $PR --json baseRefName -q .baseRefName)
AUTHOR=$(gh pr view $PR --json author -q .author.login)
BODY=$(gh pr view $PR --json body -q .body)

echo "Fetching diff..."
FILES=$(gh pr diff $PR --name-only)
DIFF=$(gh pr diff $PR)

echo "Fetching existing review threads..."
THREADS=$(gh api graphql -f query='query($owner: String!, $repo: String!, $pr: Int!) { repository(owner: $owner, name: $repo) { pullRequest(number: $pr) { reviewThreads(first: 100) { nodes { isResolved isOutdated path line diffSide comments(first: 1) { nodes { author { login } body diffHunk } } } } } } }' -f owner="inkeep" -f repo="agents" -F pr=$PR --jq '.data.repository.pullRequest.reviewThreads.nodes // []')

echo "Fetching PR comments..."
COMMENTS=$(gh api graphql -f query='query($owner: String!, $repo: String!, $pr: Int!) { repository(owner: $owner, name: $repo) { pullRequest(number: $pr) { comments(first: 50) { nodes { author { __typename login } body createdAt } } } } }' -f owner="inkeep" -f repo="agents" -F pr=$PR --jq '[.data.repository.pullRequest.comments.nodes[] | select(.author.__typename == "User" or (.author.login | test("github-actions|claude"; "i")))]')

echo "Building prompt..."
cat > /tmp/pr-review-prompt.txt << PROMPT_EOF
Review this pull request.

**PR #$PR:** $TITLE
**Base:** $BASE
**Author:** $AUTHOR

## Description (User defined, may not be up to date//fully reflect scope)
$BODY

## Changed Files
\`\`\`
$FILES
\`\`\`

## Diff
\`\`\`diff
$DIFF
\`\`\`

## Existing Inline Comments (for deduplication)
Use this to avoid posting duplicate inline comments. Each object has: \`isResolved\`, \`isOutdated\`, \`path\`, \`line\`, \`diffSide\`, and first comment with \`body\`, \`author\`, and \`diffHunk\` (code context).
\`\`\`json
$THREADS
\`\`\`

## PR Discussion (general comments)
Prior discussion on this PR (humans + your previous comments). Use to avoid re-raising addressed issues.
\`\`\`json
$COMMENTS
\`\`\`
PROMPT_EOF

echo "Running PR review..."
claude --agent pr-review \
  --dangerously-skip-permissions \
  --allowedTools "Task,Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git merge-base:*),Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)" \
  "$(cat /tmp/pr-review-prompt.txt)"
