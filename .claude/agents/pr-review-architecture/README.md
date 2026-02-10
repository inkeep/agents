# PR Review Multi-Agent System

Multi-agent PR review system powered by Claude Code.

## Agent Roster

```
pr-review (orchestrator, opus)
├── pr-review-architecture        (opus)   — System design, boundaries, layering, evolvability
├── pr-review-breaking-changes    (opus)   — Backward compatibility, data contracts, migrations
├── pr-review-comments            (opus)   — Comment quality and inline code documentation
├── pr-review-consistency         (opus)   — Cross-codebase pattern consistency, naming, conventions
├── pr-review-devops              (opus)   — CI/CD, deployment, infrastructure changes
├── pr-review-docs                (opus)   — Documentation coverage and accuracy
├── pr-review-errors              (opus)   — Error handling, logging, observability
├── pr-review-frontend            (opus)   — React/Next.js patterns, UX, accessibility
├── pr-review-llm                 (opus)   — LLM integration patterns, prompting, streaming
├── pr-review-product             (opus)   — Product-level thinking, user impact, surface areas
├── pr-review-security-iam        (opus)   — Auth, tenant isolation, IAM, credential handling
├── pr-review-sre                 (opus)   — Reliability, performance, scaling, monitoring
├── pr-review-standards           (opus)   — Code style, linting, Biome conventions
├── pr-review-tests               (opus)   — Test coverage, quality, patterns
└── pr-review-types               (opus)   — TypeScript types, Zod schemas, type safety
```

## Quick Start

```bash
# CI (automatic via GitHub Actions)
# Triggered on: pull_request [opened, synchronize, ready_for_review]

# Local testing
claude --agent pr-review "Review the changes in this branch"
```

## Orchestrator Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 1: Analyze Context                                               │
│  ├── Read pr-context skill (diff, metadata, comments)                   │
│  └── Spawn Explore subagents to understand codebase/architecture        │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 1.5: Generate PR TLDR                                            │
│  ├── Fill pr-tldr template using Phase 1 analysis                       │
│  ├── Map surfaces via product-surface-areas + internal-surface-areas    │
│  └── Write filled TLDR to .claude/skills/pr-tldr/SKILL.md              │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Select Reviewers                                              │
│  └── Match changed files → relevant subagents                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Dispatch Reviewers (parallel)                                 │
│  ├── Detect context: diff mode (inline/summary) + review iteration      │
│  ├── First review: full-scope handoff (inline or summary mode)          │
│  ├── Re-review: delta-scoped handoff (files changed since last review)  │
│  └── Spawn all selected reviewers in parallel                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Judge & Filter                                                │
│  ├── Deduplicate (inline → file → multi-file → system)                  │
│  ├── Relevancy check (is it from this PR? already addressed?)           │
│  ├── Conflict resolution (when reviewers disagree)                      │
│  └── Final ranking by actionability                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 5: Inline Comments                                               │
│  └── Post up to 15 HIGH confidence, localized fixes                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 6: Summary Comment                                               │
│  ├── Critical/Major findings with issue → implications → fix            │
│  ├── Point-fix log (inline comments posted)                             │
│  ├── Recommendation (APPROVE / APPROVE WITH SUGGESTIONS / REQUEST)      │
│  └── Other findings (collapsed, lower priority)                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Reviewer Types

### Skill-Based Reviewers
Enforce compliance with documented standards. These load domain-specific "skill" files that codify best practices.

| Reviewer | Skills Loaded |
|----------|---------------|
| `pr-review-frontend` | vercel-react-best-practices, vercel-composition-patterns, next-best-practices |
| `pr-review-docs` | write-docs |
| `pr-review-breaking-changes` | data-model-changes, adding-env-variables |

### Problem Detection Reviewers
Detect fault classes and anti-patterns using domain expertise. No external skill files—knowledge is embedded in the agent definition.

| Reviewer | Detects |
|----------|---------|
| `pr-review-standards` | Bugs, security, performance, AGENTS.md compliance |
| `pr-review-errors` | Silent failures, swallowed errors, broad catches |
| `pr-review-tests` | Missing test coverage, test quality issues |
| `pr-review-types` | Type safety gaps, missing invariants |
| `pr-review-comments` | Stale/misleading comments |
| `pr-review-architecture` | Pattern inconsistency, poor abstractions |
| `pr-review-consistency` | Convention drift across APIs, SDKs, CLI, config, telemetry |
| `pr-review-product` | Customer mental-model clarity, concept economy, product debt |
| `pr-review-security-iam` | Auth bypass, tenant isolation, access control, credential handling |

## Files

| File | Purpose |
|------|---------|
| [`pr-review.md`](../pr-review.md) | Orchestrator |
| [`pr-review-*.md`](../) | Subagents |
| [`claude-code-review.yml`](../../../.github/workflows/claude-code-review.yml) | CI workflow |
| [`pr-review-output-contract`](../../../.agents/skills/pr-review-output-contract/SKILL.md) | Output schema |
| [`product-surface-areas`](../../../.agents/skills/product-surface-areas/SKILL.md) | Customer-facing surface dependency graph |
| [`internal-surface-areas`](../../../.agents/skills/internal-surface-areas/SKILL.md) | Internal subsystem dependency graph |
| [`find-similar`](../../../.agents/skills/find-similar/SKILL.md) | Peer/pattern discovery |
| [`pr-tldr`](../../../.agents/skills/pr-tldr/SKILL.md) | PR context brief template (filled at review time) |

## Shared Skills

### pr-tldr

`pr-tldr` is a template-based context brief that the orchestrator fills during Phase 1.5. It provides subagent reviewers with a shared baseline: surface impact analysis (customer-facing + internal), review state, and notable context.

**Loaded by:** All subagent reviewers (via `skills: [pr-tldr, ...]`).

**Written by:** The orchestrator during Phase 1.5 (the only file it writes).

### find-similar

`find-similar` provides a systematic framework for finding analogous code patterns in the codebase — peer implementations, sibling modules, existing helpers, and convention precedents.

**Loaded by:**
- `pr-review` (orchestrator) — general-purpose pattern lookup
- `pr-review-architecture` — locate related modules and peer implementations before assessing consistency
- `pr-review-consistency` — sibling discovery and convention comparison across surfaces

### product-surface-areas

`product-surface-areas` is a consolidated inventory of 63 customer-facing surfaces with a dependency graph showing what breaks when something changes.

**Loaded by reviewers that benefit from customer-facing surface context:**
- `pr-review` (orchestrator) — Phase 1.5 surface mapping
- `pr-review-architecture` — evaluates system-wide impact and evolvability
- `pr-review-breaking-changes` — maps schema/contract changes to affected surfaces
- `pr-review-product` — evaluates customer mental-model impact and cross-surface coherence
- `pr-review-consistency` — detects convention drift across surfaces
- `pr-review-security-iam` — surface triage for auth/access control
- `pr-review-standards` — AGENTS.md compliance checks
- `pr-review-errors` — error handling patterns
- `pr-review-types` — type safety across surfaces
- `pr-review-docs` — documentation coverage
- `pr-review-devops` — self-hosting artifact and env contract consistency

### internal-surface-areas

`internal-surface-areas` is a consolidated inventory of 94 internal subsystems (infra, tooling, shared code) with a dependency graph and Breaking Change Impact Matrix showing internal ripple effects.

**Loaded by reviewers that benefit from internal dependency context:**
- `pr-review` (orchestrator) — Phase 1.5 internal surface mapping
- `pr-review-architecture` — evaluates internal layering and cross-module dependencies
- `pr-review-breaking-changes` — traces schema/migration/env changes through internal dependency chains
- `pr-review-consistency` — detects internal convention drift (config, tooling, naming)
- `pr-review-devops` — sanity-checks internal ripple effects for infra/tooling changes
- `pr-review-security-iam` — maps auth/authz infrastructure surfaces
- `pr-review-sre` — traces observability and runtime engine dependencies
- `pr-review-llm` — navigates runtime engine internals (streaming, tools, sandboxes)

**Not loaded (context cost outweighs benefit):**
- `pr-review-comments` — focused on comment accuracy, not internal architecture
- `pr-review-tests` — focused on test coverage quality
- `pr-review-frontend` — focused on React/Next.js technical patterns (has its own skills)
- `pr-review-product` — focused on customer mental model, not internal plumbing
- `pr-review-standards` — micro-level correctness, not system-level ripple
- `pr-review-errors` — focused on error handling patterns
- `pr-review-types` — focused on type design and invariants
- `pr-review-docs` — focused on documentation file quality

## Context Injection

PR context is auto-injected via a generated skill (no Read tool calls needed):

1. CI generates `.claude/skills/pr-context/SKILL.md` with PR metadata, diff, comments
2. The orchestrator generates `.claude/skills/pr-tldr/SKILL.md` during Phase 1.5
3. All agents declare `skills: [pr-context, pr-tldr, ...]` in frontmatter
4. Context loads into system prompt at spawn

### Adaptive Diff Strategy (Large PR Resilience)

For PRs where the diff exceeds ~100KB (after exclude patterns), the workflow switches to **summary mode** to prevent reviewer context window exhaustion:

| Mode | Diff size | pr-context contains | Reviewers read diffs via |
|------|-----------|---------------------|--------------------------|
| `inline` | ≤ 100KB | Full diff embedded | Direct reading (zero tool calls) |
| `summary` | > 100KB | Metadata + file list + stats only | `git diff origin/{base}...HEAD -- <path>` on-demand |

**Why 100KB?** Each subagent loads pr-context as a system-prompt skill. A 500KB diff ≈ 128K tokens, leaving < 40K for reasoning in a 200K context window. The 100KB threshold (~25K tokens) keeps all reviewers comfortably within budget.

**Summary mode flow:**
1. CI writes full diff to `.claude/pr-diff/full.diff` (for bulk access)
2. pr-context skill gets metadata + file list + diff stats (lightweight)
3. Orchestrator provides each reviewer with a domain-scoped file list in the handoff message
4. Reviewers read specific file diffs on-demand via `git diff`

### Re-Review Scoping

On re-reviews (new commits since the last automated review), the system scopes reviewers to the delta:

1. CI detects the last review commit SHA and computes the delta (files, stats, diff)
2. pr-context gets a `## Changes Since Last Review` section with:
   - File list of what changed since the last review
   - Commit log and per-file diff stats
   - Actual delta diff content (if ≤ 30KB), otherwise a `git diff` command
3. pr-context gets a conditional `## Review Focus` directive telling reviewers to scope to the delta
4. The orchestrator (Phase 3.4) appends a delta-scoped file list to each reviewer's handoff

**Same quality bar, narrower scope:** Reviewers apply the same review process and severity criteria — the scoping is purely about which code to analyze, not what to flag.

### pr-context Sections (complete reference)

| Section | Always present | Content |
|---------|---------------|---------|
| PR Metadata | Yes | Number, title, author, base, repo, head SHA, size, labels, review state, diff mode, trigger |
| Description | Yes | Author-provided PR body |
| Linked Issues | Yes | Closing issues with labels and body (truncated at 1000 chars) |
| Commit History | Yes | `git log --oneline --reverse` |
| Changed Files | Yes | `git diff --stat` (per-file +/-) + `git diff --name-only` (full paths) |
| Diff | Yes | Full diff (inline mode) or summary mode instructions |
| Changes Since Last Review | Yes | First review message, or: metadata table, file list, commits, stats, delta diff |
| Review Focus | Re-review only | Delta-scoping directive (only when new commits exist since last review) |
| Prior Feedback | Yes | Automated comments, human threads, previous reviews, PR discussion |
| GitHub URL Base | Yes | File link and PR link patterns |

## Context Window Impact During Normal Development

**TL;DR: These files have zero meaningful impact on the context window when using Claude Code for regular development.**

### Agents (`.claude/agents/pr-review*.md`)

Agents are **only loaded when explicitly invoked** — either via `/pr-review` in a Claude Code conversation or via `claude --agent pr-review` in CI. During normal development sessions, these 16 files consume **zero tokens** in the context window. They are never auto-loaded, auto-discovered, or auto-triggered.

### Skills (`.agents/skills/pr-review-*/SKILL.md`)

PR-review skills use **progressive disclosure** and are configured to prevent any automatic loading:

```yaml
user-invocable: false
disable-model-invocation: true
```

- `user-invocable: false` — the skill cannot be triggered by the user typing a command
- `disable-model-invocation: true` — the model will never autonomously decide to load this skill

At startup, Claude Code only reads the **frontmatter metadata** (~100 tokens per skill) to build its skill index. The full skill content is **never loaded** unless another agent explicitly reads it via the `Read` tool during a PR review session.

### Summary

| Component | Files | Tokens at startup | Auto-triggered? |
|---|---|---|---|
| Orchestrator agent | 1 | 0 | No — explicit invocation only |
| Subagent agents | 15 | 0 | No — spawned by orchestrator only |
| `pr-review-output-contract` | 1 | ~100 (metadata only) | No — `disable-model-invocation: true` |
| `pr-review-check-suggestion` | 1 | ~100 (metadata only) | No — `disable-model-invocation: true` |
| `find-similar` | 1 | ~100 (metadata only) | No — `disable-model-invocation: true` |
| `pr-tldr` | 1 | ~100 (metadata only) | No — `disable-model-invocation: true` |
| **Total** | **20 files** | **~400 tokens** | **No** |

For comparison, `AGENTS.md` alone is ~12,000+ tokens and is always loaded. The PR review system's ~400 token metadata footprint is negligible.

## Adding a Reviewer

1. Create `.claude/agents/pr-review-{domain}.md`
2. Add `pr-context`, `pr-tldr`, and `pr-review-output-contract` to skills
3. Add to orchestrator's selection matrix in `pr-review.md` Phase 2

## Local Testing

Create the pr-context skill manually for local runs:

```bash
mkdir -p .claude/skills/pr-context
cat > .claude/skills/pr-context/SKILL.md << 'EOF'
---
name: pr-context
description: PR context for local testing
---
# PR Review Context
## Changed Files
```
src/example.ts
```
## Diff
```diff
+ console.log('test');
```
EOF
```
