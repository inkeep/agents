# Data Access Layer

## Overview

The Data Access Layer (DAL) provides a consistent interface for database operations across both the Manage (DoltGres) and Runtime (PostgreSQL) databases. All database queries flow through DAL functions rather than direct Drizzle calls in route handlers.

Key responsibilities:
- Encapsulate all database queries
- Enforce tenant/project/agent scoping
- Handle branch-scoped queries for versioned data
- Provide type-safe function signatures

## Architecture

```
packages/agents-core/src/data-access/
├── index.ts                 # Re-exports all DAL functions
├── validation.ts            # Shared validation utilities
├── manage/                  # DoltGres (versioned config)
│   ├── agents.ts
│   ├── agentFull.ts
│   ├── projects.ts
│   ├── projectFull.ts
│   ├── subAgents.ts
│   ├── tools.ts
│   ├── triggers.ts
│   └── ...
└── runtime/                 # PostgreSQL (transactional)
    ├── apiKeys.ts
    ├── conversations.ts
    ├── messages.ts
    ├── triggerInvocations.ts
    └── ...
```

## Key Concepts

### Scoping Pattern

All DAL functions use hierarchical scoping configs to enforce multi-tenancy:

```typescript
type TenantScopeConfig = { tenantId: string };
type ProjectScopeConfig = TenantScopeConfig & { projectId: string };
type AgentScopeConfig = ProjectScopeConfig & { agentId: string };
type SubAgentScopeConfig = AgentScopeConfig & { subAgentId: string };
```

Every query includes scope parameters to prevent cross-tenant data access:

```typescript
const agent = await getAgentById(db)({
  scopes: { tenantId: 'default', projectId: 'proj1', agentId: 'agent1' },
});
```

### Function Signature Pattern

DAL functions follow a **curried pattern** where the database client is passed first:

```typescript
export const getAgentById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig }): Promise<AgentSelect | null> => {
    // Implementation
  };
```

This enables dependency injection and testing:

```typescript
// Production
const agent = await getAgentById(manageDbClient)({ scopes });

// Testing
const agent = await getAgentById(mockDbClient)({ scopes });
```

### Manage vs Runtime Functions

| Aspect | Manage (`manage/`) | Runtime (`runtime/`) |
|--------|-------------------|---------------------|
| Database | DoltGres | PostgreSQL |
| Client type | `AgentsManageDatabaseClient` | `AgentsRunDatabaseClient` |
| Branching | May require `withBranch` | No branching |
| Data | Configuration | Transactional |

## Implementation Details

### Basic CRUD Functions

Each entity typically has these functions (`packages/agents-core/src/data-access/manage/triggers.ts`):

```typescript
// Read single
export const getTriggerById = (db) => async (params: {
  scopes: AgentScopeConfig;
  triggerId: string;
}) => { ... };

// List with pagination
export const listTriggersPaginated = (db) => async (params: {
  scopes: AgentScopeConfig;
  pagination?: PaginationConfig;
}) => { ... };

// Create
export const createTrigger = (db) => async (params: {
  data: TriggerInsert;
}) => { ... };

// Update
export const updateTrigger = (db) => async (params: {
  scopes: AgentScopeConfig;
  triggerId: string;
  data: TriggerUpdate;
}) => { ... };

// Delete
export const deleteTrigger = (db) => async (params: {
  scopes: AgentScopeConfig;
  triggerId: string;
}) => { ... };
```

### Full Entity Functions

For complex entities with relations, "Full" variants load nested data (`packages/agents-core/src/data-access/manage/projectFull.ts`):

```typescript
export const getFullProjectWithRelationIds = (db, logger) => async (params: {
  scopes: ProjectScopeConfig;
  branchName?: string;  // Optional - defaults to project's main branch
}): Promise<FullProjectSelectWithRelationIds | null> => {
  const targetBranch = branchName ?? getProjectBranchName(scopes.tenantId, scopes.projectId);
  
  return withBranch(db)({
    branchName: targetBranch,
    callback: async (txDb) => {
      // Load project + all agents + all sub-agents + tools + etc.
    },
  });
};
```

### Branch-Scoped Queries

Functions that read versioned config should handle branching internally:

```typescript
// Good: Branch handling in DAL
export const getFullProject = (db) => async (params) => {
  return withBranch(db)({
    branchName: getProjectBranchName(params.scopes.tenantId, params.scopes.projectId),
    callback: async (txDb) => {
      return getFullProjectInternal(txDb)(params);
    },
  });
};

// Bad: Branch handling in route handler
app.get('/project/:id', async (c) => {
  await doltCheckout(db)({ branch: '...' });  // Don't do this!
  const project = await getProject(db)({ ... });
});
```

### Pagination Pattern

Paginated functions return both data and metadata:

```typescript
export const listTriggersPaginated = (db) => async (params: {
  scopes: AgentScopeConfig;
  pagination?: PaginationConfig;
}): Promise<{ data: TriggerSelect[]; pagination: PaginationResult }> => {
  const page = params.pagination?.page ?? 1;
  const limit = params.pagination?.limit ?? 10;
  
  const [data, countResult] = await Promise.all([
    db.query.triggers.findMany({
      where: and(...scopeConditions),
      limit,
      offset: (page - 1) * limit,
      orderBy: [desc(triggers.createdAt)],
    }),
    db.select({ count: count() }).from(triggers).where(and(...scopeConditions)),
  ]);
  
  return {
    data,
    pagination: { page, limit, total: countResult[0].count, pages: Math.ceil(total / limit) },
  };
};
```

## Common Operations

### Adding a new entity

1. Define schema in `manage-schema.ts` or `runtime-schema.ts`
2. Create DAL file in appropriate directory (`manage/` or `runtime/`)
3. Implement CRUD functions following the curried pattern
4. Export from `data-access/index.ts`
5. Generate and apply migrations

### Using DAL in route handlers

```typescript
// agents-manage-api/src/routes/triggers.ts
import { getTriggerById, createTrigger } from '@inkeep/agents-core';

app.get('/:triggerId', async (c) => {
  const db = c.get('db');  // Manage client from middleware
  const trigger = await getTriggerById(db)({
    scopes: { tenantId, projectId, agentId },
    triggerId: c.req.param('triggerId'),
  });
  return c.json({ data: trigger });
});
```

### Cross-database operations

When an operation needs both databases:

```typescript
// agents-run-api/src/routes/webhooks.ts
const manageDbClient = createAgentsManageDatabaseClient({ ... });
const runtimeDbClient = createAgentsRunDatabaseClient({ ... });

// Read config from manage DB (with branch scoping)
const trigger = await getTriggerById(manageDbClient)({
  scopes,
  triggerId,
  branchName: getProjectBranchName(tenantId, projectId),
});

// Write runtime data to runtime DB
await createTriggerInvocation(runtimeDbClient)({
  data: { triggerId, status: 'pending', ... },
});
```

## Gotchas & Edge Cases

1. **Always use scopes**: Never query without tenant/project scoping. This prevents data leakage.

2. **Branch for reads, not writes**: The `withBranch` utility is for reads. Writes require explicit checkout + commit flow.

3. **Transaction boundaries**: `withBranch` creates a transaction. Don't nest transactions or the inner one becomes a savepoint.

4. **Type imports**: Use `import type { ... }` for entity types to avoid circular dependencies.

5. **ID generation**: Use `generateId()` from `@inkeep/agents-core` for consistent ID formats.

## Related Specs

- [Database Architecture](./database-architecture.md) - Dual-database setup and connection management
