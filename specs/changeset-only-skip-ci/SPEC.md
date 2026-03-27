# SPEC: Skip CI for changeset-only PRs

## Problem Statement

CI workflows (`ci.yml` and `cypress.yml`) run on expensive `ubuntu-32gb` runners with 30-minute timeouts, spinning up databases (Doltgres, Postgres), SpiceDB, and Playwright. Currently, the changeset detection only skips CI when the PR branch is `changeset-release/main` (the automated changesets bot PR). However, PRs that only add or modify `.changeset/*.md` files — which contain no code changes — still trigger the full CI pipeline, wasting ~15-30 minutes of compute per run.

## Goals

Enhance the existing changeset detection in `ci.yml` and `cypress.yml` to also skip CI when a PR's only changes are markdown files in the `.changeset/` directory.

## Non-Goals

- Changing other workflows (release, preview, etc.)
- Adding changeset detection to widget or agents-ui repos (they use simpler, faster CI)
- Modifying the `changeset-release/main` branch detection (keep existing behavior)

## Scope

- `.github/workflows/ci.yml` — both `ci` and `create-agents-e2e` jobs
- `.github/workflows/cypress.yml` — `cypress-e2e` job

## Technical Design

### Current Detection Logic

The `changeset-check` step runs before checkout and checks:
1. **PR event:** Is `github.head_ref` equal to `changeset-release/main`?
2. **Merge group event:** Extract PR number from ref, check if its head branch is `changeset-release/main` via `gh pr view`

### Enhanced Detection Logic

Add a second check after the existing one: if `IS_CHANGESET` is still `false` and the event is not a `push` to main, use the GitHub API to list changed files and check if ALL of them match `.changeset/*.md`.

For **pull_request** events:
```bash
CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only --repo "$GITHUB_REPOSITORY")
```

For **merge_group** events:
```bash
# PR_NUM is already extracted in the existing logic
CHANGED_FILES=$(gh pr diff "$PR_NUM" --name-only --repo "$GITHUB_REPOSITORY")
```

Then check:
```bash
NON_CHANGESET_FILES=$(echo "$CHANGED_FILES" | grep -v '^\.changeset/.*\.md$' || true)
if [ -z "$NON_CHANGESET_FILES" ]; then
  IS_CHANGESET=true
fi
```

### Edge Cases

- **Push to main:** Skip this check entirely — pushes to main should always run CI
- **Empty diff:** If `gh pr diff` returns nothing, do NOT skip CI (fail-safe)
- **Mixed changes:** If any file outside `.changeset/` is changed, run full CI
- **All `.changeset/` files skip CI:** Both `.md` changeset entries and `config.json` are changeset-only changes

### Environment Variables Needed

The PR number is needed for the GitHub API call:
- **PR events:** `${{ github.event.pull_request.number }}`
- **Merge group events:** Already extracted as `PR_NUM` in existing logic

## Acceptance Criteria

1. PRs that only add/modify `.changeset/*.md` files skip all CI steps in `ci.yml` and `cypress.yml`
2. PRs that modify `.changeset/*.md` AND other files still run full CI
3. The `changeset-release/main` branch detection continues to work as before
4. Push events to main always run full CI
5. `.changeset/config.json` changes are NOT treated as changeset-only
6. The check is fail-safe: if file detection fails, CI runs (not skipped)
7. Log messages clearly indicate why CI was skipped (changeset-only vs changeset-release PR)

## Test Cases

1. **PR with only `.changeset/foo.md` added** -> CI skipped
2. **PR with `.changeset/foo.md` + `src/index.ts` changed** -> CI runs
3. **PR on `changeset-release/main` branch** -> CI skipped (existing behavior)
4. **PR with `.changeset/config.json` changed** -> CI runs
5. **Push to main** -> CI runs
6. **Merge group with changeset-only PR** -> CI skipped
7. **PR with only `.changeset/README.md` modified** -> CI skipped
