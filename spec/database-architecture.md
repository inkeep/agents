# Database Architecture

## Overview

The Inkeep Agent Framework uses a **dual-database architecture** to separate versioned configuration data from runtime transactional data. This separation enables Git-like version control for agent configurations while maintaining standard ACID properties for runtime operations.

| Database | Technology | Purpose | Port |
|----------|------------|---------|------|
| Manage DB | DoltGres | Versioned agent configurations | 5432 |
| Runtime DB | PostgreSQL | Transactional runtime data | 5433 |

## Key Concepts

### DoltGres (Manage Database)

DoltGres is a PostgreSQL-compatible database with Git-like version control. It stores all **configuration data**:

- Projects, Agents, Sub-agents
- Tools, Functions, External Agents
- Context Configs, Credentials
- Triggers (webhook definitions)
- Data/Artifact Components

**Branching model**: Each project gets its own branch following the pattern `{tenantId}_{projectId}_main`. This enables isolated configuration changes per project.

### PostgreSQL (Runtime Database)

Standard PostgreSQL stores **transactional runtime data**:

- Conversations, Messages, Tasks
- API Keys, Trigger Invocations
- Context Cache, Eval Runs
- User/Organization data (Better Auth)

Runtime tables have **no foreign keys** to manage tables since they're in different databases. Application code enforces cross-database referential integrity.

## Architecture

```mermaid
flowchart TB
    subgraph "Manage API (3002)"
        MA[Route Handlers]
        MA --> |queries| MDC[Manage DB Client]
    end
    
    subgraph "Run API (3003)"
        RA[Route Handlers]
        RA --> |queries| RDC[Runtime DB Client]
        RA --> |config lookups| MDC2[Manage DB Client]
    end
    
    MDC --> |pool| DG[(DoltGres :5432)]
    MDC2 --> |pool| DG
    RDC --> |pool| PG[(PostgreSQL :5433)]
    
    DG --> |branches| B1[main]
    DG --> B2[tenant_project_main]
    DG --> B3[...]
```

## Implementation Details

### Database Clients

Both clients use **connection pooling** (default: 100 connections). This is critical for understanding branching behavior.

**Manage Client** (`packages/agents-core/src/db/manage/manage-client.ts`):
```typescript
export function createAgentsManageDatabaseClient(config): AgentsManageDatabaseClient {
  const pool = new Pool({ connectionString, max: config.poolSize || 100 });
  return drizzle(pool, { schema });
}
```

**Runtime Client** (`packages/agents-core/src/db/runtime/runtime-client.ts`):
```typescript
export function createAgentsRunDatabaseClient(config): AgentsRunDatabaseClient {
  const pool = new Pool({ connectionString, max: config.poolSize || 100 });
  return drizzle(pool, { schema });
}
```

### DoltGres Branching

**Critical**: `DOLT_CHECKOUT` is **connection-scoped**. When using a connection pool, each query may use a different connection. A checkout on one connection doesn't affect others.

**Wrong approach** (queries get random connections):
```typescript
await doltCheckout(db)({ branch: 'tenant_project_main' });
const data = await db.query.agents.findMany(); // May use different connection!
```

**Correct approach** (use transaction for same connection):
```typescript
const result = await withBranch(db)({
  branchName: 'tenant_project_main',
  callback: async (txDb) => {
    return await db.query.agents.findMany(); // Same connection as checkout
  },
});
```

The `withBranch` utility (`packages/agents-core/src/dolt/branch.ts`) uses a transaction to pin all queries to a single connection:

```typescript
export const withBranch = (db) => async ({ branchName, callback }) => {
  return db.transaction(async (tx) => {
    const originalBranch = await tx.execute(sql`SELECT ACTIVE_BRANCH()`);
    await tx.execute(sql.raw(`SELECT DOLT_CHECKOUT('${branchName}')`));
    try {
      return await callback(tx);
    } finally {
      await tx.execute(sql.raw(`SELECT DOLT_CHECKOUT('${originalBranch}')`));
    }
  });
};
```

### Branch Naming Convention

```
{tenantId}_{projectId}_main
```

Example: `default_andrew1_main`

Helper function:
```typescript
export const getProjectBranchName = (tenantId: string, projectId: string): string => {
  return `${tenantId}_${projectId}_main`;
};
```

### Environment Variables

```bash
INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://user:pass@localhost:5432/inkeep_agents
INKEEP_AGENTS_RUN_DATABASE_URL=postgresql://user:pass@localhost:5433/inkeep_agents
```

## Common Operations

### Reading configuration from a project branch

```typescript
import { getFullProjectWithRelationIds, withBranch, getProjectBranchName } from '@inkeep/agents-core';

// Automatic branch handling (recommended)
const project = await getFullProjectWithRelationIds(manageDb)({
  scopes: { tenantId, projectId },
  // branchName is auto-derived from scopes
});

// Manual branch handling
const branch = getProjectBranchName(tenantId, projectId);
const result = await withBranch(manageDb)({
  branchName: branch,
  callback: async (txDb) => {
    return await someQuery(txDb)({ ... });
  },
});
```

### Committing configuration changes

```typescript
import { doltAdd, doltCommit } from '@inkeep/agents-core';

await doltAdd(db)({ tables: ['-A'] }); // Stage all changes
await doltCommit(db)({ message: 'Update agent configuration' });
```

## Gotchas & Edge Cases

1. **Connection pool branching**: Never assume a checkout persists across queries. Always use `withBranch` or transactions.

2. **Cross-database references**: Runtime tables reference config entities by ID only. No FK constraints exist—app code must handle orphaned references.

3. **Migration ordering**: Manage migrations must run before runtime migrations when there are schema dependencies.

4. **Test environment**: Tests use in-memory PGlite instead of real databases. The `ENVIRONMENT=test` flag triggers this.

5. **Branch existence**: Always verify a branch exists before checkout. Use `doltBranchExists()` for safety.

## Related Specs

- [Data Access Layer](./data-access-layer.md) - Patterns for querying these databases
