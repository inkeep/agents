# AGENTS.md - Comprehensive Guide for AI Coding Agents

This file provides guidance for AI coding agents (Claude Code, Cursor, Codex, Amp, etc.) when working with code in this repository.

## Essential Commands - Quick Reference

### Development
- **Setup (core)**: `pnpm setup-dev` — core DBs (Doltgres, Postgres, SpiceDB), env config, migrations, admin user. Requires `pnpm build` first (imports from `agents-core/dist/`). Safe to re-run any time, but **will not add new env vars** to an existing `.env` — if features fail after pulling, compare `.env` against `.env.example`.
- **Setup (optional services)**: `pnpm setup-dev:optional` — Nango + SigNoz + OTEL + Jaeger (run `setup-dev` first)
- **Dev**: `pnpm dev` (root) or navigate to package and run `pnpm dev`

### Quality checks
**Single-command iteration:** `pnpm typecheck`, `pnpm lint` (`lint:fix`), `pnpm test`, `cd <pkg> && pnpm test <file>`

### Pre-push checks (run in order):
```bash
pnpm format     # auto-fix formatting (mutates files)
pnpm check      # build + lint + typecheck + test + format:check + env-descriptions + knip
```

### Command Timing Guide

`pnpm check` transitively triggers `build` (via turbo task graph: `typecheck` and `test` both depend on `build`). Running `pnpm build` before `pnpm check` is redundant.

#### When to run what

| Situation | Command | Time |
|---|---|---|
| Edited 1-3 files in one package | `pnpm typecheck` and/or `cd <pkg> && pnpm test <file>` | < 30s |
| Changed shared types/interfaces | `pnpm typecheck` (cross-package) | ~30-60s |
| Ready to commit | Nothing extra — pre-commit hook runs `lint-staged` automatically | ~5s |
| About to push / create PR | `pnpm format && pnpm check` | 3-5 min |
| Changed DB schema | `pnpm db:generate` -> review SQL -> `pnpm db:migrate` -> `pnpm typecheck` | varies |
| Added/removed dependency | `pnpm install --frozen-lockfile` then `pnpm check` before push | 3-5 min |
| Added/removed/renamed env var | `pnpm check:env-descriptions` (already part of `pnpm check`) | < 10s |
| Writing tests iteratively | `cd <pkg> && pnpm test <file>` repeatedly; `pnpm test` once before push | < 30s each |

#### Hooks (automatic, do not invoke manually)

| Hook | Trigger | Action |
|---|---|---|
| pre-commit | `git commit` | `lint-staged`: biome on staged files, agents-api tests if agents-api touched, OpenAPI snapshot if routes changed, AI artifact validation if `.claude/agents/` or `.agents/skills/` changed, script sync to create-agents-template if setup scripts changed |
| pre-push | `git push` | `pnpm format` (auto-fix) |

### Database Operations (run from monorepo root)

Migrations are split across two directories: `packages/agents-core/drizzle/manage/` (Doltgres) and `packages/agents-core/drizzle/runtime/` (PostgreSQL). Compound commands run both; per-database commands target one.

| Command | Scope | Notes |
|---|---|---|
| `pnpm db:generate` | both | Runs `db:manage:generate` + `db:run:generate` |
| `pnpm db:migrate` | both | Runs `db:manage:migrate` + `db:run:migrate` |
| `pnpm db:drop` | both | Use this to remove migrations — never delete files manually |
| `pnpm db:check` | both | Runs `db:manage:check` + `db:run:check` |
| `pnpm db:manage:generate` | manage only | Outputs to `drizzle/manage/` |
| `pnpm db:manage:migrate` | manage only | Uses custom `migrate-dolt.ts`; auto-commits to Dolt after applying |
| `pnpm db:run:generate` | runtime only | Outputs to `drizzle/runtime/` |
| `pnpm db:run:migrate` | runtime only | Standard drizzle-kit migrate |
| `pnpm db:auth:init` | — | Create default org and admin user for local development |

> `pnpm db:studio` has no compound form — use `db:manage:studio` or `db:run:studio` directly.

### Creating Changelog Entries (Changesets)

Create a changeset for any user-facing change to a published package:

```bash
pnpm bump <patch|minor|major> --pkg <package> "<message>"
```

**Examples:**
```bash
# Single package
pnpm bump patch --pkg agents-core "Fix race condition in agent message queue"

# Multiple packages (for tightly coupled changes)
pnpm bump minor --pkg agents-sdk --pkg agents-core "Add streaming response support"
```

**Valid package names:** `agents-cli`, `agents-core`, `agents-api`, `agents-manage-ui`, `agents-sdk`, `create-agents`, `ai-sdk-provider`

**Semver guidance:**
- **Major**: Reserved - do not use without explicit approval
- **Minor**: Schema changes requiring migration, significant behavior changes
- **Patch**: Bug fixes, additive features, non-breaking changes

#### Writing Good Changelog Messages

**Target audience:** Developers consuming these packages

**Style requirements:**
- Sentence case: "Add new feature" not "add new feature"
- Start with action verb: Add, Fix, Update, Remove, Improve, Deprecate
- Be specific about what changed and why it matters to consumers
- Keep to 1-2 sentences

**Good examples:**
- "Fix race condition when multiple agents connect simultaneously"
- "Add `timeout` option to `createAgent()` for custom connection timeouts"
- "Remove deprecated `legacyMode` option (use `mode: 'standard'` instead)"
- "Improve error messages when agent registration fails"

**Bad examples:**
- "fix bug" (too vague - which bug? what was the impact?)
- "update dependencies" (not user-facing, doesn't need changeset)
- "Refactored the agent connection handler to use async/await" (implementation detail, not user impact)
- "changes" (meaningless)

**When NOT to create a changeset:**
- Documentation-only changes
- Test-only changes
- Internal tooling/scripts changes
- Changes to ignored packages (agents-ui, agents-docs, cookbook-templates, test-agents)

**Multiple changes in one PR:**
If a PR affects multiple packages independently, create separate changesets for each with specific messages. If changes are tightly coupled (e.g., updating types in core that SDK depends on), use a single changeset listing both packages.

> **Do not** run `changeset version` or `changeset publish` — versioning and npm publishing are automated by the release pipeline.

### Running Examples / Reference Implementations
- Use `agents-cookbook/` for reference implementations and patterns.
- There is no `examples/` directory; prefer cookbook recipes or package-specific README files.

### Documentation Development
```bash
# From agents-docs directory
pnpm dev              # Start documentation site (port 3000)
pnpm build           # Build documentation for production
```

## Code Style (Biome enforced)
- **Imports**: Use type imports (`import type { Foo } from './bar'`), organize imports enabled, barrel exports (`export * from './module'`)
- **Formatting**: Single quotes, semicolons required, 100 char line width, 2 space indent, ES5 trailing commas
- **Types**: Explicit types preferred, avoid `any` where possible (warning), use Zod for validation
- **Naming**: camelCase for variables/functions, PascalCase for types/components, kebab-case for files
- **Error Handling**: Use try-catch, validate with Zod schemas, handle errors explicitly
- **No Comments**: Do not add comments unless explicitly requested

## Testing (Vitest)
- Place tests in `__tests__/` directories adjacent to code
- Name: `*.test.ts` or `*.spec.ts`
- Pattern: `import { describe, it, expect, beforeEach, vi } from 'vitest'`
- All package `test` scripts include `--run` (non-watch mode) — do not pass `--run` again via CLI
- 60-second timeouts for A2A interactions
- Each test worker uses an embedded Postgres (pglite) database with manage/run Drizzle migrations applied in setup

## Package Manager
- Always use `pnpm` (not npm, yarn, or bun)

## Architecture Overview

This is the **Inkeep Agent Framework** - a multi-agent AI system with A2A (Agent-to-Agent, based on [Google's A2A specification](https://google.github.io/A2A/) — JSON-RPC 2.0 over HTTP with SSE streaming) communication capabilities. The system provides OpenAI Chat Completions compatible API while supporting sophisticated agent orchestration.

### Web Framework (Hono v4)

The API is built on [Hono](https://hono.dev/) v4 with `@hono/zod-openapi` for typed routes. A single `OpenAPIHono` app is created in `agents-api/src/createApp.ts`, and each domain is mounted as a sub-router:

```
app.route('/manage', manageRoutes)
app.route('/run', runRoutes)
app.route('/evals', evalRoutes)
app.route('/.well-known', workflowRoutes)
app.route('/work-apps', workAppsRoutes)
app.route('/mcp', mcpRoutes)
```

Middleware is path-scoped and order-dependent — middleware registered before `app.route()` applies to that domain's routes. See `createApp.ts` for the full middleware stack.

### Package Dependency Graph

| Package | Depends on (internal) | Purpose |
|---|---|---|
| `agents-core` | — | Foundation: DB schemas, data-access, validation, middleware, env |
| `agents-sdk` | `agents-core` | Builder functions (`agent()`, `subAgent()`, `tool()`) for SDK/CLI use |
| `agents-api` | `agents-core`, `agents-work-apps`, `agents-mcp` | Unified API service (manage + run + evals domains) |
| `agents-work-apps` | `agents-core` | Slack and GitHub integration handlers |
| `agents-cli` | `agents-sdk`, `agents-core` | CLI for agent config sync and local dev |
| `agents-mcp` | — | MCP server for agent tooling (Speakeasy-generated, no internal deps) |
| `ai-sdk-provider` | `agents-core` | Vercel AI SDK provider |
| `agents-manage-ui` | `agents-core` | Next.js agent builder UI |
| `agents-docs` | `agents-cli`, `agents-core` | Public documentation site (Next.js/Fumadocs) |
| `create-agents` | `agents-core`, `agents-sdk`, `agents-cli`, `agents-manage-ui` | Project scaffolding template |

**Key fact:** `agents-api` does **not** depend on `agents-sdk` — they share `agents-core` but serve different contexts (server vs CLI).

### Core Components

#### Unified API (`agents-api`)
The `agents-api` package contains all API domains under a single service:
- **`/domains/manage/`** - Agent configuration, projects, tools, and administrative operations
- **`/domains/run/`** - Agent execution, conversations, A2A communication, and runtime operations
- **`/domains/evals/`** - Evaluation workflows, dataset management, and evaluation triggers

#### Multi-Agent Framework

The runtime agent execution is driven by `ExecutionHandler` (`agents-api/src/domains/run/handlers/executionHandler.ts`), a state-machine loop that: looks up the target agent, makes an A2A JSON-RPC call, inspects the result, and either completes or follows a transfer/delegation. Agents relate to each other in three ways:

| Relation type | Behavior | Where defined |
|---|---|---|
| **Transfer** | Switches the active sub-agent for the conversation (like a handoff) | `sub_agent_relations` table with `relationType = 'transfer'` |
| **Delegation** | Spawns a sub-task (internal, external, or team) and returns the result | `sub_agent_relations` table with `relationType = 'delegate'` |
| **Tool** | Exposed as a regular tool call to the LLM | Tool definitions in manage DB |

Builder functions (`agent()`, `subAgent()` from `@inkeep/agents-sdk`) are for SDK/CLI/cookbook use. Inside `agents-api`, use data-access functions directly (see "When Working with Agents" below). Load the `multi-agent-framework` skill for the full execution model, A2A protocol details, and agent card format.

#### Database Architecture (Two Databases)

The framework uses **two separate PostgreSQL-compatible databases** with different engines:

| Database | Engine | Schema File | Purpose |
|----------|--------|-------------|---------|
| **Manage** | **Doltgres** (port 5432) | [manage-schema.ts](./packages/agents-core/src/db/manage/manage-schema.ts) | Versioned config: projects, agents, tools, triggers, evaluators, skills |
| **Runtime** | **PostgreSQL** (port 5433) | [runtime-schema.ts](./packages/agents-core/src/db/runtime/runtime-schema.ts) | Transactional data: conversations, messages, tasks, API keys |

> ⚠️ **Doltgres is NOT fully PostgreSQL-compatible.** The manage database runs on [Doltgres](https://github.com/dolthub/doltgresql), a Git-like versioned database that supports most but not all PostgreSQL DDL. This means `drizzle-kit generate` can produce migration SQL that works on standard PostgreSQL but **fails on Doltgres**. Before designing schemas or generating migrations for the manage database, load the `data-model-changes` skill which documents Doltgres DDL constraints, safe patterns, and workarounds.

**Key distinctions:**
- **Manage DB (Doltgres)**: Configuration that changes infrequently. Supports Dolt branch/commit versioning — every project has its own branch (`{tenantId}_{projectId}_main`). All reads/writes **must** be scoped to the correct branch via `withRef()` or the `branchScopedDbMiddleware`; load the `manage-database-usage` skill before writing any manage DB query. Has DDL limitations — no `ALTER TYPE`, no `DROP TABLE CASCADE`, no advanced indexes.
- **Runtime DB (PostgreSQL)**: High-frequency transactional data. Standard PostgreSQL with no DDL restrictions. No cross-DB foreign keys to manage tables.

### Skills System

Skills are on-demand expertise documents (SKILL.md files) in `.agents/skills/<name>/`, auto-discovered by all major agents via symlinks. When this document says "load the X skill", reference it by name — your agent will find it.

> **Symlinks:** `AGENTS.md` → `CLAUDE.md`; `.agents/skills/` → `.claude/skills/`, `.cursor/skills/`, `.codex/skills/`. Always edit the source, not the symlink.

## Key Implementation Details

### Database Migration Workflow

> **Before making any schema change**, load the `data-model-changes` skill. It covers multi-tenancy scoping patterns, Doltgres DDL constraints, migration review checklists, and the table recreation workaround for operations Doltgres doesn't support.

#### Standard Workflow
1. Edit `packages/agents-core/src/db/manage/manage-schema.ts` or `packages/agents-core/src/db/runtime/runtime-schema.ts`
2. Run `pnpm db:generate` to create migration files in `drizzle/`
3. **Review generated SQL** — especially for manage migrations, check for Doltgres-incompatible patterns (see `data-model-changes` skill)
4. (Optional) Make minor edits to the newly generated SQL file if needed
5. Run `pnpm db:migrate` to apply the migration to the database

#### Important Rules
- ⚠️ **NEVER manually edit files in `drizzle/meta/`** - these are managed by drizzle-kit
- ⚠️ **NEVER edit existing migration SQL files after they've been applied** - create new migrations instead
- ✅ **Only edit newly generated migrations** before first application (if drizzle-kit has limitations)
- ⚠️ **Manage migrations are validated against real Doltgres in CI** (`Create Agents E2E Tests` job) - this is a required check and will block merge if the SQL is incompatible

### Environment Configuration
Required environment variables in `.env` files:
```
ENVIRONMENT=development|production|test
INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:password@localhost:5432/inkeep_agents
INKEEP_AGENTS_RUN_DATABASE_URL=postgresql://appuser:password@localhost:5433/inkeep_agents
PORT=3002
ANTHROPIC_API_KEY=required
OPENAI_API_KEY=optional
LOG_LEVEL=debug|info|warn|error
```

## High Product-level Thinking

This repo is a product with multiple user-facing surfaces and shared contracts. A “small” change in one place can have real side effects elsewhere.

**Rule:** Do NOT implement additional work beyond what the user requested. If you identify likely cross-surface impacts, **flag them** and **ask** the user to get full clarity and ensure high degree of product-level thinking. You can flag prior to starting new work/tasks, but also if you identify ambiguities or additional things to consider mid-execution. 

**If the request is NOT backed by a PRD, a well-specced artifact, or clearly scoped small task**, pause and ask targeted, highly relevant questions when the blast radius is unclear. When applicable, suggest user make a PRD; offer to help by leveraging the `prd` skill.

Your goal is to **AVOID**:
- locking in unintended behavior
- making changes without thinking through all potential interaction points for how a user may consume or interact with a product change
- breaking changes or breaking data contracts without clear acknowledgement and plan
- missing critical dimensions to feautre development relevant, like authorization or security
- identify any side effects of the work that is being asked
- implementations that contradict or duplicate existing patterns/abstractions

Your responsibility is to think through the work that is being done from all dimensions and considerations.

### What to clarify (high-signal triggers)
- **Definition shapes / shared types / validation rules** (agent/project/tool/credential/etc.)
- **Runtime behavior or streaming formats** (responses, tool calls, artifacts/components)
- **Tracing / telemetry** (span names, attribute keys, correlation IDs, exporter config)
- **Resources, endpoints, or actions** (create/update/delete, new capabilities)
- **Auth / permissions / tenancy** (view/use/edit boundaries, RBAC, fine-grained authz, multi-tenant scoping)

### Surface area analysis (load before planning or implementing)

This product has **50+ customer-facing** and **100+ internal tooling/devops** surfaces with complex dependency chains. When planning or implementing any feature or change, load the relevant surface area skill to map the blast radius and plan "to-dos" of all areas that need to be addressed before writing a line of code:

| Skill | Scope | Load when |
|---|---|---|
| `product-surface-areas` | APIs, SDKs, CLI, UIs, Widgets, Event Streams, docs, protocols, templates, etc. | Change affects anything a customer (developer or no-code admin) uses or depends on |
| `internal-surface-areas` | Build, CI/CD, DB, auth, runtime engine, test infra, internal AI tooling, etc. | Change affects infrastructure, tooling, or shared internals |

**Tip**: Both skills include dependency graphs, breaking change impact matrices, and transitive chain tracing for systematically identifying relevant surfaces and code paths that may be affected by changes.

## Development Guidelines

### ⚠️ MANDATORY: Delivery Requirements by Change Type

Not every change requires the same artifacts. Use the table below to determine what is required before marking work complete. When in doubt, apply the most conservative row that fits.

| Change type | Unit tests | UI components | Docs |
|---|---|---|---|
| New user-facing feature (API, config, behavior) | Required | Required if configurable via manage UI | Required |
| New internal feature (no customer surface) | Required | Not required | Not required |
| Bug fix | Required for the fixed path | Only if UI was broken or misleading | Only if docs were wrong |
| Refactor / internal restructure | Required (verify existing tests still pass) | Not required | Not required |
| Performance optimization | Required (benchmark or regression test) | Not required | Not required |
| Test-only or tooling-only change | Not required | Not required | Not required |

**Definitions:**
- **User-facing**: the change affects anything a customer (developer or no-code admin) directly observes or configures — API shape, SDK behavior, CLI output, UI, event payloads, public docs, agent behavior.
- **Configurable via manage UI**: the new capability has a corresponding setting, toggle, or input that belongs in the agent builder (e.g., a new agent config field, a new tool parameter, a new project setting).

**Before marking any work complete, verify:**
- [ ] `pnpm check` passes
- [ ] UI components implemented in agents-manage-ui with form validation schemas (if required per table)
- [ ] Documentation added to `/agents-docs/` following the `write-docs` skill (if required per table)
- [ ] Surface area and breaking changes have been addressed as agreed with the user

### Commit Messages

No strict format is enforced. Use sentence case with an action verb (e.g., "Fix race condition in task handler", "Add streaming support to delegation flow"). Keep the first line under 72 characters. The pre-commit hook checks formatting and lint only — not commit message format.

### 📋 Standard Development Workflow

1. Create a branch: `git checkout -b feature/your-feature-name`
2. Run pre-push checks before pushing: `pnpm format && pnpm check`
3. Commit, then `gh pr create`

The user may override this workflow (e.g., work directly on main).

### PR Review Agents

The `.claude/agents/pr-review*.md` agents are for **on-demand invocation only** (user requests a review, or CI triggers one). Do NOT invoke them during autonomous implementation workflows like `/ship` — those workflows delegate review to external reviewers via `/review`.

### 📁 Git Worktrees for Parallel Feature Development

Git worktrees allow you to work on multiple features simultaneously without switching branches in your main working directory. This is especially useful when you need to quickly switch context between different Linear tickets or have multiple features in progress.

#### Creating a Worktree

To spin off a new scope of work in a separate directory using git worktrees:

```bash
git worktree add ../pull-instrument -b feat/pull-instrument
```

**Important Conventions:**
- The directory name and branch name should match (e.g., `pull-instrument` matches `feat/pull-instrument`)
- Branch names should reference a Linear ticket when applicable (e.g., `feat/ENG-123-feature-name`)
- Worktree directories are temporary and should be removed after the work is complete

#### Working with Worktrees

```bash
# Create a new worktree for a feature
git worktree add ../my-feature -b feat/ENG-123-my-feature

# Navigate to the worktree directory
cd ../my-feature

# Work on your feature normally
# ... make changes, commit, push, create PR ...

# List all worktrees
git worktree list

# Remove a worktree after PR is merged (run from main repo)
git worktree remove ../my-feature

# Remove the remote branch after cleanup
git branch -d feat/ENG-123-my-feature
git push origin --delete feat/ENG-123-my-feature

# Prune stale worktree references
git worktree prune
```

#### When to Use Worktrees

✅ **Use worktrees when:**
- Working on multiple features simultaneously
- Need to quickly test/review another branch without stashing current work
- Running long-running processes (tests, builds) while working on something else
- Comparing implementations across different branches side-by-side

❌ **Use regular branches when:**
- Working on a single feature at a time
- Making quick hotfixes or small changes
- The overhead of managing multiple directories isn't worth it

**Reference**: [git-worktree documentation](https://git-scm.com/docs/git-worktree)

### When Working with Agents
1. **Use the correct persistence layer for your context**: In `agents-api`, create and manage agent relationships using data-access functions (e.g., `createSubAgentRelation()` from `packages/agents-core/src/data-access/`). In SDK/CLI/cookbook contexts, use builder functions (`agent()`, `subAgent()`, `mcpTool()`, etc. from `@inkeep/agents-sdk`) which handle persistence through the CLI sync workflow. Do not import `agents-sdk` builders inside `agents-api`.
2. **Preserve contextId** when implementing transfer/delegation logic — extract from task IDs if `task.context.conversationId` is absent or `'default'`. See `generateTaskHandler.ts` for the extraction pattern.
3. **Validate tool results** with proper type guards instead of unsafe casting
4. **Test A2A communication end-to-end** when adding new agent relationships

### Performance Considerations
- **Parallelize database operations** using `Promise.all()` instead of sequential `await` calls
- **Optimize array processing** with `flatMap()` and `filter()` instead of nested loops
- **Implement cleanup mechanisms** for debug files and logs to prevent memory leaks

### Internal Self-Calls: `getInProcessFetch()` vs `fetch`
Any code in `agents-api` or `agents-work-apps` that makes **internal A2A calls or self-referencing API calls** (i.e. calling another route on the same service) **MUST** use `getInProcessFetch()` from `@inkeep/agents-core` instead of the global `fetch`.

- `getInProcessFetch()` routes the request through the Hono app's middleware stack **in-process**, guaranteeing it stays on the same instance.
- Global `fetch` sends the request over the network, where a load balancer may route it to a **different** instance — breaking features that depend on process-local state (e.g. the stream helper registry for SSE streaming).
- This bug only manifests under load in multi-instance deployments and is extremely difficult to diagnose.

**When to use:**
- Internal A2A delegation/transfer (same service) — `getInProcessFetch()`
- Eval service calling the chat API on itself — `getInProcessFetch()`
- Forwarding requests to internal workflow routes — `getInProcessFetch()`
- Slack/work-app calls to `/run/api/chat` or `/manage/` routes — `getInProcessFetch()`
- Calling an external service or third-party API — global `fetch`
- Test environments — either (auto-fallback)

### Route Authorization Pattern (`createProtectedRoute`)
All API routes in `agents-api` **must** use `createProtectedRoute()` from `@inkeep/agents-core/middleware` instead of the plain `createRoute()` from `@hono/zod-openapi`. This is enforced by Biome lint rules and ensures every route has explicit authorization metadata (`x-authz`) in the OpenAPI spec.

```typescript
import { createProtectedRoute, noAuth, inheritedAuth } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../middleware/projectAccess';

// Standard protected route — pass the permission middleware directly
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    permission: requireProjectPermission('view'),
    // ... rest of route config
  }),
  handler,
);

// Public route (no auth) — use noAuth()
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/callback',
    permission: noAuth(),
    security: [],
    // ... rest of route config
  }),
  handler,
);

// Route where auth is enforced by parent middleware — use inheritedAuth()
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    permission: inheritedAuth({
      resource: 'organization',
      permission: 'member',
      description: 'Auth enforced by parent middleware in createApp.ts',
    }),
    // ... rest of route config
  }),
  handler,
);
```

**Key helpers:**
- `requireProjectPermission('view' | 'edit')` — routes scoped to a project
- `requirePermission({ project: 'create' })` — org-level permission checks (admin)
- `noAuth()` — truly public endpoints (webhooks, OAuth callbacks)
- `inheritedAuth(meta)` — auth enforced by parent/global middleware
- `inheritedRunApiKeyAuth()` — run-domain routes behind API key middleware
- `inheritedManageTenantAuth()` — manage-domain routes behind session/API key middleware
- `inheritedWorkAppsAuth()` — work-apps routes behind OIDC/Slack middleware

### Common Gotchas
- **Empty Task Messages**: Ensure task messages contain actual text content
- **Context Extraction**: For delegation scenarios, extract contextId from task ID patterns like `task_math-demo-123456-chatcmpl-789`
- **Tool Health**: MCP tools require health checks before use
- **Agent Discovery**: Agents register capabilities via `/.well-known/{subAgentId}/agent.json` endpoints

### File Locations
- **API Domains**: `agents-api/src/domains/` (unified API with manage/, run/, evals/ domains)
- **Core Agents**: `agents-api/src/domains/run/agents/Agent.ts`, `agents-api/src/domains/run/agents/generateTaskHandler.ts`
- **A2A Communication**: `agents-api/src/domains/run/a2a/`, `agents-api/src/domains/run/handlers/executionHandler.ts`
- **Evaluations**: `agents-api/src/domains/evals/` (evaluation workflows, dataset runs, triggers)
- **Management Routes**: `agents-api/src/domains/manage/routes/` (agent config, projects, tools, credentials)
- **Database Layer**: `packages/agents-core/src/data-access/` (agents, tasks, conversations, tools)
- **Builder Patterns**: `packages/agents-sdk/src/` (agent.ts, subAgent.ts, tool.ts, project.ts)
- **Schemas**: `packages/agents-core/src/db/manage/manage-schema.ts`, `packages/agents-core/src/db/runtime/runtime-schema.ts` (Drizzle), `packages/agents-core/src/validation/` (Zod validation)
- **Tests**: `agents-api/src/__tests__/` (unit and integration tests)
- **UI Components**: `agents-manage-ui/src/components/` (React components)
- **UI Pages**: `agents-manage-ui/src/app/` (Next.js pages and routing)
- **Documentation**: `agents-docs/` (Next.js/Fumadocs public documentation site)
- **Legacy Documentation**: `docs-legacy/` (internal/development notes)
- **Work Apps**: `packages/agents-work-apps/src/` (Slack and GitHub integration handlers), `agents-api/src/domains/work-apps/` (API domain entry point)
- **Examples**: `agents-cookbook/` for reference implementations

## Debugging Commands

### Jaeger / OTLP Tracing Debugging

> These commands require `pnpm setup-dev:optional` to be running.

Replace `service` with the current service name (e.g., `inkeep-agents-api` in prod, `inkeep-agents-api-test` in tests). If using SigNoz/OTLP, point to that host/port instead of localhost.

```bash
# Get all services
curl "http://localhost:16686/api/services"

# Get operations for a service
curl "http://localhost:16686/api/operations?service=inkeep-agents-api"

# Search traces for recent activity (last hour)
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&limit=20&lookback=1h"

# Search traces by operation name
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&operation=agent.generate&limit=10"

# Search traces by tags (useful for finding specific agent/conversation)
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&tags=%7B%22agent.id%22:%22qa-agent%22%7D&limit=10"

# Search traces by tags for conversation ID
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&tags=%7B%22conversation.id%22:%22conv-123%22%7D"

# Get specific trace by ID
curl "http://localhost:16686/api/traces/{trace-id}"

# Search for traces with errors
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&tags=%7B%22error%22:%22true%22%7D&limit=10"

# Search for tool call traces
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&operation=tool.call&limit=10"

# Search traces within time range (Unix timestamps)
curl "http://localhost:16686/api/traces?service=inkeep-agents-api&start=1640995200000000&end=1641081600000000"
```

### Common Debugging Workflows

**Debugging Agent Transfers:**
1. View traces: `curl "http://localhost:16686/api/traces?service=inkeep-agents-api&tags=%7B%22conversation.id%22:%22conv-123%22%7D"`

**Debugging Tool Calls:**
1. Find tool call traces: `curl "http://localhost:16686/api/traces?service=inkeep-agents-api&operation=tool.call&limit=10"`

**Debugging Task Delegation:**
1. Trace execution flow: `curl "http://localhost:16686/api/traces?service=inkeep-agents-api&tags=%7B%22task.id%22:%22task-id%22%7D"`

**Debugging Performance Issues:**
1. Find slow operations: `curl "http://localhost:16686/api/traces?service=inkeep-agents-api&minDuration=5s"`
2. View error traces: `curl "http://localhost:16686/api/traces?service=inkeep-agents-api&tags=%7B%22error%22:%22true%22%7D"`

