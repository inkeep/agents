# AGENTS.md - Comprehensive Guide for AI Coding Agents

This file provides guidance for AI coding agents (Claude Code, Cursor, Codex, Amp, etc.) when working with code in this repository.

## Essential Commands - Quick Reference

### Build & Development
- **Build**: `pnpm build` (root) or `turbo build`
- **Dev**: `pnpm dev` (root) or navigate to package and run `pnpm dev`
- **Setup (core)**: `pnpm setup-dev` — core DBs (Doltgres, Postgres, SpiceDB), env config, migrations, admin user
- **Setup (optional services)**: `pnpm setup-dev:optional` — Nango + SigNoz + OTEL + Jaeger (run `setup-dev` first)
- **Optional services lifecycle**: `pnpm optional:stop` | `pnpm optional:status` | `pnpm optional:reset`

### Verification

**Pre-push** (run both, in order):
```bash
pnpm format     # auto-fix formatting
pnpm check      # lint + typecheck + test + format:check + env-descriptions + knip
```

**Single-command iteration:** `pnpm typecheck`, `pnpm lint` (`lint:fix`), `pnpm test`, `cd <pkg> && pnpm test --run <file>`

### Database Operations (run from monorepo root)
- **Generate migrations**: `pnpm db:generate` - Generate Drizzle migrations from schema changes
- **Apply migrations**: `pnpm db:migrate` - Apply generated migrations to database
- **Drop migrations**: `pnpm db:drop` - Drop migration files (use this to remove migrations, don't manually delete)
- **Database studio**: `pnpm db:studio` - Open Drizzle Studio for database inspection
- **Check schema**: `pnpm db:check`
- **Initialize auth**: `pnpm db:auth:init` - Create default organization and admin user for local development

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

**Valid package names:** `agents-cli`, `agents-core`, `agents-api`, `agents-manage-ui`, `agents-work-apps`, `agents-sdk`, `create-agents`, `ai-sdk-provider`

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

**When to create a changeset (MANDATORY):**
- Any bug fix, feature, or behavior change to a published package — even if the package is "internal-facing" (e.g., `agents-work-apps`, `agents-api`). If the code ships to users or affects runtime behavior, it needs a changeset.
- This includes work-app integrations (Slack, GitHub), API route changes, SDK changes, CLI changes, and core library changes.

**When NOT to create a changeset:**
- Documentation-only changes
- Test-only changes
- Internal tooling/scripts changes
- Changes to ignored packages (agents-ui, agents-docs, cookbook-templates, test-agents)

**Multiple changes in one PR:**
If a PR affects multiple packages independently, create separate changesets for each with specific messages. If changes are tightly coupled (e.g., updating types in core that SDK depends on), use a single changeset listing both packages.

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
- Run with `--run` flag to avoid watch mode
- 60-second timeouts for A2A interactions
- Each test worker uses an embedded Postgres (pglite) database with manage/run Drizzle migrations applied in setup

## Package Manager
- Always use `pnpm` (not npm, yarn, or bun)

## Architecture Overview

This is the **Inkeep Agent Framework** - a multi-agent AI system with A2A (Agent-to-Agent) communication capabilities. The system provides OpenAI Chat Completions compatible API while supporting sophisticated agent orchestration.

### Core Components

#### Unified API (`agents-api`)
The `agents-api` package contains all API domains under a single service:
- **`/domains/manage/`** - Agent configuration, projects, tools, and administrative operations
- **`/domains/run/`** - Agent execution, conversations, A2A communication, and runtime operations
- **`/domains/evals/`** - Evaluation workflows, dataset management, and evaluation triggers

#### Multi-Agent Framework

#### Database Schema (PostgreSQL + Drizzle ORM)
- [manage-schema.ts](./packages/agents-core/src/db/manage/manage-schema.ts) - Config tables (Doltgres)
- [runtime-schema.ts](./packages/agents-core/src/db/runtime/runtime-schema.ts) - Runtime tables (Postgres)

## Key Implementation Details

### Database Migration Workflow

#### Standard Workflow
1. Edit `packages/agents-core/src/db/manage/manage-schema.ts` or `packages/agents-core/src/db/runtime/runtime-schema.ts`
2. Run `pnpm db:generate` to create migration files in `drizzle/`
3. (Optional) Make minor edits to the newly generated SQL file if needed due to drizzle-kit limitations
4. Run `pnpm db:migrate` to apply the migration to the database

#### Important Rules
- ⚠️ **NEVER manually edit files in `drizzle/meta/`** - these are managed by drizzle-kit
- ⚠️ **NEVER edit existing migration SQL files after they've been applied** - create new migrations instead
- ⚠️ **To remove migrations, use `pnpm db:drop`** - don't manually delete migration files
- ✅ **Only edit newly generated migrations** before first application (if drizzle-kit has limitations)

### Testing Patterns (MANDATORY for all new features)
- **Vitest**: Test framework with 60-second timeouts for A2A interactions
- **Isolated Databases**: Each test worker gets in-memory SQLite database
- **Integration Tests**: End-to-end A2A communication testing
- **Test Structure**: Tests must be in `__tests__` directories, named `*.test.ts`
- **Coverage Requirements**: All new code paths must have test coverage

#### Example Test Structure
```typescript
// src/builder/__tests__/myFeature.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle success case', async () => {
    // Test implementation
  });

  it('should handle error case', async () => {
    // Test error handling
  });
});
```

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

### ⚠️ MANDATORY: Required for All New Features

**ALL new work MUST include these three components - NO EXCEPTIONS:**

✅ **1. Unit Tests**
- Write comprehensive unit tests using Vitest
- Place tests in `__tests__` directories adjacent to the code
- Follow naming convention: `*.test.ts`
- Minimum coverage for new code paths
- Test both success and error cases

✅ **2. Agent Builder UI Components** 
- Add corresponding UI components in `/agents-manage-ui/src/components/`
- Include form validation schemas
- Update relevant pages in `/agents-manage-ui/src/app/`
- Follow existing Next.js and React patterns
- Use the existing UI component library

✅ **3. Documentation**
- Create or update documentation in `/agents-docs/content/docs/` (public-facing docs)
- Documentation should be in MDX format (`.mdx` files)
- Follow the **write-docs** skill whenever creating or modifying documentation

**Before marking any feature complete, verify:**
- [ ] `pnpm check` passes
- [ ] UI components implemented in agents-manage-ui
- [ ] Documentation added to `/agents-docs/`
- [ ] Surface area and breaking changes have been addressed as agreed with the user (see “Clarify scope and surface area before implementing”).

### 📋 Standard Development Workflow

1. Create a branch: `git checkout -b feature/your-feature-name`
2. Run [Verification](#verification) before pushing
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
1. **Always call `graph.init()`** after creating agent relationships to persist to database
2. **Use builder patterns** (`agent()`, `subAgent()`, `tool()`) instead of direct database manipulation
3. **Preserve contextId** when implementing transfer/delegation logic - extract from task IDs if needed
4. **Validate tool results** with proper type guards instead of unsafe casting
5. **Test A2A communication end-to-end** when adding new agent relationships
6. **Follow the mandatory requirements above** for all new features

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
| Scenario | Use |
|---|---|
| Internal A2A delegation/transfer (same service) | `getInProcessFetch()` |
| Eval service calling the chat API on itself | `getInProcessFetch()` |
| Forwarding requests to internal workflow routes | `getInProcessFetch()` |
| Slack/work-app calls to `/run/api/chat` or `/manage/` routes | `getInProcessFetch()` |
| Calling an **external** service or third-party API | Global `fetch` |
| Test environments (falls back automatically) | Either (auto-fallback) |

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
| Helper | When to use |
|---|---|
| `requireProjectPermission('view' \| 'edit')` | Routes scoped to a project |
| `requirePermission({ project: 'create' })` | Org-level permission checks (admin) |
| `noAuth()` | Truly public endpoints (webhooks, OAuth callbacks) |
| `inheritedAuth(meta)` | Auth enforced by parent/global middleware |
| `inheritedRunApiKeyAuth()` | Run-domain routes behind API key middleware |
| `inheritedManageTenantAuth()` | Manage-domain routes behind session/API key middleware |
| `inheritedWorkAppsAuth()` | Work-apps routes behind OIDC/Slack middleware |

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
- **Examples**: `agents-cookbook/` for reference implementations

## Feature Development Examples

### Example: Adding a New Feature

#### 1. Unit Test Example
```typescript
// agents-api/src/__tests__/manage/newFeature.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NewFeature } from '../newFeature';

describe('NewFeature', () => {
  let feature: NewFeature;
  
  beforeEach(() => {
    feature = new NewFeature({ tenantId: 'test-tenant' });
  });

  it('should initialize correctly', () => {
    expect(feature).toBeDefined();
    expect(feature.tenantId).toBe('test-tenant');
  });

  it('should handle errors gracefully', async () => {
    await expect(feature.process(null)).rejects.toThrow('Invalid input');
  });
});
```

#### 2. Agent Builder UI Component Example
```tsx
// agents-manage-ui/src/components/new-feature/new-feature-form.tsx
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Form } from '../ui/form';

const newFeatureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  config: z.object({
    enabled: z.boolean(),
    value: z.string().optional()
  })
});

export function NewFeatureForm() {
  const [formData, setFormData] = useState({});
  
  return (
    <Form schema={newFeatureSchema} onSubmit={handleSubmit}>
      {/* Form fields */}
    </Form>
  );
}
```

#### 3. Documentation Example
```mdx
// agents-docs/content/docs/features/new-feature.mdx
---
title: New Feature
description: Brief description of what the feature does
---

## Overview
Brief description of what the feature does and why it's useful.

## Usage
```typescript
const feature = new NewFeature({
  id: 'feature-1',
  config: { enabled: true }
});

await feature.execute();
```

## API Reference
- `NewFeature(config)` - Creates a new feature instance
- `execute()` - Executes the feature
- `validate()` - Validates configuration

## Examples
[Include practical examples here]
```

// Also update agents-docs/source.config.ts to include the new page in navigation

## Debugging Commands

### Jaeger / OTLP Tracing Debugging
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

## AI Coding Assistant Guidance

This repository uses symlinks so multiple AI tools (Claude Code, Cursor, Codex) read from the same instructions.

| Source (edit this) | Symlinks (don't edit) |
|--------------------|----------------------|
| `AGENTS.md` | `CLAUDE.md` |
| `.cursor/skills/` | `.claude/skills/`, `.codex/skills/` |

AGENTS.md is always loaded by the Agent Harness, and Skills provide on-demand expertise for specific development tasks. They are auto-discovered — no need to document them here.