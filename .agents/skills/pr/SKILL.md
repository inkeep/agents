---
name: pr
description: "Write or update a GitHub PR body — self-contained, stateless, and structured for efficient review. Gathers context from the diff, spec, and implementation to produce a comprehensive PR description. Standalone or composable with /ship and /review. Triggers: PR body, PR description, pull request, write PR, update PR, create PR, PR template."
argument-hint: "[PR number | 'new'] [--spec path/to/SPEC.md]"
---

# Pull Request

Write or update a PR body that gives reviewers everything they need to understand the change without reading the spec, commit history, or any other document.

---

## Principles

- **Self-contained.** The PR body stands on its own. A reviewer should understand what this PR does, why, and what key decisions were made — without reading a spec, commit history, or anything else.
- **Stateless.** The PR body always reflects the current scope of the PR relative to origin/main. It is a snapshot, not a journal. When updating, rewrite affected sections to reflect current reality — do not append change notes or leave revision artifacts.

---

## Workflow

### Step 1: Gather context

Determine what this PR does from whatever is available:

| Input | How to use it |
|---|---|
| **PR number provided** | Run `gh pr diff <number>` and `gh pr view <number>`. Read changed files to understand what was built. |
| **SPEC.md path provided** | Read the spec. Cross-reference with the actual implementation — the code is the source of truth, not the spec. |
| **"new" (no PR yet)** | Run `git diff main...HEAD --stat` and read changed files. Understand what was built from the code. |
| **No input** | Infer from current branch: `gh pr view --json number -q '.number'` or `git diff main...HEAD --stat`. |

When a SPEC.md exists, use it as source material alongside the implementation. The PR body synthesizes both — spec intent and implementation reality — into a unified narrative. When no SPEC.md exists, derive everything from the code and commit history.

### Step 2: Write the PR body

Fill in each section of the template below. Omit sections that don't apply (noted in each section's guidance). Write for the audience: a reviewer who has not seen the spec or the commit history.

#### Summary

What this PR does + what problem this solves, why now, who benefits. 1-3 sentences if brief, if multiple pronged, can use numbered list to describe key scenarios/problems being solved. Keep it to the point.

#### Key decisions

Technical decisions worth scrutinizing: what was chosen, why, and what alternatives were considered. Flag gray areas where reasonable engineers might disagree or where the decision could be revisited. If the implementation diverged from the spec, capture the divergence here with rationale. **Omit if the change is straightforward with no meaningful decision points.**

#### Recordings

Video recordings of QA test execution. **Omit if no scenarios have `evidence[]` URLs.**

When `tmp/ship/qa-progress.json` exists, check scenarios for `evidence[]` arrays containing video URLs. Embed each as a collapsible section:

```md
<details>
<summary>QA-001: settings page renders at mobile viewport</summary>

[Video recording](https://video.bunnycdn.com/play/...)

</details>
```

When no qa-progress.json exists, omit this section. Video capture is QA's responsibility during execution.

#### Review setup

Minimal steps to see the change running — env vars, seed data, feature flags, or commands needed to get into a reviewable state. Not a test plan; just how to get the reviewer to a point where they can see the change. **Omit if standard `dev` workflow is sufficient.**

#### Manual QA

What QA verified manually and what still needs human eyes. This section covers **only** scenarios that resist automation — visual correctness, UX flows, integration reality, edge cases, failure modes. Do not restate what the automated test suite covers — reviewers can read the test files.

**Source of truth — read in this order:**
1. **`tmp/ship/qa-progress.json`** (when it exists): Read the file. Render in two groups:

   **Verified by QA (N/M)** — scenarios with `status: "validated"`. Group by `category`. For each:
   - Clean pass (notes empty) → `- [x] **<name>** — <verifies>`
   - Pass with notes → `- [x] **<name>** — <verifies> · <notes>`

   **Needs human verification (K/M)** — scenarios with `status: "failed"`, `"blocked"`, or `"skipped"`. No category grouping — list flat with the reason prominent:
   - `failed` → `- [ ] **<category>: <name>** — FAILED: <notes>`
   - `blocked` → `- [ ] **<category>: <name>** — BLOCKED: <notes>`
   - `skipped` → `- [ ] **<category>: <name>** — Skipped: <notes>`

   Omit scenarios still in `planned` status (QA didn't get to them). If any exist, add a note: "_N scenarios not yet executed._"

2. **Existing `## Manual QA` section on the PR body** (when no JSON file exists): Read the existing PR body before writing. Incorporate the QA checklist items (with their pass/fail/blocked status) into this section — do not discard them.
3. **Neither exists**: Write "No manual QA performed." Do not generate speculative test scenarios. If you believe QA should be run, note: "Consider running `/qa` to generate and execute a test plan."

#### Related issues

Links to GitHub issues this PR closes or relates to. Use `Closes #123` syntax where applicable. **Omit if none.**

#### Future considerations

Items surfaced during review that are out of scope for this PR but worth tracking. Updated during the review loop as reviewers raise pre-existing or tangential issues. **Omit if none.**

### Step 3: Apply

First, verify `gh` CLI is available (`gh auth status`). If unavailable, output the PR body for the user (or the invoking skill) to apply manually — do not fail silently.

**Creating a new PR:**

```bash
git push -u origin <branch>
gh pr create --draft --title "<concise title>" --body "$(cat <<'EOF'
<filled-in PR body>
EOF
)"
```

**Updating an existing PR:**

```bash
gh pr edit <number> --body "$(cat <<'EOF'
<updated PR body>
EOF
)"
```

When updating, rewrite the full body to reflect current reality. Do not patch individual sections — the body is stateless.

---

## When invoked by other skills

When `/ship`, `/review`, or another skill delegates PR body work:

- Accept any context they provide (SPEC.md path, PR number, QA results, review feedback).
- Return the filled-in PR body for them to apply, or apply it directly if a PR number is available.
- The invoking skill decides *when* to update the PR body; this skill handles *how*.
- **When composed with `/ship`:** The draft PR already exists (created after Phase 2 with a stub body). You will be invoked with a PR number to write the full body via `gh pr edit`. You do not need to create the PR — only write the body.

---

## Calibrating depth

Match PR body depth to what changed:

| What changed | PR body depth |
|---|---|
| New feature (multi-file, user-facing) | All sections — summary, key decisions, recordings, review setup, manual QA |
| Enhancement to existing feature | Summary, manual QA. Key decisions if design choices were made. |
| Bug fix | Summary, manual QA. |
| Config / infra / refactor | Summary only. |
