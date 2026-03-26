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

If you cannot verify live repo health, do not present the repo as a confident default recommendation. Either mark it as unverified or prefer a repo you can verify.

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

Adjust those expectations by category:

- **Fast-moving tools:** AI SDKs, starters, templates, and agent frameworks should usually show recent activity
- **Stable infrastructure:** Mature libraries, protocol implementations, and low-churn utilities may still be healthy with slower commit cadence
- **Reference repos:** Example apps and demos should not be treated as strong defaults unless they also show recent maintenance

Stars are relative to the ecosystem and use case. Use these only as rough anchors:

- **Strong signal:** clearly well adopted relative to similar repos in the same ecosystem
- **Moderate signal:** enough adoption to show real usage, but not necessarily category-leading
- **Weak signal:** low adoption relative to peers, especially when combined with stale activity

Do not reject a niche repo only because it has few stars. Low stars matter most when the repo is being proposed as a broadly trustworthy default and better-maintained alternatives exist.

## Response requirements

When recommending a repo, include short evidence:

- Repo name with link
- Latest activity date
- Star count
- A brief verdict: `recommend`, `caution`, or `avoid`

Use concrete dates, not vague phrases like "recent" or "old."

## Important nuance

- **Historical context:** If the user explicitly wants older or historically important repos, you may include them, but say they are historical references rather than current recommendations.
- **Popularity is not maintenance:** If a repo is widely starred but clearly stale, say so. Popularity does not override maintenance risk.
- **New but promising:** If a repo is new but fast-moving and already has credible adoption, it can still be a valid recommendation.
- **Unverified is not endorsed:** If you cannot verify live repo health, say that the recommendation is unverified instead of presenting it confidently.
