Use when: Any technical research involving web sources (closed-source, partial OSS, or complementing code research)
Priority: P0 for all research
Impact: Without this, web research lacks quality control; agents treat all sources equally and miss high-value categories

---

# Web Search Guidance

Quality standards and targeting for web-based research. Applies to:
- **Closed-source research** (web is primary)
- **Partial OSS research** (web supplements limited code)
- **OSS research** (web complements code — see also `source-code-research.md`)

---

## Source Trustworthiness Tiers

Prioritize by credibility. Higher tiers require less cross-referencing.

| Tier | Sources | Trust | Cross-reference? |
|------|---------|-------|------------------|
| **T1: Primary** | Official docs, maintainer blogs, GitHub issues/discussions, official Discord/Slack | High | No |
| **T2: High-trust third-party** | Company engineering blogs, conference talks, reputable publications | High | Rarely |
| **T3: Community** | Stack Overflow (accepted answers), Reddit (upvoted), dev.to, Medium (check author) | Medium | Yes — verify claims |
| **T4: General search** | Random tutorials, AI-generated content, undated posts | Low | Always — cross-reference required |

**Rule:** If a claim comes only from T3/T4 sources, mark confidence as INFERRED or UNCERTAIN and note the source tier in evidence.

### Recency signals

Recency is one quality signal — it compounds with source tier, not replaces it. Recent T4 content is still T4.

**Source tier modulates how fast content ages.** High-tier sources with durable methodology — peer-reviewed research, quantitative studies, official specifications, RFCs — retain value significantly longer than low-tier sources like blog posts, tutorials, or marketing content. A 3-year-old research paper with quantitative analysis is far more valuable than a 3-year-old marketing blog. Apply the recency thresholds below as default concern levels, but relax them for high-tier sources with rigorous methodology and tighten them for low-tier sources with shallow analysis.

**Default recency skepticism** (applies to all research unless the user explicitly requests historical/archival review):

| Content age | Recency adjustment |
|---|---|
| < 6 months | Recency is not a concern; apply normal tier judgment |
| 6–18 months | Verify claims against current docs/code before relying on them |
| > 18 months | Treat as historical context; assume details may have changed |

**Domain-specific relaxation:** For research explicitly focused on historical context, established standards (RFCs, IEEE, W3C), or academic literature review, these thresholds can be relaxed — but note this in the rubric during scoping so it's intentional, not accidental.

**Staleness red flags:**
- Undated posts (T4 by default)
- Version numbers that don't match current (e.g., "v1.x" content when researching v2+)
- Screenshots/examples that don't match current UI/API
- Comments noting "this is outdated"

**Rule:** When citing content >12 months old, note the publication date and flag potential staleness in evidence.

### Handling source conflicts

When sources disagree, flag the conflict — don't silently pick one.

| Conflict type | Resolution |
|---|---|
| **T1 vs T1** (e.g., docs vs GitHub issue) | Flag both; prefer more recent; note conflict in evidence |
| **T1 vs T2+** | Prefer T1; cite T2 as "alternative view" if substantial |
| **Code vs web (including T1 docs)** | Code is ground truth for *current behavior*; docs/web explain intent, document known bugs, or may be stale |
| **Old vs new** | Prefer recent unless old source has unique primary evidence |

**Rule:** Never silently resolve conflicts between credible sources. Document the disagreement and your reasoning in evidence.

### Vendor-sourced data (special case)

When a vendor publishes data about a feature they sell (e.g., an email platform reporting on email performance, a personalization tool reporting on personalization lift), treat the data as T2 at best, regardless of sample size. Flag vendor-incentive bias in evidence at capture time — do not defer this to post-hoc audit. This is not about distrust — it's about transparency for downstream synthesis.

---

## Web Search Priority Tiers

| Tier | When to check | Categories |
|------|---------------|------------|
| **P0: Always check** | Every research task | Open issues/discussions (known bugs, limitations), official docs (may differ from code), security advisories/CVEs, maintenance signals (commit frequency, release cadence, issue response time) |
| **P1: Check if dimension-relevant** | When rubric dimension touches these areas | Design intent (author blogs, talks, RFCs), production patterns, ecosystem comparisons, operational knowledge |
| **P2: Optional depth** | Comprehensive research or when P0/P1 leave gaps | Community tutorials, historical context, funding/governance, exhaustive adoption data |

---

## Dimension-Aware Web Search

Use this table to identify which web categories are most valuable for each dimension type.

| Dimension type | P0 web categories | P1 web categories |
|---|---|---|
| **Architecture** | Official docs, design blogs/RFCs | Conference talks, "how we built X" posts |
| **Security** | CVEs, security advisories, audit reports | Incident postmortems, vulnerability discussions |
| **Adoption/Fit** | Issue velocity, "who uses X" | Case studies, comparison articles, migration guides |
| **Integration** | Official integration docs, GitHub issues | Community tutorials, "X with Y" posts |
| **Operations** | Deployment docs, known scaling limits | Postmortems, monitoring guides, benchmarks |
| **Maintenance/Risk** | Commit frequency, contributor count | Funding status, governance, deprecation discussions |

---

## Web Search Categories Reference

| Category | Examples | What it tells you |
|----------|----------|-------------------|
| **Open issues / discussions** | Bugs, feature requests, known limitations | What users actually struggle with |
| **Official docs** | API refs, guides | Intended/documented behavior (may differ from code — verify when possible) |
| **Security advisories** | CVEs, audit reports | Vulnerability history, response quality |
| **Enterprise/paid features** | SSO, audit logs, SLAs | Capabilities not in OSS |
| **Pricing & licensing** | Cost, usage limits, license changes | Business/legal risk |
| **Best practices** | Production patterns, gotchas | Community knowledge |
| **Comparisons** | "X vs Y for use case Z" | Relative strengths/weaknesses |
| **Ecosystem landscape** | Adoption, alternatives | Market/community context |
| **Roadmap** | Future features, deprecations | Strategic direction, stability risk |
| **Design intent** | Author blogs, talks, RFCs | "Why" behind decisions |
| **Production case studies** | "How we use X at [Company]" | Battle-tested patterns |
| **Incident postmortems** | Failures mentioning X | How it fails in the wild |

---

## Web Search Checklist

For any research task:

- [ ] Identified source type (closed / partial OSS / full OSS) — determines web's role (primary vs complement)
- [ ] Checked P0 categories: open issues, official docs, CVEs, maintenance signals
- [ ] Checked P1 categories relevant to rubric dimensions
- [ ] Prioritized T1/T2 sources; cross-referenced T3/T4 claims
- [ ] Applied staleness skepticism; flagged old content with publication dates
- [ ] Flagged source conflicts rather than silently resolving them
- [ ] Captured web-sourced findings with URL + access date
- [ ] Noted source tier in evidence when confidence depends on it
