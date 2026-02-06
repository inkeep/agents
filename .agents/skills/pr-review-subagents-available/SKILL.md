---
name: pr-review-subagents-available
description: |
  Catalog of pr-review-* subagents with their scope, core questions, and model allocation.
  Use when dispatching PR reviews, improving reviewers, or understanding the review ecosystem.
user-invocable: false
disable-model-invocation: true
---

# PR Review Subagents Catalog

## Intent

This skill documents all available `pr-review-*` subagents, their ownership areas, and when to use each one.

**Use this skill when:**
- Dispatching PR reviews (orchestrator needs to know which reviewers to spawn)
- Improving reviewers (need to know which agent owns a pattern)
- Understanding scope boundaries (avoid overlap between agents)

---

## Subagent Roster

### Priority Ranking

Combined ranking by **reasoning demand** (how much model capability matters) and **criticality** (cost of a miss).

| Priority | Agent | Core Question | Model | Reasoning | Criticality |
|----------|-------|---------------|-------|-----------|-------------|
| #1 | `pr-review-security-iam` | "Could this be exploited?" | Opus | Tier 1 | Tier 1 |
| #2 | `pr-review-architecture` | "Will this age well?" | Opus | Tier 1 | Tier 1 |
| #3 | `pr-review-product` | "Is this good for customers?" | Opus | Tier 1 | Tier 2 |
| #4 | `pr-review-breaking-changes` | "Will this break existing users?" | Opus | Tier 3 | Tier 1 |
| #5 | `pr-review-consistency` | "Does this fit the existing world?" | Opus | Tier 2 | Tier 2 |
| #6 | `pr-review-errors` | "Does error handling follow best practices?" | Sonnet | Tier 2 | Tier 3 |
| #7 | `pr-review-standards` | "Is this code correct, secure, and clean?" | Sonnet | Tier 3 | Tier 2 |
| #8 | `pr-review-types` | "Does this type allow illegal states?" | Sonnet | Tier 3 | Tier 3 |
| #9 | `pr-review-tests` | "Are critical paths tested?" | Sonnet | Tier 3 | Tier 3 |
| #10 | `pr-review-frontend` | "Does this follow React/Next.js patterns?" | Sonnet | Tier 3 | Tier 3 |
| #11 | `pr-review-comments` | "Are comments accurate and useful?" | Sonnet | Tier 3 | Tier 3 |
| #12 | `pr-review-docs` | "Is documentation complete and correct?" | Sonnet | Tier 3 | Tier 3 |

### Tier Definitions

**Reasoning Demand:**
| Tier | What it means |
|------|---------------|
| Tier 1 | Requires reasoning about things *not in the code* — future implications, customer psychology, attacker mindset |
| Tier 2 | Cross-file/cross-surface reasoning grounded in concrete evidence |
| Tier 3 | Pattern matching against loaded skills/checklists/documented rules |

**Criticality:**
| Tier | What it means |
|------|---------------|
| Tier 1 | Misses cause incidents or irreversible debt (security vulnerabilities, data loss, one-way-door architecture) |
| Tier 2 | Misses cause meaningful customer/developer pain (confusing product surface, convention drift, shipped bugs) |
| Tier 3 | Misses are recoverable in follow-up PRs (stale comments, missing tests, suboptimal types) |

---

## Scope Boundaries (Key Distinctions)

### Types vs Consistency

| Concern | Owner | Example |
|---------|-------|---------|
| Type allows illegal states | `pr-review-types` | Optional fields for mutually exclusive states |
| Type duplicates existing schema | `pr-review-consistency` | Manual type when `z.infer` could be used |
| Unsafe type narrowing | `pr-review-types` | `as` assertion without runtime check |
| Type naming doesn't match peers | `pr-review-consistency` | `UserData` when siblings use `*Info` |

### Standards vs Security-IAM

| Concern | Owner | Example |
|---------|-------|---------|
| Generic SQL injection | `pr-review-standards` | User input in query without parameterization |
| Tenant isolation bypass | `pr-review-security-iam` | Missing org_id filter in multi-tenant query |
| XSS vulnerability | `pr-review-standards` | Rendering user input without sanitization |
| Auth bypass | `pr-review-security-iam` | Missing authentication middleware |

### Architecture vs Consistency

| Concern | Owner | Example |
|---------|-------|---------|
| Wrong module boundary | `pr-review-architecture` | Feature in wrong domain package |
| File in wrong directory | `pr-review-consistency` | Handler not following peer file placement |
| Circular dependency | `pr-review-architecture` | Packages importing each other |
| Import pattern differs from peers | `pr-review-consistency` | Using default import when peers use named |

---

## Quick Reference: Which Agent for Which Pattern?

| Pattern | Agent |
|---------|-------|
| DRY violations (types, schemas, utilities) | `pr-review-consistency` |
| Type safety / illegal states | `pr-review-types` |
| Auth/authz/tenancy | `pr-review-security-iam` |
| Module boundaries / dependencies | `pr-review-architecture` |
| Error handling patterns | `pr-review-errors` |
| Customer-facing surface changes | `pr-review-product` |
| Breaking changes / migrations | `pr-review-breaking-changes` |
| Code correctness / bugs | `pr-review-standards` |
| Test coverage | `pr-review-tests` |
| React/Next.js patterns | `pr-review-frontend` |
| Documentation quality | `pr-review-docs` |
| Comment accuracy | `pr-review-comments` |
