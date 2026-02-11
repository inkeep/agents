---
name: manage-database-usage
description: "How to correctly access the Doltgres manage database with branch-scoped connections. Use when reading or writing manage data (agents, tools, projects, credentials, triggers, evaluators, etc.). Triggers on: manage database, withRef, c.get('db'), manageDbPool, branch checkout, doltgres, ref-scope, branchScopedDb, AgentsManageDatabaseClient."
---

# Manage Database Usage (Doltgres)

The manage database is a Doltgres instance (PostgreSQL with Git-like versioning). Every read or write **must** happen on the correct branch. Failing to scope connections to a branch will read/write the wrong data.

---

## Branch Naming

Each project has its own main branch: `<tenantId>_<projectId>_main`.

Custom branches follow: `<tenantId>_<projectId>_<branchName>`.

Connections default to the `main` branch (which is empty/root), so you **must always** check out the correct project branch before any operation.

---

## Decision Table

| Where is your code? | What to use |
|---|---|
| `/manage` route handler | `c.get('db')` — middleware handles checkout and commit |
| `/run` or `/evals` route handler | `withRef(manageDbPool, resolvedRef, (db) => ...)` |
| Service class or utility outside manage routes | `withRef(manageDbPool, resolvedRef, (db) => ...)` |
| Already inside a `withRef` callback | Use the `db` from the callback argument directly |

---

## Mechanism 1: Middleware (`/manage` routes)

The `branchScopedDbMiddleware` (in `agents-api/src/middleware/branchScopedDb.ts`) runs on all `/manage` routes. It:

1. Acquires a dedicated connection from the pool
2. Checks out the correct branch (from the request's resolved `ref`)
3. Creates a Drizzle client scoped to that connection
4. Injects it into context as `'db'`
5. Executes the route handler
6. Auto-commits on success for write operations
7. Cleans up: checks out `main` and releases connection

### Usage

```typescript
async (c) => {
  const db: AgentsManageDatabaseClient = c.get('db');
  const { tenantId, projectId } = c.req.valid('param');

  const tools = await listTools(db)({
    scopes: { tenantId, projectId },
  });

  return c.json({ data: tools });
}
```

### Rules

- **ALWAYS** use `c.get('db')` inside manage routes — never import and use the global `manageDbClient` directly (it isn't checked out to any branch)
- **Don't manually commit** — the middleware auto-commits successful writes and resets on failure
- The `resolvedRef` is also available via `c.get('resolvedRef')` if needed

---

## Mechanism 2: `withRef` (outside manage routes)

Use `withRef` from `@inkeep/agents-core` (defined in `packages/agents-core/src/dolt/ref-scope.ts`) when accessing manage data from `/run`, `/evals`, services, or other packages.

### Read

```typescript
import { withRef } from '@inkeep/agents-core';
import manageDbPool from '../data/db/manageDbPool';

const agent = await withRef(manageDbPool, resolvedRef, (db) =>
  getFullAgent(db)({
    scopes: { tenantId, projectId, agentId },
  })
);
```

### Write with auto-commit

```typescript
await withRef(
  manageDbPool,
  resolvedRef,
  async (db) => {
    await updateAgent(db, agentId, data);
  },
  { commit: true, commitMessage: 'Update agent config' }
);
```

### Batching operations

Batch multiple operations in a single `withRef` to use one connection and one checkout:

```typescript
const result = await withRef(
  manageDbPool,
  resolvedRef,
  async (db) => {
    await createCredential(db, credData);
    await updateTool(db, toolId, { credentialId });
    return { success: true };
  },
  {
    commit: true,
    commitMessage: 'Link credential to tool',
    author: { name: 'oauth-flow', email: 'oauth@inkeep.com' },
  }
);
```

### Rules

- `withRef` acquires, scopes, and releases the connection — don't manage connections yourself
- For reads, omit the options (no `commit` needed)
- For writes, pass `{ commit: true }` with an appropriate `commitMessage`
- On failure, if `commit: true`, uncommitted changes are automatically reset

---

## Obtaining a `resolvedRef`

Most code paths already have a `resolvedRef` available:

- **Hono routes**: `c.get('resolvedRef')` (set by ref middleware)
- **Agent runtime**: `this.executionContext.resolvedRef`
- **Service params**: passed as a function parameter

If you need to resolve a branch ref manually:

```typescript
import { getProjectScopedRef, resolveRef } from '@inkeep/agents-core';

const projectScopedRef = getProjectScopedRef(tenantId, projectId, 'main');
const resolvedRef = await resolveRef(agentsManageDbClient)(projectScopedRef);
```

The `ResolvedRef` type has three fields:

```typescript
type ResolvedRef = {
  type: 'branch' | 'tag' | 'commit';
  name: string;  // e.g. "acme_proj_123_main"
  hash: string;  // commit hash
};
```

---

## Key Files

| File | Purpose |
|---|---|
| `agents-api/src/middleware/branchScopedDb.ts` | Middleware for `/manage` routes |
| `packages/agents-core/src/dolt/ref-scope.ts` | `withRef` wrapper and nesting detection |
| `packages/agents-core/src/dolt/ref-middleware.ts` | Ref resolution middleware (resolves `ref` query param) |
| `packages/agents-core/src/dolt/ref-helpers.ts` | Helper functions (`getProjectScopedRef`, `resolveProjectMainRef`) |
| `packages/agents-core/src/validation/dolt-schemas.ts` | `ResolvedRef` type and Zod schemas |
| `agents-api/src/data/db/manageDbPool.ts` | Connection pool singleton |
| `agents-api/src/data/db/manageDbClient.ts` | Global Drizzle client (don't use directly in scoped contexts) |
