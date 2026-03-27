---
title: DAL Boundary Drizzle Import Violations
description: Complete inventory of drizzle-orm imports outside the data-access boundary, plus existing Biome enforcement patterns to follow.
created: 2026-03-15
last-updated: 2026-03-15
---

## Violations (files importing drizzle-orm outside permitted boundaries)

1. **`packages/agents-core/src/auth/auth.ts`** — `import { and, eq } from 'drizzle-orm'`
   - Uses inline Drizzle queries for org membership lookup and credential account check
   - Should be extracted to `data-access/runtime/auth.ts`

2. **`agents-api/src/middleware/branchScopedDb.ts`** — `import { drizzle } from 'drizzle-orm/node-postgres'`
   - Creates Drizzle client instances for branch-scoped database connections
   - This is infrastructure/middleware, not a DAL violation per se — needs allowlisting

## Permitted Boundaries (allowlist for lint rule)

| Directory | Reason |
|-----------|--------|
| `packages/agents-core/src/db/` | Schema definitions, migration clients |
| `packages/agents-core/src/dolt/` | Dolt version control integration |
| `packages/agents-core/src/validation/` | Drizzle-specific validation helpers |
| `packages/agents-core/src/data-access/` | The DAL itself |
| `packages/agents-core/src/auth/*-schema*` | Auth schema definitions (not auth.ts) |
| `agents-api/src/middleware/branchScopedDb.ts` | Infrastructure — creates DB clients |

## Existing Biome Pattern to Follow

`biome.jsonc:59-73` — `noRestrictedImports` for `createRoute`:
```json
"noRestrictedImports": {
  "level": "error",
  "options": {
    "paths": {
      "@hono/zod-openapi": {
        "importNames": ["createRoute"],
        "message": "Use createProtectedRoute from @inkeep/agents-core/middleware instead..."
      }
    }
  }
}
```

## Barrel Export Gap

`data-access/index.ts` does NOT export `scope-helpers.ts`. This needs to be added so external consumers can use scope helpers without reaching into internal paths.

## Confidence: CONFIRMED (from source code)
