Use when: Researching OSS technologies, libraries, frameworks, or platforms; any engineering/architecture research where source code is available
Priority: P0 for OSS research (ground truth); Skip for closed-source-only research
Impact: Without this, research relies on potentially outdated docs instead of authoritative source code

---

# Source Code Research: Ground Truth from OSS

When researching engineering technologies, **source code is ground truth**. If a question can be answered from source code, it should be answered from source code.

This reference covers when and how to use source code as the primary research source.

---

## Decision Tree: Source Code vs Web

```
Is the technology open source?
├── YES (fully OSS) ──────────────────────► Source code is PRIMARY
│   Clone repo, use subagents for deep      Web search COMPLEMENTS for:
│   research, ground findings in code       - Enterprise features
│                                           - Pricing, licensing details
│                                           - Best practices, war stories
│                                           - Ecosystem landscape
│
├── PARTIAL (closed product, open SDKs) ──► Hybrid approach
│   Check: client SDKs, templates,          Web search is PRIMARY
│   examples, API specs                     Source code SUPPLEMENTS
│   ⚠️ Check staleness (last commit)        (validate docs against code)
│
└── NO (fully closed) ────────────────────► Web search is PRIMARY
    Official docs, API refs, blog posts     No source to ground claims
    Flag confidence as INFERRED             (flag this in evidence)
```

**Decision rule:** If a research question *can* be answered from source code, it *should* be answered from source code.

---

## Identifying OSS Availability

During **Step 1 (Scoping)**, identify for each technology:

1. **Check GitHub/GitLab** - Search for official repo
2. **Check project website** - Look for "Source" or "GitHub" links
3. **Check package registry** - npm, PyPI, crates.io often link to source
4. **Note the license** - MIT, Apache, GPL = OSS; proprietary = check for open SDKs

Record in the rubric which technologies have OSS repos available.

---

## The Deep Research Pattern: Subagents for Code Analysis

For substantive OSS research, use subagents grounded in source code.

If you will use multiple subagents (especially in parallel):
- Also load `references/subagent-orchestration.md` for ownership rules, strict output templates, and gap closure.

### Step 1: Clone or Pull

```bash
REPO_DIR="$HOME/.claude/oss-repos"
mkdir -p "$REPO_DIR"

# Check if already cloned
if [ -d "$REPO_DIR/<repo-name>" ]; then
  cd "$REPO_DIR/<repo-name>" && git pull
else
  git clone <repo-url> "$REPO_DIR/<repo-name>"
fi
```

**Clone location:** `~/.claude/oss-repos/` — a shared, persistent location outside any project directory. Repos persist across sessions and are reusable from any working directory.

Don't bloat `<reports-dir>/` with cloned repos.

### Step 2: Guard against shallow/partial sources

Before relying on a repo:
* Verify it contains the expected `src/` (or equivalent) and not just README/CHANGELOG.
* If it's partial (SDK stubs, docs-only), treat as **Partial OSS** and:
  * re-clone from the correct upstream, or
  * explicitly log the limitation (confidence + report limitations).

### Step 3: Spin Up Subagents

For each major rubric dimension (or cluster of related dimensions), spawn a subagent with:

* **Questions to answer** (specific to the rubric facets)
* **Repository location**
* **Expected evidence** (file:line snippets)
* **Strict output contract** (prefer the Markdown template in `references/subagent-orchestration.md`)

Avoid broad prompts like "summarize the repo." Use targeted, falsifiable questions.

### Step 4: Parallelize for Large Repos (with ownership)

For large or complex repos, use multiple subagents in parallel:

| Subagent | Focus Area | Typical Questions |
|----------|------------|-------------------|
| Architecture | Core structure, data flow, abstractions | "How is X implemented?" |
| Configuration | Config system, env vars, defaults | "How is X configured?" |
| Security | Auth, authz, trust boundaries | "How does auth work?" |
| Integration | APIs, webhooks, extension points | "How do we integrate with X?" |
| Data | Schema, storage, migrations | "How is data structured?" |

To reduce overlap:
* assign cross-cutting sources (schema, changelog, entrypoints) to a single owner
* require other agents to avoid deep-reading those sources unless necessary (and to flag conflicts)

---

## High-Value Areas in a Codebase

When investigating a repo, prioritize these areas:

| Area | What You'll Find | Look For |
|------|------------------|----------|
| `README.md` | Project overview, quick start | Architecture hints, key concepts |
| `src/` or `lib/` | Core implementation | Main abstractions, data flow |
| `types/` or `*.d.ts` | Type definitions | Data models, API contracts |
| `config/` | Configuration system | What's configurable, defaults |
| `examples/` | Usage patterns | How it's meant to be used |
| `tests/` | Behavior specifications | Edge cases, expected behavior |
| `docs/` | Internal documentation | Architecture decisions, guides |
| `package.json` / `Cargo.toml` / etc. | Dependencies | What it relies on |
| `CHANGELOG.md` | Version history | Breaking changes, new features |
| `.env.example` | Environment variables | Required configuration |

---

## When Web Search Complements Code

Even for fully OSS projects, **always check web sources** for context that code alone cannot provide.

**Load:** `references/web-search-guidance.md` for:
- Source trustworthiness tiers (T1–T4)
- Web search priority tiers (P0/P1/P2)
- Dimension-aware category mapping
- Full categories reference

Key categories for OSS research (code can't tell you):
- **Open issues / discussions** — known bugs, limitations, what users struggle with
- **Official docs** — may be newer than code; intended vs implemented behavior
- **Security advisories / CVEs** — vulnerability history, response quality
- **Design intent** — author blogs, talks, RFCs; the "why" behind decisions
- **Production patterns** — best practices, gotchas, scaling stories

---

## Evidence Capture from Code

When capturing evidence from source code, include:

* **file path + line numbers** (for reproducibility)
* **commit hash or date** (code changes over time)
* **confidence level** (CONFIRMED vs INFERRED vs UNCERTAIN)

If you cannot confirm in code:
* document what you searched
* state why the evidence is insufficient
* recommend the next source to check (docs, issues, runtime test)

---

## Summary Checklist

Before starting OSS research:
- [ ] Identified OSS availability (full/partial/closed) in the rubric
- [ ] Cloned/pulled the right repos (not shallow stubs)
- [ ] Identified canonical sources (schema, entrypoints, changelog)
- [ ] If using subagents: created ownership map in `_shared-context.md`
- [ ] If using subagents: enforced strict Markdown output contract

During research:
- [ ] Claims are grounded in file:line evidence
- [ ] Negative evidence includes documented searches
- [ ] Gaps are captured for follow-up pass
- [ ] Confidence labels match evidence strength

After code research:
- [ ] Completed web search checkpoint (see `references/web-search-guidance.md` checklist)
