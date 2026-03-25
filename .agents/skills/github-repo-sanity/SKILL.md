---
name: github-repo-sanity
description: |
  Sanity-check GitHub repositories before citing, recommending, or comparing them.
  Use when an agent refers to GitHub repos, OSS libraries, starter kits, templates, SDKs, MCP servers, or example projects.
  Verify repo health using recent commit activity and adoption signals such as stars before recommending it.
  Prefer active repos; explicitly flag stale, archived, or low-signal repos instead of presenting them as good defaults.
---

# GitHub Repo Sanity

When mentioning GitHub repositories, do not treat existence as endorsement.

Default behavior: if a repo looks stale, weakly adopted, or unmaintained, avoid recommending it as a default option.

## When to use this skill

Use this skill when you:

- Recommend GitHub repositories to a user
- Compare multiple repositories or OSS options
- Cite a repo as an implementation model or best-in-class example
- Suggest a starter, template, SDK, tool, integration, or MCP server hosted on GitHub

Do not use this skill when the repo is only being mentioned as historical context, a private internal dependency, or a direct answer to "what is this repo?" In those cases, still flag staleness if it matters.

## Required checks

Before recommending a repo, verify:

1. Whether the repo is archived
2. How recent the latest meaningful commit is
3. The repo's star count
4. Whether the repo still appears maintained enough for the user's purpose

If browsing is available, verify using the live GitHub repo page or equivalent primary source. Do not guess on recency or stars.

## Decision rule

Treat **recent activity** as the primary signal and **stars** as a secondary sanity check.

### Recommend

Safe to recommend by default when most of the following are true:

- Not archived
- Latest meaningful commit is recent enough for the category
- Star count is credible for the use case or at least not suspiciously low
- Nothing else suggests abandonment

### Mention with caveat

Mention, but explicitly qualify, when:

- The repo is somewhat stale but still relevant
- Stars are low for a repo being presented as a general-purpose default
- The repo may be good for a narrow use case, but not a broadly safe recommendation

### Avoid as a default recommendation

Do not present the repo as a strong option when any of these are true:

- Archived
- No meaningful activity for a long period
- Very low stars combined with stale activity
- Better-maintained alternatives are available

## Practical thresholds

Use judgment by category, but default to these heuristics:

- **Green:** activity within roughly the last 6 months
- **Yellow:** last activity roughly 6 to 18 months ago
- **Red:** last activity older than roughly 18 months

Stars are contextual, but these are useful defaults:

- **Strong signal:** 500+ stars for broad developer tools, libraries, or templates
- **Moderate signal:** 100+ stars
- **Weak signal:** under 100 stars unless the repo is clearly niche or internal-facing

Do not reject a niche repo only because it has few stars. Low stars matter most when the repo is being proposed as a broadly trustworthy default.

## Response requirements

When recommending a repo, include short evidence:

- Repo name with link
- Latest activity date
- Star count
- A brief verdict: `recommend`, `caution`, or `avoid`

Use concrete dates, not vague phrases like "recent" or "old."

## Important nuance

- If the user explicitly wants older or historically important repos, you may include them, but say they are historical references rather than current recommendations.
- If a repo is widely starred but clearly stale, say so. Popularity does not override maintenance risk.
- If a repo is new but fast-moving and already has decent adoption, it can still be a valid recommendation.
- If you cannot verify live repo health, say that the recommendation is unverified instead of presenting it confidently.
