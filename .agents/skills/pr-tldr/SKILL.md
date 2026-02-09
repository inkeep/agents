---
name: pr-tldr
description: |
  PR TLDR context brief — serves dual purpose:
  1. **Committed state (template):** Contains the document skeleton with {{FILL}} markers.
     The pr-review orchestrator loads this at startup, fills in the markers during Phase 1.5,
     and overwrites this file with the filled result.
  2. **Runtime state (filled):** After the orchestrator writes, subagent reviewers load this
     file and get the filled context brief.

  If you're reading this and see {{FILL}} markers, the template has not been filled in —
  either the orchestrator hasn't run yet, or you're viewing the committed source.

user-invocable: false
disable-model-invocation: true
---

# PR TLDR

> ⚠️ **AI-generated context brief — not exhaustive and may contain inaccuracies.** This was produced by an AI reviewing the changes to provide a best-effort starting baseline context. Impact analysis may miss affected surfaces or details. Treat all statements as observations, not facts. Cross-reference against the actual diff in `pr-context` , codebase, etc. as needed/relevant. 

## What This PR Appears to Do

{{FILL: 3-5 sentences synthesizing intent from the PR description, linked issues, and commit history. If intent is ambiguous, state the ambiguity rather than resolving it.}}

## Surface Impact

> This analysis is **best-effort, not exhaustive**. Surfaces may be missing, misattributed, or incorrectly linked. Use this as a starting point for your own investigation, not as a complete map.

### Customer-Facing Surfaces

Best-effort mapping derived from the `product-surface-areas` skill's catalog and Breaking Change Impact Matrix. May miss surfaces not in the catalog or misidentify file-to-surface relationships.

**Directly modified** (changed files appear to map to these surfaces):

{{FILL: Bullet list. Each entry: `- [Surface Name] — \`path/to/file.ts\``
If none: "No customer-facing surfaces appear to be directly modified by this PR."}}

**Transitively impacted** (depend on directly modified surfaces per the impact matrix):

{{FILL: Bullet list. Each entry: `- [Surface Name] — depends on [Directly Modified Surface]`
If none: "No transitive impacts identified."}}

**Potentially unaccounted** (in the transitive dependency chain but not updated by this PR):

{{FILL: Bullet list. Each entry: `- [Surface Name] — [brief factual note]`
Only include surfaces where (a) they appear in the transitive chain per the Breaking Change Impact Matrix AND (b) the PR does not visibly update them.
If none: "None identified — but this analysis may be incomplete."}}

### Internal Surfaces

Best-effort mapping derived from the `internal-surface-areas` skill's catalog and Breaking Change Impact Matrix. May miss surfaces not in the catalog or misidentify file-to-surface relationships.

**Directly modified** (changed files appear to map to these internal surfaces):

{{FILL: Bullet list. Each entry: `- [Surface Name] — \`path/to/file\` [brief factual context]`
Must cite changed files — don't list surfaces without file evidence.
If none: "No notable internal surfaces directly modified."}}

**Transitively impacted** (depend on directly modified internal surfaces per the impact matrix):

{{FILL: Bullet list. Each entry: `- [Surface Name] — depends on [Directly Modified Surface]`
Use the Breaking Change Impact Matrix in `internal-surface-areas` to trace one hop out from each directly modified surface.
If none: "No transitive impacts identified."}}

**Potentially unaccounted** (in the transitive dependency chain but not updated by this PR):

{{FILL: Bullet list. Each entry: `- [Surface Name] — [brief factual note]`
Only include surfaces where (a) they appear in the transitive chain per the Breaking Change Impact Matrix AND (b) the PR does not visibly update them.
If none: "None identified — but this analysis may be incomplete."}}

## File → Surface Map

{{FILL: Markdown table with columns `Key Changed File(s)` and `Surface(s)`.
Only include files that map to identifiable surfaces. Omit files with no clear mapping.
If no meaningful mappings: "No clear file-to-surface mappings identified."}}

## Review State

- **Review iteration:** {{FILL: First review / Re-review — N commits since last automated review}}
- **Delta since last review:** {{FILL: Brief characterization of what changed since the last automated review, derived from the "Changes Since Last Review" section in pr-context. Summarize which files changed and the nature of the commits to orient reviewers on where to focus. If first review, state "N/A — first review." If re-review with 0 new commits, state "No new commits since last review."}}
- **Active unresolved threads:** {{FILL: count and brief characterization, or "None"}}
- **Prior feedback status:** {{FILL: No prior feedback / Appears addressed / Partially addressed / Not visibly addressed}}

## Notable Context

{{FILL: 2-5 strictly factual bullet points, each verifiable against the codebase.
Appropriate examples:
  - "A similar pattern exists in `path/to/file.ts`"
  - "This module has N dependents in the monorepo"
  - "This is a new export from package X"
  - "This introduces a second [thing] alongside the existing one in [path]"
If nothing notable: "No additional context noted."}}
