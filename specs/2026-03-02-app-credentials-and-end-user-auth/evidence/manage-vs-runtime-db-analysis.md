---
title: Manage DB vs Runtime DB — Design Principles and App Credential Placement
description: Analysis of the Doltgres (manage) vs PostgreSQL (runtime) design principle, and where app credentials fit.
created: 2026-03-02
last-updated: 2026-03-02
---

## The Design Principle

| Dimension | Manage DB (Doltgres) | Runtime DB (PostgreSQL) |
|---|---|---|
| **Purpose** | Configuration (what you design) | State (what happens when agents run) |
| **Versioning** | Branch-scoped (per-project branches) | Not versioned |
| **Mutation pattern** | Design-time (UI edits, branch commits) | Runtime (execution, connections) |
| **Audit** | Full commit history via Dolt | Standard timestamps only |
| **Branch semantics** | `{tenantId}_{projectId}_main`, custom branches | N/A |

**Confidence:** CONFIRMED (traced `withRef()`, `branchScopedDb` middleware, branch naming)

## What Lives Where

### Manage DB (Versioned Configuration)
- `projects`, `agents`, `subAgents`, `externalAgents`
- `contextConfigs` (headers, variables)
- `tools`, `functionTools`, `functions`
- `triggers`, `scheduledTriggers`
- `skills`, `subAgentSkills`
- `dataComponents`, `artifactComponents`
- All agent relationship tables
- `credentialReferences` (metadata/pointers, NOT actual secrets)
- Evaluation config (datasets, evaluators, job configs)

### Runtime DB (Transactional State)
- `conversations`, `messages`, `contextCache`
- `tasks`, `taskRelations`, `ledgerArtifacts`
- `apiKeys` (auth material)
- `triggerInvocations`, `scheduledTriggerInvocations`
- `projectMetadata` (lifecycle, not config)
- Work app installations: `workAppSlack*`, `workAppGitHub*`
- Evaluation execution: `datasetRun`, `evaluationRun`, `evaluationResult`
- Auth tables: `user`, `session`, `account`, `organization`, `member` (via Better-Auth)

**Confidence:** CONFIRMED (full schema read)

## The credentialReferences Pattern

`credentialReferences` in manage DB stores:
- `type` (nango, api_key, etc.)
- `name` (user-friendly label)
- `credentialStoreId` (pointer to external vault/Nango)
- `retrievalParams` (how to fetch the secret)
- `toolId`, `userId` (associations)

**Actual secrets live externally** (Nango, vault). The manage DB stores only the metadata/reference.

This is the closest analog to what app credentials need: a reference to auth material, with config metadata.

**Confidence:** CONFIRMED (read from source)

## Are App Credentials Versioned Entities?

**Analysis:**

Arguments FOR manage DB (versioned):
- App config (domains, agent access, auth mode) is "configuration" like tools/triggers
- You might want to audit config changes (Dolt commit history)
- credentialReferences already follows this pattern

Arguments AGAINST manage DB (versioned):
- App credentials represent **real external deployments** (a widget on customer's site, a Slack workspace) — not something you'd branch
- Would you want different widget configs on dev vs main branch? No — the widget is deployed to a real domain
- API keys are already in runtime DB, and app credentials are their evolution
- Work app installations (Slack, GitHub) are in runtime DB for the same reason
- Key material (hashes, secrets) should NOT be in a versioned DB where every branch has the hash visible
- Branching creates confusing semantics: "which app credentials exist on this branch?"

**Verdict:** App credentials are **deployment/connection state**, not **agent design configuration**. They belong in **runtime DB** — consistent with API keys, work app installations, and the principle that runtime DB holds "things that exist as real connections."

The auth policy config (domains, auth mode, PoW toggle) is configuration, but it's **environment-level config** (like API keys), not **branch-level config** (like agent prompts).

**Confidence:** INFERRED (architectural judgment — this is a design decision, not a fact to verify)

## Counter-Pattern: Triggers

Triggers are in manage DB and share similarities with app credentials:
- External things call in (webhooks)
- Have auth config (signing secrets)
- Have schemas (input validation)

But triggers are **agent-scoped** and define "how external events reach THIS agent" — they're part of the agent's design. App credentials are **project-scoped** and define "how THIS channel connects to agents" — they're about the external deployment, not the agent design.

**Confidence:** INFERRED
