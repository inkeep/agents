# PRD: Release Notes Drafter Agent

## Overview

**Name:** `release-notes-drafter`  
**Purpose:** Generate polished, user-friendly GitHub release notes that are reviewed in the Version Packages PR before publishing.

**Core Insight:** Changesets handles the *tracking* of changes perfectly. Claude handles the *communication* of changes to users. Together: structured data + natural language polish.

---

## Problem Statement

Currently, the release workflow:
1. Developers create changeset files with descriptions
2. `changesets/action` creates a "Version Packages" PR with raw changelog
3. PR is merged, draft GitHub release is created
4. Maintainers manually curate the draft release (15-30 min)
5. Release is published

**Pain points:**
- Release notes are drafted *after* merge, missing the PR review opportunity
- Raw changeset output is verbose and developer-focused
- Manual curation happens under time pressure (release is already out)
- No consistent "house style" enforcement
- Breaking changes may not be prominently highlighted

**Desired workflow:**
1. Developers create changeset files with descriptions (unchanged)
2. `changesets/action` creates "Version Packages" PR
3. **Claude enhances the PR with polished release notes** ← NEW
4. Team reviews/edits release notes in PR (standard PR review flow)
5. PR merges with approved release notes
6. GitHub release is created with pre-approved content

---

## Goals

1. **Review release notes before publishing** - in the Version Packages PR
2. **Leverage changesets for tracking** - don't reinvent the wheel
3. **Use Claude for communication** - natural language polish and summarization
4. **Enforce consistent style** - based on curated examples like v0.43.0
5. **Reduce maintainer effort** - from 15-30 min post-merge to quick PR review

## Non-Goals

- Replacing changesets' tracking functionality
- Fully automated publishing (always human review in PR)
- Modifying actual release artifacts or package versions
- Generating marketing copy or blog posts

---

## User Stories

### STORY-1: Review Release Notes in Version Packages PR
**Priority:** 1 (Must Have)

**As a** maintainer releasing a new version  
**I want** polished release notes in the Version Packages PR  
**So that** I can review/edit them before merge (not after)

**Acceptance Criteria:**
- [ ] Release notes appear in Version Packages PR body
- [ ] Notes are generated automatically during `changeset version`
- [ ] Raw changelog is preserved (collapsed) for reference
- [ ] Edits to PR body are preserved in final release

### STORY-2: Highlight Breaking Changes with Migration Guides
**Priority:** 1 (Must Have)

**As a** developer consuming these packages  
**I want** breaking changes prominently highlighted with migration guides  
**So that** I know exactly what to change when upgrading

**Acceptance Criteria:**
- [ ] Breaking changes appear in dedicated section at top
- [ ] Each breaking change includes before/after code examples
- [ ] Migration steps are explicit and actionable
- [ ] Visual indicator (🚨 or similar) for breaking changes

### STORY-3: Maintain Changeset Workflow
**Priority:** 1 (Must Have)

**As a** developer  
**I want** to keep using changesets as normal  
**So that** I don't need to learn a new workflow

**Acceptance Criteria:**
- [ ] `pnpm bump` workflow unchanged
- [ ] Changeset file format unchanged
- [ ] No new required fields in changeset descriptions
- [ ] Well-written changesets → better release notes (GIGO principle)

### STORY-4: Summarize with Highlights Section
**Priority:** 2 (Should Have)

**As a** user scanning release notes  
**I want** a quick summary of what's important  
**So that** I can decide if I need to read more

**Acceptance Criteria:**
- [ ] 3-5 bullet Highlights section at top
- [ ] Prioritized by user impact, not code volume
- [ ] Links to detailed sections below

### STORY-5: Handle API Failures Gracefully
**Priority:** 2 (Should Have)

**As a** maintainer  
**I want** releases to proceed even if Claude API fails  
**So that** we're never blocked on AI infrastructure

**Acceptance Criteria:**
- [ ] API timeout → fall back to raw changelog
- [ ] API error → log warning, proceed with raw changelog
- [ ] Never block the release workflow
- [ ] Clear indication when notes are auto-generated vs fallback

### STORY-6: Local Preview (Nice to Have)
**Priority:** 3 (Nice to Have)

**As a** maintainer preparing a big release  
**I want** to preview release notes locally before PR  
**So that** I can iterate on changeset descriptions

**Acceptance Criteria:**
- [ ] `pnpm release-notes:preview` command
- [ ] Shows what release notes would look like
- [ ] Fast feedback loop for improving changesets

---

## Technical Approach

### Integration Options (Pick One)

#### Option A: Custom Version Script (Recommended)

The `changesets/action` accepts a custom `version` command. We can wrap `changeset version`:

```yaml
# .github/workflows/release.yml
- uses: changesets/action@v1
  with:
    version: pnpm run version:with-notes  # Custom script
```

```json
// package.json
{
  "scripts": {
    "version:with-notes": "changeset version && pnpm run generate-release-notes"
  }
}
```

**Pros:** Clean integration, runs at the right time, notes are in Version Packages PR
**Cons:** Requires Claude API call in CI (already have ANTHROPIC_API_KEY)

#### Option B: Separate Workflow on PR

Trigger a workflow when Version Packages PR is created/updated:

```yaml
on:
  pull_request:
    types: [opened, synchronize]
    branches: [main]
    
jobs:
  enhance-release-notes:
    if: startsWith(github.head_ref, 'changeset-release/')
    # ... call Claude, update PR body
```

**Pros:** Decoupled from changesets, easier to iterate
**Cons:** Timing issues with bot-created PRs, extra workflow complexity

#### Option C: Claude Code Agent (Manual/Semi-Auto)

Run locally or in CI: `claude --agent release-notes-drafter`

**Pros:** Full codebase context, can read actual code changes
**Cons:** Heavier weight, requires Claude Code setup in CI

---

### Recommended: Option A with Fallback to C

1. **Primary (CI):** Custom version script calls Claude API for fast, automated generation
2. **Fallback (Local):** Claude Code agent for complex releases or manual polish

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Version Packages PR                          │
├─────────────────────────────────────────────────────────────────┤
│  # Release Notes (Claude-generated)                             │
│                                                                 │
│  ## Highlights                                                  │
│  - 🚨 Breaking: Webhook signature verification revamped         │
│  - ✨ New: @inkeep/agents-mcp package for AI assistants         │
│  - 🔧 Fix: Trigger message template removal now works           │
│                                                                 │
│  ## Migration Guide                                             │
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  # Changelog (Changesets-generated, collapsed)                  │
│  <details>                                                      │
│  ## @inkeep/agents-core@0.43.0                                  │
│  ### Minor Changes                                              │
│  - de9bed1: Replace deprecated keytar...                        │
│  </details>                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Script Implementation

```typescript
// scripts/generate-release-notes.ts
import Anthropic from '@anthropic-ai/sdk';
import { getReleasePlan } from '@changesets/get-release-plan';
import { read } from '@changesets/config';

async function generateReleaseNotes() {
  // 1. Get release plan from changesets
  const cwd = process.cwd();
  const config = await read(cwd, {});
  const releasePlan = await getReleasePlan(cwd, config);
  
  // 2. Format for Claude
  const changesContext = releasePlan.releases.map(release => ({
    package: release.name,
    type: release.type,
    changesets: release.changesets.map(cs => cs.summary)
  }));
  
  // 3. Call Claude API
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: RELEASE_NOTES_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Generate release notes for:\n${JSON.stringify(changesContext, null, 2)}`
    }]
  });
  
  // 4. Write to file for PR body
  const notes = response.content[0].text;
  await fs.writeFile('.changeset/RELEASE_NOTES.md', notes);
}
```

### Style Guide Reference

Based on [v0.43.0](https://github.com/inkeep/agents/releases/tag/v0.43.0):

```markdown
# Changelog

## @inkeep/package-name@X.Y.Z

### Minor Changes

- commit-hash: **Feature name**
  
  Description of what changed and why it matters.
  
  **Breaking Changes:** (if applicable)
  - What broke
  - Migration: `old code` → `new code`

### Patch Changes

- commit-hash: Brief description
- commit-hash: Brief description
```

---

## Open Questions (Workshop Topics)

### Q1: Where do release notes live in the PR?

**Options:**
| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | PR body (replace changesets content) | Native GH experience | Lose raw changelog visibility |
| B | PR body (above changesets, collapsed raw) | Best of both worlds | Longer PR body |
| C | Separate file (RELEASE_NOTES.md) | Easy to find, version controlled | Extra file to manage |
| D | PR comment from bot | Non-intrusive | Easy to miss, not in diff |

**Recommendation:** Option B - Highlights + Migration Guide at top, raw changelog in `<details>` below

### Q2: How much context should Claude receive?

**Options:**
| Option | Context | Speed | Quality |
|--------|---------|-------|---------|
| A | Changeset summaries only | Fast (~2s) | Good for well-written changesets |
| B | + Package CHANGELOGs | Medium (~5s) | Better historical context |
| C | + Relevant source diffs | Slow (~15s) | Best for vague changesets |
| D | + Previous release notes | Medium (~5s) | Better style consistency |

**Recommendation:** Start with A+D, expand to C only if changeset description is < 50 chars

### Q3: What sections should release notes include?

Based on v0.43.0, options:
- [ ] **Highlights** - 3-5 bullet summary of biggest changes
- [ ] **Breaking Changes** - With migration guides and before/after code
- [ ] **New Features** - Grouped by package or by theme?
- [ ] **Bug Fixes** - Condensed or per-package?
- [ ] **Migration Guide** - Separate section or inline?
- [ ] **Full Changelog** - Collapsed raw changesets output

### Q4: Model selection

| Scenario | Model | Reasoning |
|----------|-------|-----------|
| CI automation | Sonnet | Fast, cost-effective, good enough |
| Complex release (major) | Opus via agent | Deep analysis needed |
| Manual polish | Claude Code | Full codebase context |

**Question:** Should major version bumps trigger more thorough analysis?

### Q5: Changesets package integration depth

**Options:**
| Option | Integration | Complexity |
|--------|-------------|------------|
| A | Read `.changeset/*.md` files directly | Simple, but raw |
| B | Use `@changesets/get-release-plan` | Structured data, recommended |
| C | Custom changelog function | Deep integration, harder to debug |
| D | Post-process generated CHANGELOG.md | Works with any changesets setup |

**Recommendation:** Option B - `@changesets/get-release-plan` gives us structured release data

### Q6: How to handle the "Version Packages" PR body?

The `changesets/action` generates the PR body. Options:
- A) **Replace entirely** - Our notes replace changesets' generated body
- B) **Prepend** - Add our notes above changesets' content
- C) **Modify in separate step** - Let changesets create PR, then update via `gh pr edit`

**Question:** Does `changesets/action` support custom PR body templates?

### Q7: Error handling

What if Claude API fails during `changeset version`?
- A) Fail the version command (blocks release)
- B) Fall back to raw changelog (release proceeds)
- C) Create PR with TODO placeholder for manual notes

**Recommendation:** Option B - Never block releases, but log warning

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to publish-ready notes | < 5 min review (down from 15-30 min) |
| Style consistency | Matches v0.43.0 format in 90%+ of output |
| Breaking change coverage | 100% of breaking changes highlighted |
| Manual edits required | < 20% of content needs changes |

---

## System Prompt Design

The quality of release notes depends heavily on the system prompt. Key elements:

```markdown
# Role
You are a technical writer creating release notes for the Inkeep Agent Framework.
Your audience is developers who use these packages.

# Style Guidelines (based on v0.43.0)
- Lead with impact, not implementation details
- Group by user impact: Breaking → Features → Fixes
- Use emoji sparingly: 🚨 breaking, ✨ new, 🔧 fix
- Include migration code examples for breaking changes
- Be concise: 1-2 sentences per change unless breaking

# Structure
## Highlights
3-5 bullets of the most impactful changes. Lead with what users care about.

## Breaking Changes (if any)
Each breaking change needs:
- What changed (old behavior → new behavior)
- Migration guide with before/after code
- Why this change was made

## New Features
Grouped by package or by theme, whichever is clearer.

## Bug Fixes
Condensed list unless fixes are significant.

<details>
<summary>Full Changelog</summary>
[Raw changesets output here]
</details>

# Examples
[Embed 1-2 curated release notes as few-shot examples]
```

---

## Implementation Phases

### Phase 1: Script MVP (1-2 days)
- [ ] Create `scripts/generate-release-notes.ts`
- [ ] Use `@changesets/get-release-plan` for structured data
- [ ] Claude API call with basic prompt
- [ ] Output to `.changeset/RELEASE_NOTES.md`
- [ ] Manual integration: copy to PR body

### Phase 2: CI Integration (1 day)
- [ ] Add `version:with-notes` script to package.json
- [ ] Update `release.yml` to use custom version command
- [ ] Modify `changesets/action` config to include notes in PR body
- [ ] Error handling: fallback to raw changelog on API failure

### Phase 3: Polish & Iteration (ongoing)
- [ ] Tune prompt based on real releases
- [ ] Add previous release context for style consistency
- [ ] Consider Claude Code agent for major releases
- [ ] A/B test: Claude-generated vs manual (track edit distance)

### Phase 4: Agent Definition (optional)
- [ ] Create `.claude/agents/release-notes-drafter.md` for manual use
- [ ] Add codebase analysis for vague changesets
- [ ] Support interactive refinement

---

## File Changes Summary

```
.changeset/
  config.json              # Update changelog setting (maybe)
  
scripts/
  generate-release-notes.ts    # NEW: Main script
  release-notes-prompt.md      # NEW: System prompt (version controlled)

.github/workflows/
  release.yml              # UPDATE: Use custom version command

package.json               # UPDATE: Add version:with-notes script

.claude/agents/
  release-notes-drafter.md # NEW (Phase 4): Agent for manual use
```

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time to publish-ready notes | < 5 min review | Track time from PR open to merge |
| Edit distance | < 20% of content changed | Diff Claude output vs published |
| Style consistency | Matches v0.43.0 format | Manual review checklist |
| Breaking change coverage | 100% highlighted | Audit post-release |
| CI reliability | < 1% failures | Monitor workflow runs |

---

## References

- **Example release:** https://github.com/inkeep/agents/releases/tag/v0.43.0
- **Current workflow:** `.github/workflows/release.yml`
- **Changeset config:** `.changeset/config.json`
- **Similar agent pattern:** `.claude/agents/pr-review.md`
- **Changesets docs:** https://github.com/changesets/changesets/blob/main/docs/modifying-changelog-format.md
- **@changesets/get-release-plan:** https://www.npmjs.com/package/@changesets/get-release-plan

---

## Appendix: v0.43.0 Release Structure Analysis

The v0.43.0 release follows this structure:

```
# Changelog                          ← Single top-level heading

## @inkeep/agents-cli@0.43.0         ← Package + version
### Minor Changes                    ← Bump type section
- commit: Description                ← Bullet with commit hash

### Patch Changes                    ← Patch section
- commit: Description
- commit: Description

## @inkeep/agents-manage-ui@0.43.0   ← Next package
...
```

**Observations:**
- Uses "Changelog" not "Release Notes"
- Package-centric organization (not change-type-centric)
- Minor Changes before Patch Changes
- Commit hashes included for traceability
- Breaking changes embedded in descriptions, not separate section

**Improvement opportunities:**
- Add Highlights section at top
- Pull breaking changes into dedicated section with migration guides
- Add visual hierarchy (emoji, formatting)
- Group related changes across packages when thematic
