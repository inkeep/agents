---
name: review
description: "Manage the PR review iteration loop: poll for reviewer feedback, assess suggestions with evidence, implement fixes, resolve threads, and drive CI/CD to green. Works standalone on any PR (bug fix, refactor, hotfix, feature) or as a composable module invoked by /ship. Spec-aware when a SPEC.md is provided, but does not require one. Triggers: review, review loop, PR feedback, iterate on PR, resolve reviews, CI/CD resolution, green pipeline, address reviewer comments."
argument-hint: "<PR number> [--spec path/to/SPEC.md] [--test-cmd 'custom test command']"
---

# Review

Manage the full review iteration lifecycle for a PR: poll for feedback, assess each suggestion with evidence, implement fixes, resolve threads, and drive CI/CD to green.

You are a **peer engineer** evaluating suggestions — not a subordinate implementing directives. Reviewer comments are hypotheses about your code. Your job is to determine which are correct, with evidence, and act accordingly.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| PR number | No | Inferred from current branch via `gh pr view` | The pull request to manage. If not provided, detected from the current branch. Fails with a clear error if no PR exists for the branch. |
| Repo | No | Inferred from `gh repo view` / git remote | `owner/repo` format. |
| Test command(s) | No | `pnpm test --run && pnpm typecheck && pnpm lint` | Command(s) to run after implementing changes. Override if your project uses different tooling. |
| SPEC.md path | No | None | If provided, enables spec-aware review assessment (cross-referencing suggestions against design intent). |

---

## Workflow

This skill has two stages. Complete Stage 1 before moving to Stage 2.

### Stage 1: Review feedback loop

Reviewer feedback is the primary signal. CI/CD is secondary and opportunistic during this stage.

#### 1. Resolve PR and assess starting state

Verify `gh` CLI is available and authenticated:

```bash
gh auth status
```

If this fails, stop and tell the user — this skill requires the GitHub CLI.

If a PR number was not provided, detect it from the current branch:

```bash
# Infer PR number from current branch
gh pr view --json number -q '.number'
```

If no PR exists for the current branch, stop and tell the user — this skill requires an existing PR to iterate on.

Then determine what's already in flight before taking action:

**Script path resolution:** All `scripts/` paths below are relative to this skill's base directory (shown in the skill header when loaded), **not** your current working directory. Resolve the full path before invoking. For example, if the skill base is `~/.claude/plugins/cache/.../skills/review`, then `scripts/fetch-pr-feedback.sh` means `~/.claude/plugins/cache/.../skills/review/scripts/fetch-pr-feedback.sh`. If the scripts are not found, fall back to the equivalent `gh api` commands in `references/review-protocol.md`.

```bash
# Check for unpushed local changes
git status
git log origin/HEAD..HEAD --oneline

# Check for existing review feedback (use full path to skill's scripts/ dir)
<skill-base>/scripts/fetch-pr-feedback.sh <pr-number>
```

| Starting state | Action |
|---|---|
| Local changes not yet pushed | Push, update PR description if needed, then proceed to step 2. |
| Already pushed, review feedback waiting | Skip push. Proceed directly to step 3 (assess feedback). |
| Already pushed, no feedback yet | Proceed to step 2 (poll). |

**When pushing:** update the PR body if the implementation has changed materially. Load `/pr` skill to rewrite the PR body — it is a stateless snapshot of the PR's scope relative to origin/main, not a history of its evolution. Not every small fix requires a PR body edit.

**Load:** `references/review-protocol.md` (section: "PR body")

#### 2. Poll for review feedback

Wait approximately 6 minutes, then check for reviewer feedback. Opportunistically check CI/CD at the same time.

**Always use the skill's scripts for polling — do not call `gh pr checks` or `gh api` directly.** The scripts handle exit codes, parse output, and categorize results (passed/failed/pending). Raw `gh pr checks` returns exit code 8 for pending checks, which looks like an error but is normal — the scripts absorb this.

```bash
# Primary: fetch all review feedback (reviews, inline comments, discussion)
<skill-base>/scripts/fetch-pr-feedback.sh <pr-number> --reviews-only

# Secondary (opportunistic): check CI/CD status
<skill-base>/scripts/fetch-pr-feedback.sh <pr-number> --checks-only

# Or fetch everything at once:
<skill-base>/scripts/fetch-pr-feedback.sh <pr-number>
```

Fall back to raw `gh pr checks` only if the scripts are unavailable (file not found).

**Decision logic:**

| What's available | Action |
|---|---|
| Review feedback ready, CI/CD not done | Proceed to assess review feedback immediately. Do NOT wait for CI/CD. |
| Review feedback ready, CI/CD also ready | Assess both. Handle review feedback first, then CI/CD failures. |
| No review feedback, CI/CD has failures | Assess and fix CI/CD failures while waiting for review. |
| Neither ready | Wait another 3 minutes and check again. After 3 checks with no results, proceed with other work and check back later. |

#### 3. Assess reviewer feedback

**Load:** `references/review-protocol.md` (section: "Assessment protocol")

The full assessment protocol is in the reference file. The short version:

1. **Investigate** before deciding — proportional to stakes (deep for bugs, light for style). Name your confidence level before proceeding.
2. **Evaluate** across dimensions: validity, correctness, applicability, relevancy, tradeoffs, side effects, appropriateness.
3. **Decide** — accept, decline, or partially accept — with evidence-backed reasoning.
4. **Reply** with specific evidence. **Resolve inline review threads** after replying — use the `thread_id` from `fetch-pr-feedback.sh` output with the `resolveReviewThread` GraphQL mutation (see `references/review-protocol.md`).
5. **Close the loop** using the right GitHub mechanism for each feedback type (inline threads → reply then resolve via GraphQL; review bodies → top-level comment; discussion → reply).

**Do not default to acceptance.** The path of least resistance (just apply every suggestion) produces worse code than thoughtful evaluation. Equally, do not default to rejection — that wastes valid insights. **Never resolve a thread by deferring to "future iterations"** — you have no authority to commit to future work. Every suggestion gets a substantive conclusion: accept and implement, or decline with evidence.

#### 4. Implement changes and test

**For small changes** (< 20 lines, single file, clear fix):
- Make the change directly.

**For medium changes** (20-100 lines, 2-3 files):
- Make the change directly, but run full tests before pushing.

**For large/complex changes** (> 100 lines, architectural, or touching many files):
- Spin up a subagent with clear, specific instructions and full context (see `references/review-protocol.md` "Subagent delegation template").
- Review the subagent's output before committing. You are still the owner.

Before pushing, evaluate your own changes:
- **Correctness**: does the change actually fix the issue or implement the suggestion correctly?
- **Clarity**: could another engineer understand this without explanation?
- **Codebase alignment**: does it follow existing patterns and conventions?
- **Proportionality**: does the fix match the scope of the problem, or did you over-build or under-build?

If you are not confident your fix fully and correctly addresses the reviewer's concern, say so in your reply rather than asserting completeness. "I've addressed this by doing X — please verify this matches your intent" is more useful than implying the matter is settled.

At minimum, run tests after any changes:
```bash
# Default — override via --test-cmd if your project uses different tooling
pnpm test --run
pnpm typecheck
pnpm lint
```

If changes affect user-facing behavior, also verify the experience manually (API calls, browser testing, etc.) as appropriate. When fixing a reviewer-flagged UI issue and `/browser` is available, load it to verify the fix: navigate to the affected page, confirm the visual change, and check for console errors (`startConsoleCapture` / `getConsoleErrors`). Capture a screenshot as evidence — this strengthens your reply when resolving the thread.

If your changes affect documented behavior — whether product-facing (user docs, API reference, guides) or internal (architecture docs, READMEs, runbooks) — update the relevant documentation files (`.md`, `.mdx`, etc.) alongside the code fix. Docs should stay accurate through the review loop, not deferred to later.

#### 5. Push and repeat

Push changes, then return to step 2. Continue the loop.

#### 6. When feedback exceeds fix-and-push scope

Not all review feedback is a small fix. If a reviewer surfaces something that requires substantial new work, classify and act:

| Feedback scope | Action |
|---|---|
| Bug fix or correctness issue in existing code | Fix directly in the review loop. |
| New functionality not in scope (scope expansion) | Pause. Consult the user — this is a product/scope decision. |
| Architectural rework of existing implementation | Evaluate proportionality: does the evidence warrant the complexity? If yes, implement directly or via subagent. If not, decline with reasoning. |
| Substantial additive work with clear acceptance criteria | If a workflow orchestrator (e.g., `/ship`) is driving this review, hand back to the orchestrator for a proper implementation pass. Otherwise, consult the user on how to proceed. |

Do not force substantial rework into the review loop's fix-and-push cycle. Larger changes need their own implementation and testing before they merge into the review flow.

#### 7. Exit Stage 1

**Do not exit until all review feedback is resolved.** After resolving threads, re-poll to confirm no new feedback appeared:

```bash
<skill-base>/scripts/fetch-pr-feedback.sh <pr-number> --reviews-only
```

Exit only when ALL of these are true:
- [ ] Every reviewer feedback thread is resolved (accepted with code changes, or declined with evidence-based reasoning)
- [ ] You have pushed your latest changes
- [ ] You have re-polled after your last push and confirmed no new review comments appeared
- [ ] No threads were resolved by deferring to "future iterations" — every thread has a substantive conclusion

If new feedback appears after a push, return to step 3 and assess it. Continue looping until the above conditions are met.

If the same feedback keeps recurring after 3 iterations, pause and consult the user.

Once Stage 1 is complete, proceed to Stage 2.

---

### Stage 2: CI/CD resolution

After the review loop is finalized, shift focus to monitoring and resolving CI/CD pipeline results.

#### 1. Monitor pipeline

```bash
<skill-base>/scripts/fetch-pr-feedback.sh <pr-number> --checks-only
```

#### 2. Process failures as they appear

Do NOT wait for the entire pipeline to finish. As soon as any check in a given run reports a failure or cancellation, investigate immediately:

```bash
# Always use --compare-main — classification without main branch evidence is guesswork
<skill-base>/scripts/investigate-ci-failures.sh <pr-number> --compare-main
```

**Cancelled runs are not "passed."** A run cancelled due to runner shutdown, timeout, or resource exhaustion is an unknown — you don't know if the code is clean. Re-trigger it and wait for the result.

**Classification requires evidence.** You must reach high confidence that a failure is NOT caused by this PR before classifying it as pre-existing or infrastructure. "It looks like infra" is not sufficient — verify with evidence (main branch comparison, retry results, log analysis).

For each failing or cancelled check, **investigate then classify**:

| Classification | Evidence required | Action |
|---|---|---|
| Caused by this PR's changes | Failure is in code paths touched by this PR; main branch passes the same check | Fix it. |
| Pre-existing failure (fails on main too) | `--compare-main` shows the same workflow failing on main with the same error | Note in PR comment with evidence (main run ID, matching error). Do not fix unless trivial. |
| Flaky test (passes on retry) | Same check passes on re-run without code changes | Re-trigger: `gh run rerun <run-id> --repo <owner/repo>`. Wait for the rerun. If it passes, note in PR comment. If it fails again, investigate deeper — two consecutive failures are not "flaky." |
| Infrastructure issue (timeout, runner shutdown, OIDC, resource) | Logs show infrastructure-level error (not test/build failure); main branch shows similar issues OR the error is clearly unrelated to code | Re-trigger: `gh run rerun <run-id> --repo <owner/repo>`. Wait for the rerun. Note in PR comment with evidence. |
| Cancelled (any reason) | Run was cancelled before completing | Re-trigger: `gh run rerun <run-id> --repo <owner/repo>`. Wait for the result. Do not classify a cancelled run as "passed" or "not PR-related." |

**Re-trigger, don't just note.** For flaky, infrastructure, and cancelled failures, always re-trigger the run and wait for the result. Noting a failure without retrying leaves an unknown — the pipeline is not green and you have no evidence it would be.

#### 3. Fix, test, push, and monitor next run

After fixing failures:
1. Run tests locally to verify the fix.
2. Push.
3. Monitor the next CI/CD run.
4. Repeat until the pipeline is green or all remaining failures are documented as pre-existing/unrelated with evidence.

#### 4. Exit Stage 2

Stop when ALL of these are true:
- [ ] CI/CD pipeline is green (or failures are documented as pre-existing/unrelated **with evidence** — main branch comparison, matching error, retry results)
- [ ] No cancelled or pending runs — every check has a definitive pass or documented-with-evidence failure
- [ ] You are satisfied with the implementation quality
- [ ] No pending items in your task list

If CI keeps failing on the same issue after 3 attempts, pause and consult the user.

---

### Second-pass review (optional)

After Stage 1 + Stage 2 complete, assess whether the PR warrants a second full review. Trigger a second pass when any of these apply:
- The PR touches auth, permissions, data mutations, or security-sensitive code
- The implementation involved significant architectural decisions or trade-offs
- Multiple files were changed across different subsystems
- The first review round surfaced substantive issues (not just nits)

To trigger the second pass, leave a PR comment requesting a full review, then loop back to Stage 1 Step 2 (poll for feedback). The same assessment and resolution process applies.

For straightforward PRs (single-file config changes, simple bug fixes, cosmetic updates), skip the second pass.

---

## Completion

When both stages are complete (and second-pass review if triggered), report to the user (or the invoking skill):
- All reviewer feedback threads resolved (with summary of accepted/declined)
- CI/CD pipeline status
- Any items added to the PR description's "Future considerations" section (if any)

**Re-invocation guidance for callers:** If new commits are pushed to the PR after this skill reports completion — from any source (caller fixes, user-requested changes, subsequent workflow phases) — the review cycle should be re-invoked. The review loop is complete only when the most recent push has been through a review cycle with all threads resolved.

---

## Anti-patterns

- **Blindly accepting** all reviewer suggestions without evaluating them
- **Blindly rejecting** reviewer suggestions without investigating them
- **Shallow investigation** — accepting or rejecting a suggestion without reading the relevant code
- Pushing code without running tests locally first
- Force-pushing or destructive git operations without user confirmation
- Leaving review threads unresolved after making a final decision
- **Flattening nuance** — forcing binary accept/decline when the honest assessment is "legitimate tradeoff"
- **Asserting without evidence** — writing confident-sounding replies that don't reflect actual investigation depth
- **Deferring to "future iterations"** — resolving threads with "we'll do in a future iteration" or similar. You have no authority to commit to future work. Either accept and implement, or decline with evidence.
- **Exiting with unresolved threads** — leaving the review loop while review feedback threads or pending items remain unaddressed
- Forcing substantial rework through the fix-and-push cycle instead of escalating

---

## Appendix: Reference and script index

| Path | Use when | Impact if skipped |
|---|---|---|
| `references/review-protocol.md` | Assessing reviewer feedback (Stage 1, step 3); PR body guidance; subagent delegation | Mechanical/uncritical response to reviews; missed nuance in feedback assessment |
| `/pr` skill | Writing or updating the PR body (Stage 1, step 1; after any material push) | Inconsistent PR body structure; missing sections; stale description |
| `scripts/fetch-pr-feedback.sh` | Fetching review feedback and CI/CD status | Agent uses wrong/deprecated `gh` commands, misses inline review comments |
| `scripts/investigate-ci-failures.sh` | Investigating CI/CD failures with logs (Stage 2) | Agent struggles to find run IDs, fetch logs, or compare with main |
