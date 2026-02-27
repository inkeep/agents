---
name: audience-impact
description: |
  Who does this change affect and how does it reach them? Maps audiences (roles × deployment modes) to impact propagation — immediate, next-publish, next-deploy, or silent.
  Use when planning, implementing, or reviewing a change to understand blast radius by audience.
  Complements product-surface-areas and internal-surface-areas (which catalog what exists; this skill tells you who cares).
  Triggers: who is affected, blast radius, breaking change, audience, persona, impact analysis, changeset needed, docs needed.
---

# Audience Impact

When assessing a change, ask: **who is on the other end, and how fast does this reach them?**

This skill provides a mental model — not an exhaustive ledger. Use it to reason about which audiences a change affects, then load the catalog skills for detailed surface tracing when needed.

## How to use this skill

1. Identify which **roles** and **deployment modes** the change touches (see definitions below)
2. Look up the change type in the **impact propagation table** to see how fast and how visibly it reaches each audience
3. Flag any **silent** impacts explicitly — these slip through review most often
4. If deeper surface tracing is needed, **Load:** `product-surface-areas` (customer-facing) or `internal-surface-areas` (internal subsystems)
5. Use the **deliverables table** to determine what artifacts the change needs (changeset, docs, migration guide, etc.)

When multiple audiences are affected, address them in pipeline order: immediate impacts first (Contributor), then versioned impacts (Builder — changeset + migration guide), then deployed impacts (Platform User — QA), then infrastructure (Self-hosted — docs). This matches the natural merge → publish → deploy sequence.

## Two-axis model

Audiences decompose into two independent axes:

**Role** — who is the person?
**Deployment mode** — where does the system run?

These are orthogonal. A Builder can be cloud or self-hosted. A Platform User can be cloud or self-hosted. Assess each axis independently.

## Roles

### Contributor
Develops the framework source code. Clones the repo, runs `pnpm setup-dev`, writes and tests code, submits PRs. They interact with build tooling, CI/CD, test infrastructure, database migrations, git hooks, changesets, and dev scripts. Changes to internal tooling, schemas, or dev workflows reach them **immediately** — they're working in the repo.

Representative surfaces: turbo/biome config, vitest setup, drizzle migration workflow, GitHub Actions, pre-commit hooks, `.agents/skills/`, AGENTS.md.

### Builder
Builds agents using published packages. Runs `npx create-agents`, installs `@inkeep/agents-sdk` and related packages, codes against the SDK builder API, uses the CLI (`inkeep push/pull/dev`), reads docs, and references cookbook templates. They interact with published npm contracts, TypeScript types, config file schemas (`inkeep.config.ts`), API endpoints, and documentation. Changes reach them **at the next npm publish or docs deploy** — there's a version boundary between their code and ours.

Representative surfaces: SDK builder functions (`agent()`, `project()`, `functionTool()`), CLI commands and flags, `defineConfig()` schema, published type exports, AI SDK provider, MCP package, OpenAI-compatible chat API, cookbook templates, agents-docs content.

### Platform User
Configures agents through the visual builder (manage-ui) without writing code. Creates projects, configures agents and tools via forms, manages API keys, sets up integrations (Slack, GitHub), views traces, runs evaluations, and manages team members and roles. Changes reach them **at the next UI deploy** — they see whatever the dashboard ships.

Representative surfaces: agent builder canvas, project/agent/tool/credential forms, API key management, traces dashboard, evaluation UI, work-app integration setup, member/role management, login and onboarding flows.

## Deployment modes

### Cloud
Uses Inkeep's hosted platform. Auth via SSO/Auth0, credentials managed through Nango-hosted OAuth, services deployed on Vercel. No infrastructure to manage. The `PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT` flag gates cloud-specific behavior.

Representative surfaces: Auth0/SSO config, Nango-hosted OAuth flows, Vercel deployment pipeline, cloud onboarding/invitation flows, hosted API URLs.

### Self-hosted
Deploys via Docker on own infrastructure. Manages databases (Doltgres, Postgres, SpiceDB), env vars (60+), auth setup (Better Auth, JWT keys), observability (OTEL/SigNoz), and applies migrations. Changes to infrastructure config, Docker setup, or env var schemas affect self-hosters directly — they must act on them.

Representative surfaces: `docker-compose.yml`, `.env.example`, database migration scripts, SpiceDB schema, OTEL exporter config, deployment docs (AWS/Azure/GCP/Hetzner guides).

Self-hosted is a **modifier** — it adds infrastructure surfaces on top of whatever role the person has. A self-hosted Builder manages both SDK integration *and* Docker deployment. A self-hosted Platform User manages both the dashboard *and* the underlying infrastructure.

## Impact propagation

This is the primary decision aid. Given a change, how fast and how visibly does it reach each audience?

| Change type | Contributor | Builder | Platform User | Self-hosted modifier |
|---|---|---|---|---|
| Internal tooling (biome, turbo, CI, test infra) | Immediate | None | None | None |
| Database schema (`manage-schema.ts`, `runtime-schema.ts`) | Immediate (run `db:migrate`) | Next publish (if types change) | Next deploy (if UI affected) | Must run migrations |
| SDK/core API (exports, types, builder signatures) | Immediate (tests break) | **Next publish — potentially breaking** | Transitive (if UI consumes affected API) | Transitive (if UI consumes affected API) |
| CLI commands or config schema | None | **Next publish — potentially breaking** | None | None |
| Manage UI (pages, forms, components) | None | None | **Next deploy — visible immediately** | Next deploy |
| API routes or response shapes | Immediate (snapshot tests) | **Next publish — potentially breaking** | Next deploy (if UI consumes it) | Next deploy |
| Validation schemas (Zod rules, allowed values, defaults) | Immediate (tests) | **Silent — previously valid input rejected** | **Silent — forms may fail unexpectedly** | **Silent — API calls may fail** |
| Docker/env config | Immediate (local dev) | None | None | **Immediate — must reconfigure** |
| Env var semantics (same name, changed meaning/format) | Immediate (local dev) | None | None | **Silent — system may behave incorrectly** |
| Documentation content | None | **Next docs deploy — may mislead** | Next docs deploy | Next docs deploy |
| Auth/permissions (RBAC, cookies, tokens) | Immediate (tests) | Next publish (if SDK auth changes) | **Next deploy — login/access may break** | Must update auth config |
| Telemetry contracts (span names, OTEL attributes) | Immediate (if tests assert spans) | None | None | **Silent — dashboards/alerts may break** |
| Trigger/webhook contracts (schemas, signatures, payloads) | Immediate (tests) | **Next publish — potentially breaking** | **Next deploy — trigger config may break** | Next deploy |

**Impact latency key:**
- **Immediate**: affects them in their current working session
- **Next publish**: affects them when they `npm update` — version boundary provides a buffer
- **Next deploy**: affects them when the UI/API redeploys — no version boundary, but there's a deploy gate
- **Transitive**: not directly affected, but may be affected if a downstream surface they use consumes the changed surface
- **Silent**: affects them without obvious signal — **most dangerous**. The system appears to work but behaves incorrectly (e.g., a validation change that silently rejects previously valid input, a telemetry contract change that breaks downstream dashboards)

## What counts as "breaking" per role

- **Contributor**: CI fails, tests break, dev setup stops working. Loud and immediate — usually caught before merge.
- **Builder**: Published API changes (removed exports, changed type shapes, new required config fields, altered CLI flags). Versioned via semver + changesets, but breaking changes in patch versions are especially harmful.
- **Platform User**: UI behavior changes (forms that worked differently, removed features, changed navigation). No version boundary — they experience it the moment it deploys.
- **Self-hosted**: Infrastructure contract changes (new required env vars, changed Docker config, new database migration steps). Silent if not documented — the system may appear to work but behave incorrectly.

## Deeper surface tracing

This skill tells you **who cares**. For detailed surface enumeration, load the catalog skills:

- **Load:** `product-surface-areas` — customer-facing surfaces (APIs, SDKs, CLI, UI, docs, templates). Maps primarily to Builder and Platform User roles.
- **Load:** `internal-surface-areas` — internal subsystems (build, CI, test, DB, auth, runtime). Maps primarily to Contributor role and the self-hosted modifier.

## Deciding what deliverables a change needs

| Affected audience | Likely deliverables |
|---|---|
| Contributor | Update/add tests. Update AGENTS.md if workflow changes. Update skills if conventions change. |
| Builder | Changeset (semver). Docs update. Migration guide if breaking. |
| Platform User | QA the UI change. Update visual-builder docs if behavior changes. |
| Self-hosted | Update `.env.example`. Update deployment docs. Migration guide if infra changes. |
| Cloud-only | Verify feature flag gating. Update cloud-specific onboarding if affected. |
