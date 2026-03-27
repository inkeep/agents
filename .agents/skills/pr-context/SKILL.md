---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — feat/changeset-only-skip-ci vs main |
| **Author** | Andrew Mikofalvy |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `7ad17dd61c66ea12b129c2d1c72da22fd8797e49` |
| **Size** | 2 commits · +93/-0 · 4 files (1 untracked) |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `inline` — full tracked diff included below |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
b20407942 fix(ci): use GitHub App token for auto-commits to trigger CI (#2871)
7ad17dd61 fix(ci): skip CI when PR only changes .changeset/ files
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .github/workflows/auto-format.yml | 18 +++++++++++++
 .github/workflows/ci.yml          | 57 +++++++++++++++++++++++++++++++++++++++
 .github/workflows/cypress.yml     | 18 +++++++++++++
 3 files changed, 93 insertions(+)
new file | specs/changeset-only-skip-ci/SPEC.md
```

Full file list (including untracked files when present):

```
.github/workflows/auto-format.yml
.github/workflows/ci.yml
.github/workflows/cypress.yml
specs/changeset-only-skip-ci/SPEC.md
```

## Diff

```diff
diff --git a/.github/workflows/auto-format.yml b/.github/workflows/auto-format.yml
index 65b494c7f..f5a440a16 100644
--- a/.github/workflows/auto-format.yml
+++ b/.github/workflows/auto-format.yml
@@ -56,6 +56,17 @@ jobs:
         run: |
           echo "::notice::Checkout failed — branch was likely deleted (PR merged). Skipping."
 
+      # Generate a GitHub App token so that auto-commits trigger downstream CI
+      # workflows. The default GITHUB_TOKEN's commits are ignored by GitHub to
+      # prevent infinite loops.
+      - name: Generate GitHub App Token
+        id: app-token
+        if: steps.pr-check.outputs.skip != 'true' && steps.checkout.outcome == 'success'
+        uses: actions/create-github-app-token@d72941d797fd3113feb6b93fd0dec494b13a2547 # v1
+        with:
+          app-id: ${{ secrets.INTERNAL_CI_APP_ID }}
+          private-key: ${{ secrets.INTERNAL_CI_APP_PRIVATE_KEY }}
+
       - name: Setup Node.js
         if: steps.pr-check.outputs.skip != 'true' && steps.checkout.outcome == 'success'
         uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
@@ -112,12 +123,19 @@ jobs:
         if: steps.pr-check.outputs.skip != 'true' && steps.checkout.outcome == 'success' && steps.changes.outputs.has_changes == 'true'
         env:
           PUSH_REF: ${{ github.event_name == 'pull_request' && github.head_ref || github.ref_name }}
+          APP_TOKEN: ${{ steps.app-token.outputs.token }}
         run: |
           git config user.name "github-actions[bot]"
           git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
           git add -u
           git commit -m "style: auto-format with biome"
 
+          # Use GitHub App token so the push triggers downstream CI workflows.
+          # The default GITHUB_TOKEN's commits are ignored by GitHub to prevent loops.
+          if [ -n "$APP_TOKEN" ]; then
+            git remote set-url origin "https://x-access-token:${APP_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
+          fi
+
           # Verify remote branch still exists before pushing
           if ! git ls-remote --exit-code --heads origin "$PUSH_REF" > /dev/null 2>&1; then
             echo "::notice::Remote branch '$PUSH_REF' no longer exists (PR likely merged). Skipping push."
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 112a0d25a..d938ae9f8 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -58,6 +58,23 @@ jobs:
             fi
           fi
 
+          # Check if PR only contains .changeset/ file changes
+          if [ "$IS_CHANGESET" = "false" ] && [ "$GITHUB_EVENT_NAME" != "push" ]; then
+            if [ "$GITHUB_EVENT_NAME" = "pull_request" ] && [ -n "$PR_NUMBER" ]; then
+              CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only --repo "$GITHUB_REPOSITORY" 2>/dev/null || echo "")
+            elif [ "$GITHUB_EVENT_NAME" = "merge_group" ] && [ -n "$PR_NUM" ]; then
+              CHANGED_FILES=$(gh pr diff "$PR_NUM" --name-only --repo "$GITHUB_REPOSITORY" 2>/dev/null || echo "")
+            fi
+
+            if [ -n "$CHANGED_FILES" ]; then
+              NON_CHANGESET=$(echo "$CHANGED_FILES" | grep -v '^\.changeset/' || true)
+              if [ -z "$NON_CHANGESET" ]; then
+                IS_CHANGESET=true
+                echo "Only .changeset/ files changed — skipping CI checks"
+              fi
+            fi
+          fi
+
           echo "is_changeset=$IS_CHANGESET" >> $GITHUB_OUTPUT
           if [ "$IS_CHANGESET" = "true" ]; then
             echo "Changeset PR — skipping CI checks"
@@ -67,6 +84,7 @@ jobs:
           GITHUB_EVENT_NAME: ${{ github.event_name }}
           MERGE_GROUP_HEAD_REF: ${{ github.event.merge_group.head_ref }}
           GH_TOKEN: ${{ github.token }}
+          PR_NUMBER: ${{ github.event.pull_request.number }}
 
       - name: Checkout code
         if: steps.changeset-check.outputs.is_changeset != 'true'
@@ -130,6 +148,20 @@ jobs:
         env:
           HUSKY: 0
 
+      # Generate a GitHub App token so that auto-commits trigger downstream CI
+      # workflows. The default GITHUB_TOKEN's commits are ignored by GitHub to
+      # prevent infinite loops.
+      - name: Generate GitHub App Token
+        id: app-token
+        if: |
+          steps.changeset-check.outputs.is_changeset != 'true' &&
+          github.event_name == 'pull_request' &&
+          github.event.pull_request.head.repo.full_name == github.repository
+        uses: actions/create-github-app-token@d72941d797fd3113feb6b93fd0dec494b13a2547 # v1
+        with:
+          app-id: ${{ secrets.INTERNAL_CI_APP_ID }}
+          private-key: ${{ secrets.INTERNAL_CI_APP_PRIVATE_KEY }}
+
       # Auto-update OpenAPI snapshot on PRs (skip fork PRs since GITHUB_TOKEN is read-only)
       # Gate: only run when files that affect the OpenAPI spec changed.
       # These paths mirror the pre-commit hook in package.json lint-staged config.
@@ -166,7 +198,14 @@ jobs:
       - name: Commit OpenAPI snapshot if changed
         if: steps.changeset-check.outputs.is_changeset != 'true' && steps.openapi-changes.outputs.changed == 'true'
         run: |
+          # Use GitHub App token so the push triggers downstream CI workflows.
+          # The default GITHUB_TOKEN's commits are ignored by GitHub to prevent loops.
+          if [ -n "$APP_TOKEN" ]; then
+            git remote set-url origin "https://x-access-token:${APP_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
+          fi
           scripts/ci-commit-and-push.sh agents-api/__snapshots__/openapi.json "chore: update OpenAPI snapshot" "${{ github.head_ref }}"
+        env:
+          APP_TOKEN: ${{ steps.app-token.outputs.token }}
 
       - name: Install Playwright
         if: steps.changeset-check.outputs.is_changeset != 'true'
@@ -320,6 +359,23 @@ jobs:
             fi
           fi
 
+          # Check if PR only contains .changeset/ file changes
+          if [ "$IS_CHANGESET" = "false" ] && [ "$GITHUB_EVENT_NAME" != "push" ]; then
+            if [ "$GITHUB_EVENT_NAME" = "pull_request" ] && [ -n "$PR_NUMBER" ]; then
+              CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only --repo "$GITHUB_REPOSITORY" 2>/dev/null || echo "")
+            elif [ "$GITHUB_EVENT_NAME" = "merge_group" ] && [ -n "$PR_NUM" ]; then
+              CHANGED_FILES=$(gh pr diff "$PR_NUM" --name-only --repo "$GITHUB_REPOSITORY" 2>/dev/null || echo "")
+            fi
+
+            if [ -n "$CHANGED_FILES" ]; then
+              NON_CHANGESET=$(echo "$CHANGED_FILES" | grep -v '^\.changeset/' || true)
+              if [ -z "$NON_CHANGESET" ]; then
+                IS_CHANGESET=true
+                echo "Only .changeset/ files changed — skipping E2E tests"
+              fi
+            fi
+          fi
+
           echo "is_changeset=$IS_CHANGESET" >> $GITHUB_OUTPUT
           if [ "$IS_CHANGESET" = "true" ]; then
             echo "Changeset PR — skipping E2E tests"
@@ -329,6 +385,7 @@ jobs:
           GITHUB_EVENT_NAME: ${{ github.event_name }}
           MERGE_GROUP_HEAD_REF: ${{ github.event.merge_group.head_ref }}
           GH_TOKEN: ${{ github.token }}
+          PR_NUMBER: ${{ github.event.pull_request.number }}
 
       - name: Checkout code
         if: steps.changeset-check.outputs.is_changeset != 'true'
diff --git a/.github/workflows/cypress.yml b/.github/workflows/cypress.yml
index e84cc3a43..c07c48ff3 100644
--- a/.github/workflows/cypress.yml
+++ b/.github/workflows/cypress.yml
@@ -76,6 +76,23 @@ jobs:
             fi
           fi
 
+          # Check if PR only contains .changeset/ file changes
+          if [ "$IS_CHANGESET" = "false" ] && [ "$GITHUB_EVENT_NAME" != "push" ]; then
+            if [ "$GITHUB_EVENT_NAME" = "pull_request" ] && [ -n "$PR_NUMBER" ]; then
+              CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only --repo "$GITHUB_REPOSITORY" 2>/dev/null || echo "")
+            elif [ "$GITHUB_EVENT_NAME" = "merge_group" ] && [ -n "$PR_NUM" ]; then
+              CHANGED_FILES=$(gh pr diff "$PR_NUM" --name-only --repo "$GITHUB_REPOSITORY" 2>/dev/null || echo "")
+            fi
+
+            if [ -n "$CHANGED_FILES" ]; then
+              NON_CHANGESET=$(echo "$CHANGED_FILES" | grep -v '^\.changeset/' || true)
+              if [ -z "$NON_CHANGESET" ]; then
+                IS_CHANGESET=true
+                echo "Only .changeset/ files changed — skipping Cypress tests"
+              fi
+            fi
+          fi
+
           echo "is_changeset=$IS_CHANGESET" >> $GITHUB_OUTPUT
           if [ "$IS_CHANGESET" = "true" ]; then
             echo "Changeset PR — skipping Cypress tests"
@@ -85,6 +102,7 @@ jobs:
           GITHUB_EVENT_NAME: ${{ github.event_name }}
           MERGE_GROUP_HEAD_REF: ${{ github.event.merge_group.head_ref }}
           GH_TOKEN: ${{ github.token }}
+          PR_NUMBER: ${{ github.event.pull_request.number }}
 
       - name: Checkout code
         if: steps.changeset-check.outputs.is_changeset != 'true'
```

> **Note:** 1 untracked file(s) are listed above. Review them directly in the working tree if they are relevant.

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
