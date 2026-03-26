Use when: Assessing reviewer feedback (Stage 1, step 3); delegating to subagents
Priority: P0
Impact: Mechanical/uncritical response to reviews; missed nuance in feedback assessment; unresolved threads

---

# Review Protocol

This reference file contains the detailed protocols for the `/review` skill. The SKILL.md provides the workflow skeleton; this file provides the depth.

---

## Scripts

This skill provides two scripts for reliable GitHub data retrieval. Always prefer these over manual `gh` commands — they handle pagination, formatting, and common pitfalls (like `gh pr view --comments` missing inline review comments).

**Path resolution:** Script paths are relative to this skill's base directory (shown in the skill header when loaded), **not** your current working directory. Resolve the full path before invoking — e.g., `<skill-base>/scripts/fetch-pr-feedback.sh`. If the scripts are not found (e.g., in a Docker or isolated environment where the skill directory is not mounted), fall back to the equivalent `gh api` commands documented inline.

| Script | Purpose | Usage |
|---|---|---|
| `scripts/fetch-pr-feedback.sh` | Fetch reviews, inline comments, discussion comments, CI/CD status | `<skill-base>/scripts/fetch-pr-feedback.sh <pr> [--reviews-only] [--checks-only] [--since ISO]` |
| `scripts/investigate-ci-failures.sh` | Investigate failures: logs, failing steps, main comparison | `<skill-base>/scripts/investigate-ci-failures.sh <pr> [--compare-main] [--log-lines N]` |

For responding to feedback and resolving threads:

**Inline review threads** (reply, then resolve):
```bash
# Step 1: Reply to the thread
gh api --method POST repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies -f body="<reply>"

# Step 2: Resolve the thread (thread_id from fetch-pr-feedback.sh "Review Threads" section)
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id="<thread_node_id>"
```

Only inline review threads (code line comments) support resolution. Review bodies and PR discussion comments have no resolve mechanism — your reply serves as the closure.

**Top-level PR comment** (for review body responses or general discussion):
```bash
gh pr comment <pr_number> --body "<reply>"
```

Thread node IDs (`thread_id`) are included in the "Review Threads" section of `fetch-pr-feedback.sh` output. Use the `thread_id` value directly in the `resolveReviewThread` mutation above.

---

## PR body

Load `/pr` skill for all PR body work — it owns the template, section guidance, and principles (self-contained, stateless). When the PR body needs updating during the review loop (e.g., after implementing review feedback), re-load `/pr` skill with the PR number to rewrite it.

---

## Assessment protocol

You are a peer engineer evaluating suggestions — not a subordinate implementing directives. Reviewer comments are hypotheses about your code. Some will be correct and valuable. Some will be wrong, inapplicable, or based on incomplete understanding. Your job is to determine which is which, with evidence.

**Do not default to acceptance.** The path of least resistance (just apply every suggestion) produces worse code than thoughtful evaluation. Equally, do not default to rejection — that wastes valid insights.

**NEVER defer to "future iterations."** You have no authority to commit to future work on behalf of the team. "We'll address this in a future iteration," "we'll revisit this later," and similar deferrals are never acceptable thread resolutions. Every suggestion must be evaluated to a conclusion in this review cycle — either accepted and implemented, or declined with evidence-based reasoning.

### 3a. Investigate before deciding

For each suggestion, build enough context to make a **high-confidence judgment**. The amount of investigation should be proportional to the suggestion's stakes:

| If the suggestion is... | Investigation depth |
|---|---|
| Pointing to a potential bug or correctness issue | **Deep.** Read the code path end-to-end. Trace the data flow. Check edge cases. Verify the claim is actually true in this context. |
| Proposing an alternative pattern or approach | **Medium.** Check how the codebase handles similar cases. Consider why the current approach was chosen. Evaluate tradeoffs. |
| Flagging a style/naming/convention issue | **Light.** Quick check of adjacent code for existing conventions. |
| Making a claim you're uncertain about | **Research.** Use web search, load `/research` skill, or use codebase inspection to gather evidence. Do not guess. |

Investigation tools (use as needed):
- **Codebase inspection:** Read adjacent files, grep for patterns, trace call chains. Understand what the reviewer may not have seen. Load `/explore` skill for structured understanding — pattern discovery or end-to-end flow tracing.
- **Spec/intent check:** If a SPEC.md was provided, re-read the relevant sections. Does the suggestion align with or contradict the design intent?
- **Web search:** For claims about library behavior, API semantics, best practices, or security considerations.
- **`/research`:** For complex questions requiring deep investigation (e.g., "is this pattern actually safer?" or "how do other systems handle this?"). Load `/research` skill for research-grade evidence trails.
- **`/analyze`:** For non-trivial suggestions involving genuine tradeoffs, architectural alternatives, or multi-dimensional evaluation where there is no clear right answer. Load `/analyze` skill for structured reasoning before deciding.
- **Product context:** Consider how the change affects users, other consumers, and downstream systems. A technically valid suggestion may be wrong for the product.

**Litmus test for investigation depth:** Could you explain your reasoning to a senior engineer and defend it with evidence? If not, you have not investigated enough. An assessment backed by "I think" or "it seems" has not met the standard. An assessment backed by "I read the code path and confirmed X" or "I checked the spec and this contradicts section Y" has.

**Name your confidence before deciding.** Before moving from investigation to evaluation, identify where you stand:

| Confidence | What it means | What to do |
|---|---|---|
| **HIGH** | You can point to specific evidence — code lines, spec sections, test results, documentation — that confirms your assessment. | Proceed to evaluate and decide. |
| **MEDIUM** | Your assessment is plausible but depends on unverified assumptions, or a reasonable alternative interpretation exists. | Investigate further if stakes warrant it. If you proceed, flag the uncertainty in your reply. |
| **LOW** | You cannot cite specific evidence for your position. | Do not decide yet. Investigate more, or consult the user. |

Defaulting to HIGH without evidence is a failure mode — it produces confident-sounding replies that don't hold up to scrutiny.

**For in-scope suggestions, investigate until you conclude.** Do not abandon investigation because it requires effort. Use all available tools — codebase inspection, web search, `/research`, spec review — autonomously and iteratively until you reach at least MEDIUM confidence. If you cannot reach MEDIUM confidence after thorough investigation, consult the user with what you found and your leaning. Deferring to a "future iteration" is never an acceptable stopping point.

**Confidence ceiling for unverified external claims:** Claims about library behavior, API semantics, deprecation status, or framework best practices — whether made by a reviewer or from your own knowledge — cannot reach HIGH confidence without verification (web search, official documentation, or codebase inspection). Training-data knowledge is not verification.

### 3b. Evaluate across multiple dimensions

For each suggestion, assess:

| Dimension | Question to answer |
|---|---|
| **Validity** | Is the premise correct? Does the issue the reviewer identified actually exist? |
| **Correctness** | Is the proposed fix/change actually correct, or does it introduce new problems? |
| **Applicability** | Does this apply in this specific context, or is it generic advice that doesn't fit here? |
| **Relevancy** | Is this relevant to the PR's scope and intent, or is it a tangential improvement? |
| **Tradeoffs** | What are the pros and cons? Does applying the suggestion improve one thing but degrade another? |
| **Side effects** | What else changes if you apply this? Does it affect other code paths, tests, or consumers? |
| **Appropriateness** | Is this the right PR and right time for this change? |

You do not need to evaluate every dimension for every comment. Use judgment — a simple naming suggestion doesn't need a tradeoff analysis. A suggested architectural change does.

**For non-trivial suggestions** (architectural changes, alternative approaches, scope questions), deepen the evaluation with these additional dimensions. When the suggestion involves genuine tradeoffs with no clear winner, load `/analyze` skill to produce structured reasoning — feed it the suggestion, the current approach, and the dimensions below. Use the analysis output to inform your decision, not replace it.

| Dimension | What to weigh |
|---|---|
| **Necessity** | Does this solve a validated problem in this PR, or a hypothetical one? |
| **Proportionality** | Does the complexity of the suggested change match the complexity of the problem it addresses? |
| **Evidence** | What concrete evidence supports the suggestion over the current approach? |
| **Reversibility** | Can this decision be changed later, or is it a one-way door? |
| **Codebase conventions** | What do established patterns in this codebase suggest? |

If evidence does not warrant the complexity, prefer the simpler approach — but "simpler" means fewer moving parts, not fewer requirements. A response that skips a valid concern is not simpler; it is incomplete.

**Over-indexing looks like:** applying every suggestion without evaluating tradeoffs, refactoring adjacent code that the reviewer didn't flag, adding defensive checks for scenarios that can't occur in this code path.

**Under-indexing looks like:** dismissing architectural suggestions without reading the affected code paths, accepting "it works" as sufficient evidence, declining suggestions because they require effort rather than because they lack merit.

### 3c. Decide and act

After investigation, classify and act:

| Assessment | Action |
|---|---|
| Valid bug or correctness issue (confirmed by evidence) | Fix immediately. High priority. |
| Valid improvement aligned with scope (tradeoffs favorable) | Implement if effort is proportional to value. |
| Pre-existing issue or suggestion unrelated to this PR's changes (out of scope) | Decline for this PR. Update the PR description's "Future considerations" section to capture the item — do not just dismiss it. Reply explaining why it's out of scope. Mark resolved. |
| Incorrect or based on misunderstanding (you have evidence) | Reply explaining why, with evidence. Mark resolved. |
| Technically valid but tradeoffs are unfavorable | Reply explaining the tradeoffs and why you're declining. Mark resolved. |
| Style/preference with no correctness impact | Use your judgment. Prefer consistency with existing codebase. |
| Suggestion contradicts the spec or design intent | Reply referencing the spec. Consult user if ambiguous. |
| Uncertain after investigation | Consult the user. Present what you found and your leaning. |

**Do not flatten nuance.** Some suggestions involve genuine tradeoffs with no clear winner. When the honest assessment is "this is a legitimate tradeoff and reasonable engineers could disagree," say that — with your reasoning for the current approach. Forcing every suggestion into binary accept/decline discards information that helps reviewers understand your thinking.

### 3d. Reply with evidence

- **If accepting:** Brief acknowledgment of what you're fixing and why the reviewer was right. Push the fix, then mark resolved.
- **If declining:** Explain your reasoning with **specific evidence** — code references, spec sections, tradeoff analysis, or research findings. Be respectful but direct. Do not apologize for disagreeing; explain why you disagree. Mark resolved.
- **If partially accepting:** Explain what you're taking and what you're not, and why. This is often the right answer — a suggestion may be directionally correct but the specific implementation wrong.
- **If declining as out of scope:** Explain why the item is unrelated to this PR's changes (e.g., pre-existing pattern, tangential improvement). Note that you've added it to the PR description's "Future considerations" section so it's tracked. Do not say "we'll do in a future iteration" — you have no authority to make that commitment.

**Match your reply's certainty to your actual evidence level.** If your investigation left you at MEDIUM confidence, your reply should reflect that — "Based on my reading of X, I believe Y, though I may be missing context about Z" — rather than asserting conclusions you cannot fully support. Overstating certainty erodes trust and can lead to resolving threads that should remain open for discussion.

### 3e. Close the loop (response mechanics by feedback type)

Different GitHub feedback types have different resolution mechanisms. Use the right one:

| Feedback type | How to respond | How to close |
|---|---|---|
| **Inline review comment thread** (comment on a specific line of code) | Reply to the thread with your reasoning or acknowledgment. | **Resolve the conversation** via `resolveReviewThread` GraphQL mutation. This is the primary closure mechanism — it signals the thread is addressed. |
| **Review body** (top-level text in an APPROVE / REQUEST_CHANGES / COMMENT review) | Post a top-level PR comment addressing the points raised. | No "resolve" mechanism exists. Your reply serves as the closure. If the review requested changes and you have addressed them, the next review cycle from the reviewer supersedes it. |
| **PR discussion comment** (general comment on the PR, not part of a code review) | Reply in the thread. | No "resolve" mechanism. Your reply closes the loop. |
| **CI/CD failure** | Not a comment — handled in Stage 2. | Fix and push, or document as pre-existing. |

**When to resolve vs. when to reply only:**
- **Resolve** inline threads once the matter is settled — whether you accepted (and pushed the fix) or declined (and explained why). Do not leave threads open if you have made a final decision.
- **Do not resolve** threads where you are asking a follow-up question or where you expect further discussion. Leave those open for the reviewer to respond.
- For review-body-level feedback (REQUEST_CHANGES), your top-level PR comment should summarize which items you addressed and which you declined, so the reviewer can quickly re-evaluate.

---

## Subagent delegation template

When spinning up a subagent for implementation work during the review loop:

```
Task: [specific description of what to change]

Context:
- Working directory: [path]
- PR: [URL]
- Relevant spec section: [section, if SPEC.md is available]

Files to modify:
- [file1]: [what to change and why]
- [file2]: [what to change and why]

Current behavior: [what the code does now]
Expected behavior: [what it should do after the change]

Tests:
- Run: [test command — use the configured test command for this review session]
- Expected result: [what passing looks like]

Constraints:
- Follow existing patterns in adjacent files
- Do not modify files outside the listed scope
- Run typecheck and lint before finishing
```
