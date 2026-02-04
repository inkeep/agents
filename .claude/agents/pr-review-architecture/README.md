# PR Review Multi-Agent System

Multi-agent PR review system powered by Claude Code.

## Quick Start

```bash
# CI (automatic via GitHub Actions)
# Triggered on: pull_request [opened, synchronize]

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
│  Phase 2: Select Reviewers                                              │
│  └── Match changed files → relevant subagents                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Dispatch Reviewers (parallel)                                 │
│  ├── pr-review-standards (always)                                       │
│  ├── pr-review-frontend (if .tsx/.jsx in app/, components/, etc.)       │
│  ├── pr-review-docs (if .md/.mdx files)                                 │
│  └── ... other relevant reviewers                                       │
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
| [`pr-review-output-contract`](../../skills/pr-review-output-contract/SKILL.md) | Output schema |
| [`product-surface-areas`](../../skills/product-surface-areas/SKILL.md) | Surface dependency graph |

## Shared Skills

### product-surface-areas

All reviewers load `product-surface-areas` — a consolidated inventory of 63 customer-facing surfaces with a dependency graph showing what breaks when something changes.

**High-value for:**
- `pr-review-architecture` — evaluates system-wide impact and evolvability
- `pr-review-breaking-changes` — maps schema/contract changes to affected surfaces
- `pr-review-product` — evaluates customer mental-model impact and cross-surface coherence

**Lower-value for (candidates for removal):**
- `pr-review-comments` — focused on comment accuracy, not product architecture
- `pr-review-errors` — focused on error handling patterns within code
- `pr-review-tests` — focused on test coverage quality
- `pr-review-types` — focused on type design and invariants
- `pr-review-standards` — focused on micro-level code quality (bugs, security)
- `pr-review-docs` — already has `write-docs` for documentation standards
- `pr-review-frontend` — focused on React/Next.js technical patterns

If context window becomes a concern, remove from the lower-value reviewers first.

## Context Injection

PR context is auto-injected via a generated skill (no Read tool calls needed):

1. CI generates `.claude/skills/pr-context/SKILL.md` with PR metadata, diff, comments
2. All agents declare `skills: [pr-context, ...]` in frontmatter
3. Context loads into system prompt at spawn

## Adding a Reviewer

1. Create `.claude/agents/pr-review-{domain}.md`
2. Add `pr-context` and `pr-review-output-contract` to skills
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
