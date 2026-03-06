#!/usr/bin/env bash
# Commit a changed file and push it back to the PR branch.
# Used by CI workflows to auto-commit generated artifacts (e.g. OpenAPI snapshot).
#
# Usage: scripts/ci-commit-and-push.sh <file> <commit-message> <branch>
#
# Requires GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL env vars (set at workflow level).

set -euo pipefail

FILE="$1"
COMMIT_MSG="$2"
BRANCH="$3"

if git diff --quiet "$FILE" 2>/dev/null; then
  echo "$FILE is up to date"
  exit 0
fi

git config user.name "$GIT_AUTHOR_NAME"
git config user.email "$GIT_AUTHOR_EMAIL"
git add "$FILE"
git commit -m "$COMMIT_MSG"

# Verify remote branch still exists before pushing
if ! git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  echo "::notice::Remote branch '$BRANCH' no longer exists (PR likely merged/closed). Skipping push."
  exit 0
fi

push_succeeded=false
for i in 1 2 3; do
  if git push; then
    echo "::notice::$FILE was auto-updated and committed."
    push_succeeded=true
    break
  fi
  echo "Push failed, attempting pull --rebase and retry ($i/3)"
  if ! git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
    echo "::notice::Remote branch '$BRANCH' was deleted during retry. Skipping."
    exit 0
  fi
  git pull --rebase origin "$BRANCH" || exit 1
  sleep $((i * 2))
done

if [ "$push_succeeded" != "true" ]; then
  echo "::error::Failed to push $FILE update after 3 attempts."
  exit 1
fi
