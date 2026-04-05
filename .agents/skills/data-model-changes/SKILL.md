---
name: data-model-changes
description: "Guide for making changes to the database schema, validation, types, and data access layer. Includes Doltgres DDL compatibility constraints for schemas targeting Doltgres (manage database). Use when adding tables, columns, relations, or modifying the data model. Triggers on: add table, add column, modify schema, database change, data model, new entity, schema migration, manage-schema.ts, runtime-schema.ts, Doltgres, Doltgres compatibility, Doltgres migration, manage database, manage DB, drizzle migration, migration failure, migration error, pgEnum, enum type, DROP TABLE, CASCADE, ALTER TYPE, drizzle-kit generate, pnpm db:generate."
---

# Data Model Change Guide

Comprehensive guidance for making changes to the data model (database schema, validation, types, and data access layer) in the Inkeep Agent Framework.

---

## Database Architecture

The framework uses **two separate PostgreSQL databases**:

| Database | Config File | Schema File | Purpose |
|----------|-------------|-------------|---------|
| **Manage** (Doltgres) | `drizzle.manage.config.ts` | `src/db/manage/manage-schema.ts` | Versioned config: projects, agents, tools, triggers, evaluators |
| **Runtime** (Postgres) | `drizzle.run.config.ts` | `src/db/runtime/runtime-schema.ts` | Transactional data: conversations, messages, tasks, API keys |

**Key Distinction:**

- **Manage DB**: Configuration that changes infrequently (agent definitions, tool configs). Supports Dolt versioning.
- **Runtime DB**: High-frequency transactional data (conversations, messages). No cross-DB foreign keys to manage tables.

---

## Doltgres DDL Constraints

*Last confirmed on Doltgres v0.55.5 (pinned in `docker-compose.yml`; note that `docker-compose.dbs.yml` and `docker-compose.isolated.yml` use `:latest`) + drizzle-kit 0.31.8 (resolved from `^0.31.6` in `packages/agents-core/package.json`). Re-verify if either version changes.*

drizzle-kit generates standard PostgreSQL SQL that may be incompatible with Doltgres. These constraints apply to Doltgres-targeted schemas (in this codebase: `manage-schema.ts` and `drizzle/manage/`). Standard PostgreSQL schemas (`runtime-schema.ts`) are unconstrained.

| Don't use in Doltgres-targeted schemas | Why (Doltgres error) | Use instead |
|---|---|---|
| `pgEnum()` | `ALTER TYPE is not yet supported` — values can never be changed once created. All ALTER TYPE operations fail (ADD VALUE, DROP VALUE, RENAME, SET SCHEMA). | `varchar` + Zod validation (see example below) |
| `pgSchema()` | `ALTER TABLE SET SCHEMA is not yet supported` — objects can never be moved between schemas. `DROP SCHEMA CASCADE` also fails. | Stay in `public` schema. Use table name prefixes for grouping (e.g., `eval_`, `config_`). |
| `serial()` / `pgSequence()` | Column creation works, but the implicit sequence can never be tuned — `INCREMENT BY is not yet supported` (and RESTART, MINVALUE, MAXVALUE, CACHE, CYCLE). Only OWNED BY works. | Application-generated varchar IDs (nanoid) |
| ``index().where(sql`...`)`` | `WHERE is not yet supported` | Full btree index; filter at query time |
| `index().concurrently()` | `concurrent index creation is not yet supported` | Plain `CREATE INDEX` — config data has low write volume, the brief lock is fine |
| `index().using('gin'/'gist'/'hash')` | `index method X is not yet supported` — only btree indexes work | btree on scalar columns; filter JSONB in application code |
| ``index().on(sql`lower(...)`)`` | `expression index attribute is not yet supported` | Normalize the value at write time in the data access function; index the stored column directly |
| `col.desc()` on index | drizzle-kit silently couples `.desc()` with NULLS LAST in its output → `NULLS LAST for indexes is not yet supported`. The error mentions NULLS LAST even though you only wrote `.desc()`. | Omit `.desc()`; handle ordering in `ORDER BY` clauses |

### Instead of pgEnum: varchar + Zod validation

The manage schema already follows this pattern — for example:

```typescript
// In manage-schema.ts:
credentialScope: varchar('credential_scope', { length: 50 }).notNull().default('project'), // 'project' | 'user'

// Validated at the application layer via Zod:
const CredentialScopeEnum = z.enum(['project', 'user']);
```

Adding a new allowed value is a code change (update the Zod enum), not a migration — no DDL needed.

If you inherited an existing `pgEnum` column, escape it with a multi-step data migration: (1) add a varchar column, (2) backfill from the enum column via `::text` cast, (3) set NOT NULL on the new column, (4) set the default value, (5) drop the old enum column, (6) rename the new column, (7) drop the unused enum type. Each step works individually on Doltgres (E2E verified).

---

## Schema Patterns

### 1. Scope Patterns (Multi-tenancy)

All tables use hierarchical scoping. Use these reusable field patterns:

```typescript
// Tenant-level (org-wide resources)
const tenantScoped = {
  tenantId: varchar('tenant_id', { length: 256 }).notNull(),
  id: varchar('id', { length: 256 }).notNull(),
};

// Project-level (project-specific resources)
const projectScoped = {
  ...tenantScoped,
  projectId: varchar('project_id', { length: 256 }).notNull(),
};

// Agent-level (agent-specific resources)
const agentScoped = {
  ...projectScoped,
  agentId: varchar('agent_id', { length: 256 }).notNull(),
};

// Sub-agent level (sub-agent-specific resources)
const subAgentScoped = {
  ...agentScoped,
  subAgentId: varchar('sub_agent_id', { length: 256 }).notNull(),
};
```

**Example usage in real tables:**

```typescript
// Project-scoped: tools belong to a project
export const tools = pgTable(
  'tools',
  {
    ...projectScoped,  // tenantId, id, projectId
    name: varchar('name', { length: 256 }).notNull(),
    config: jsonb('config').$type<ToolConfig>().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
  ]
);

// Agent-scoped: triggers belong to an agent
export const triggers = pgTable(
  'triggers',
  {
    ...agentScoped,  // tenantId, id, projectId, agentId
    ...uiProperties,
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
  ]
);

// Sub-agent scoped: tool relations belong to a sub-agent
export const subAgentToolRelations = pgTable(
  'sub_agent_tool_relations',
  {
    ...subAgentScoped,  // tenantId, id, projectId, agentId, subAgentId
    toolId: varchar('tool_id', { length: 256 }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
  ]
);
```

### 2. Common Field Patterns

```typescript
// Standard UI properties
const uiProperties = {
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
};

// Standard timestamps
const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
};
```

**Example usage:**

```typescript
// Table with UI properties (user-facing entity)
export const projects = pgTable(
  'projects',
  {
    ...tenantScoped,
    ...uiProperties,  // name (required), description (optional)
    models: jsonb('models').$type<ProjectModels>(),
    ...timestamps,    // createdAt, updatedAt
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);

// Table without UI properties (internal/join table)
export const subAgentRelations = pgTable(
  'sub_agent_relations',
  {
    ...agentScoped,
    sourceSubAgentId: varchar('source_sub_agent_id', { length: 256 }).notNull(),
    targetSubAgentId: varchar('target_sub_agent_id', { length: 256 }),
    relationType: varchar('relation_type', { length: 256 }),
    ...timestamps,  // Still include timestamps for auditing
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.id] }),
  ]
);
```

### 3. JSONB Type Annotations

Always annotate JSONB columns with `.$type<T>()` for type safety:

```typescript
models: jsonb('models').$type<Models>(),
config: jsonb('config').$type<{ type: 'mcp'; mcp: ToolMcpConfig }>().notNull(),
metadata: jsonb('metadata').$type<ConversationMetadata>(),
```

---

## Adding a New Table

### Step 1: Define the Table in Schema

Location: `packages/agents-core/src/db/manage/manage-schema.ts` (config) or `runtime-schema.ts` (runtime)

```typescript
export const myNewTable = pgTable(
  'my_new_table',
  {
    ...projectScoped,  // Choose appropriate scope
    ...uiProperties,   // If it has name/description
    
    // Custom fields
    status: varchar('status', { length: 50 }).notNull().default('active'),
    config: jsonb('config').$type<MyConfigType>(),
    
    // Reference fields (optional)
    parentId: varchar('parent_id', { length: 256 }),
    
    ...timestamps,
  },
  (table) => [
    // Primary key - ALWAYS include all scope fields
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    
    // Foreign keys (only within same database!)
    foreignKey({
      columns: [table.tenantId, table.projectId],
      foreignColumns: [projects.tenantId, projects.id],
      name: 'my_new_table_project_fk',
    }).onDelete('cascade'),
    
    // Optional: indexes for frequent queries
    index('my_new_table_status_idx').on(table.status),
  ]
);
```

### Step 2: Add Relations (if needed)

```typescript
export const myNewTableRelations = relations(myNewTable, ({ one, many }) => ({
  project: one(projects, {
    fields: [myNewTable.tenantId, myNewTable.projectId],
    references: [projects.tenantId, projects.id],
  }),
  // Add more relations as needed
}));
```

### Step 3: Create Zod Validation Schemas

Location: `packages/agents-core/src/validation/schemas.ts`

```typescript
// Create base schemas from Drizzle table
export const MyNewTableSelectSchema = registerFieldSchemas(
  createSelectSchema(myNewTable)
).openapi('MyNewTable');

export const MyNewTableInsertSchema = registerFieldSchemas(
  createInsertSchema(myNewTable)
).openapi('MyNewTableInsert');

export const MyNewTableUpdateSchema = MyNewTableInsertSchema.partial()
  .omit({ tenantId: true, projectId: true, id: true, createdAt: true })
  .openapi('MyNewTableUpdate');

// API schemas (omit internal scope fields)
export const MyNewTableApiSelectSchema = createApiSchema(MyNewTableSelectSchema)
  .openapi('MyNewTableApiSelect');

export const MyNewTableApiInsertSchema = createApiInsertSchema(MyNewTableInsertSchema)
  .openapi('MyNewTableApiInsert');

export const MyNewTableApiUpdateSchema = createApiUpdateSchema(MyNewTableUpdateSchema)
  .openapi('MyNewTableApiUpdate');
```

### Step 4: Create Entity Types

Location: `packages/agents-core/src/types/entities.ts`

```typescript
export type MyNewTableSelect = z.infer<typeof MyNewTableSelectSchema>;
export type MyNewTableInsert = z.infer<typeof MyNewTableInsertSchema>;
export type MyNewTableUpdate = z.infer<typeof MyNewTableUpdateSchema>;
export type MyNewTableApiSelect = z.infer<typeof MyNewTableApiSelectSchema>;
export type MyNewTableApiInsert = z.infer<typeof MyNewTableApiInsertSchema>;
export type MyNewTableApiUpdate = z.infer<typeof MyNewTableApiUpdateSchema>;
```

### Step 5: Create Data Access Functions

Location: `packages/agents-core/src/data-access/manage/myNewTable.ts` (or `runtime/`)

```typescript
import { and, eq, desc, count } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { myNewTable } from '../../db/manage/manage-schema';
import type { MyNewTableInsert, MyNewTableSelect, MyNewTableUpdate } from '../../types/entities';
import type { ProjectScopeConfig, PaginationConfig } from '../../types/utility';

export const getMyNewTableById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    itemId: string;
  }): Promise<MyNewTableSelect | undefined> => {
    const { scopes, itemId } = params;
    return db.query.myNewTable.findFirst({
      where: and(
        eq(myNewTable.tenantId, scopes.tenantId),
        eq(myNewTable.projectId, scopes.projectId),
        eq(myNewTable.id, itemId)
      ),
    });
  };

export const listMyNewTable =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<MyNewTableSelect[]> => {
    return db.query.myNewTable.findMany({
      where: and(
        eq(myNewTable.tenantId, params.scopes.tenantId),
        eq(myNewTable.projectId, params.scopes.projectId)
      ),
    });
  };

export const createMyNewTable =
  (db: AgentsManageDatabaseClient) =>
  async (params: MyNewTableInsert): Promise<MyNewTableSelect> => {
    const result = await db.insert(myNewTable).values(params as any).returning();
    return result[0];
  };

export const updateMyNewTable =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    itemId: string;
    data: MyNewTableUpdate;
  }): Promise<MyNewTableSelect> => {
    const result = await db
      .update(myNewTable)
      .set({ ...params.data, updatedAt: new Date().toISOString() } as any)
      .where(
        and(
          eq(myNewTable.tenantId, params.scopes.tenantId),
          eq(myNewTable.projectId, params.scopes.projectId),
          eq(myNewTable.id, params.itemId)
        )
      )
      .returning();
    return result[0];
  };

export const deleteMyNewTable =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; itemId: string }): Promise<void> => {
    await db.delete(myNewTable).where(
      and(
        eq(myNewTable.tenantId, params.scopes.tenantId),
        eq(myNewTable.projectId, params.scopes.projectId),
        eq(myNewTable.id, params.itemId)
      )
    );
  };
```

### Step 6: Export from Data Access Index

Location: `packages/agents-core/src/data-access/index.ts`

```typescript
export * from './manage/myNewTable';
```

### Step 7: Generate, Review, and Apply Migration

```bash
pnpm db:generate
```

**For Doltgres-targeted migrations (`drizzle/manage/`) — review generated SQL before applying:**

| Pattern in generated SQL | Doltgres error | How to fix |
|---|---|---|
| `DROP TABLE ... CASCADE` | `CASCADE is not yet supported` | Remove `CASCADE`. Drop dependent objects (child tables, FKs) explicitly in FK-dependency order before the parent table. |
| `ALTER COLUMN ... SET DATA TYPE ... USING` | `ALTER TABLE with USING is not supported yet` | Replace with multi-step: (1) add new column with target type, (2) `UPDATE` to backfill with cast, (3) drop old column, (4) rename new column. |

drizzle-kit 0.31.x hardcodes `CASCADE` on every `DROP TABLE` — there is no configuration to disable it. You must edit the generated SQL manually (precedent: [PR #2929](https://github.com/inkeep/agents/pull/2929)).

Note: `DROP INDEX` is broken on Doltgres 0.55.5 (returns `table not found` regardless). If a migration drops a table and its indexes, remove the `DROP INDEX` statements — `DROP TABLE` implicitly removes associated indexes.

**Quick review** (run against newly generated manage migration):

```bash
NEW_MIGRATION=$(ls -t packages/agents-core/drizzle/manage/*.sql | head -1)

# Tier 1 — blockers (must fix before applying):
grep -n -i 'DROP.*CASCADE\|ALTER TYPE\|CONCURRENTLY\|USING gin\|USING gist\|USING hash\|USING brin\|SET SCHEMA\|ADD VALUE\|NULLS' "$NEW_MIGRATION"

# Tier 2 — needs review (may be fine, verify):
grep -n 'ON CONFLICT\|SET DATA TYPE' "$NEW_MIGRATION"
grep -n 'CREATE.*INDEX.*WHERE' "$NEW_MIGRATION"
```

Tier 1 matches must be fixed. Tier 2: `SET DATA TYPE` is safe for simple widening (e.g., `varchar(64)` → `varchar(256)`) but dangerous with USING; `ON CONFLICT DO NOTHING` works but `DO UPDATE` may not.

drizzle-kit v1 beta reportedly removes CASCADE hardcoding (PR #4439). This repo uses stable 0.31.8.

**For all migrations** (manage and runtime): review the generated SQL in `drizzle/manage/` or `drizzle/runtime/`. Make minor edits if needed (ONLY to newly generated files, NEVER to previously applied migrations).

```bash
pnpm db:migrate
```

### Step 8: Validate manage migrations across Dolt branches

If your change touches the **manage** schema, don't stop after the migration succeeds on `main`. You should verify that the schema change can be merged from the `main` schema branch into existing project branches containing real data.
Doltgres is still in beta and there may be discrepancies between valid postgres and doltgres behavior. These discrepancies may cause migrations to fail when merged into project branches.

Recommended validation flow:

```bash
# 1. Ensure your local Dolt DB already has representative test data
#    in main and in one or more non-main branches

# 2. Apply the migration on main
pnpm db:manage:migrate

# 3. Push the schema change from main to all non-main branches
pnpm --filter @inkeep/agents-core db:manage:sync-all-branches
```

What to look for:

- `SYNCED` means the schema updated cleanly on that branch
- `NOOP` means the branch was already up to date
- Any failure means the migration likely has a branch-merge problem that must be fixed before shipping

This catches:

- Dolt-specific merge failures around constraints, indexes, or table rewrites

---

## Adding a Column to Existing Table

### Step 1: Modify Schema

Add the new column to the table definition:

```typescript
// In manage-schema.ts or runtime-schema.ts
export const existingTable = pgTable(
  'existing_table',
  {
    // ... existing fields ...
    
    // New column
    newField: varchar('new_field', { length: 256 }),
    newJsonField: jsonb('new_json_field').$type<MyNewType>().default(null),
    
    ...timestamps,
  },
  // ... constraints ...
);
```

### Step 2: Update Zod Schema (if custom validation needed)

If the field needs custom validation beyond Drizzle defaults:

```typescript
// In schemas.ts, update field schemas if needed
registerFieldSchemas(existingSchema, {
  newField: (schema) => schema.min(1).max(100),
});
```

### Step 3: Generate, Review, and Apply Migration

```bash
pnpm db:generate
```

**For Doltgres-targeted migrations (`drizzle/manage/`):** Review the generated SQL for Doltgres-incompatible patterns before applying (see the review table and grep checklist in "Adding a New Table" → Step 7).

```bash
pnpm db:migrate
```

---

## Adding Relations Between Tables

### Join Tables for Many-to-Many

```typescript
export const entityAEntityBRelations = pgTable(
  'entity_a_entity_b_relations',
  {
    ...projectScoped,  // Appropriate scope
    entityAId: varchar('entity_a_id', { length: 256 }).notNull(),
    entityBId: varchar('entity_b_id', { length: 256 }).notNull(),
    // Optional: relation-specific fields
    config: jsonb('config').$type<RelationConfig>(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
    // Foreign keys to both tables
    foreignKey({
      columns: [table.tenantId, table.projectId, table.entityAId],
      foreignColumns: [entityA.tenantId, entityA.projectId, entityA.id],
      name: 'entity_a_entity_b_relations_a_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.entityBId],
      foreignColumns: [entityB.tenantId, entityB.projectId, entityB.id],
      name: 'entity_a_entity_b_relations_b_fk',
    }).onDelete('cascade'),
    // Optional: unique constraint
    unique('entity_a_entity_b_unique').on(table.entityAId, table.entityBId),
  ]
);
```

---

## Foreign Key Rules

1. **CASCADE on delete**: Parent deletion removes children automatically
2. **SET NULL on delete**: Use for optional references
3. **Within same database only**: No FKs between manage and runtime DBs
4. **Application-enforced**: Cross-DB references are enforced in code

---

## Migration Rules

⚠️ **Critical Rules:**

- **NEVER** manually edit files in `drizzle/meta/`
- **NEVER** edit existing migration SQL files after they've been applied
- **NEVER** manually delete migration files - use `pnpm db:drop`
- ✅ **OK** to edit newly generated migrations before first application

---

## Changeset Requirements

Schema changes require a changeset:

```bash
pnpm bump minor --pkg agents-core "Add myNewTable for storing X"
```

Use **minor** version for:

- New tables
- New required columns
- Breaking schema changes

Use **patch** version for:

- New optional columns with defaults
- New indexes
- Non-breaking additions

---

## Checklist for Data Model Changes

Before completing any data model change, verify:

- [ ] Schema defined in correct file (manage vs runtime)
- [ ] Appropriate scope pattern used (tenant/project/agent/subAgent)
- [ ] JSONB fields have type annotations
- [ ] Primary key includes all scope columns
- [ ] Foreign keys use correct cascade behavior
- [ ] Zod schemas created (Select, Insert, Update, Api variants)
- [ ] Entity types exported
- [ ] Data access functions created
- [ ] Migration generated and reviewed
- [ ] If manage schema changed: tested `pnpm --filter @inkeep/agents-core db:manage:sync-all-branches` against existing branch data
- [ ] Changeset created
- [ ] Tests written for new data access functions
- [ ] **Doltgres schemas only:** No `pgEnum()` used (use varchar + Zod instead)
- [ ] **Doltgres schemas only:** No `pgSchema()` used (everything in `public`)
- [ ] **Doltgres schemas only:** No `serial()` / `pgSequence()` used (use application-generated varchar IDs)
- [ ] **Doltgres schemas only:** Generated migration SQL reviewed for incompatible patterns (see Step 7 review checklist)
- [ ] **Doltgres schemas only:** Indexes use basic btree only (no `.concurrently()`, `.where()`, `.using('gin')`, `.desc()`, expressions)
