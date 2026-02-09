---
name: data-model-changes
description: "Guide for making changes to the database schema, validation, types, and data access layer. Use when adding tables, columns, relations, or modifying the data model. Triggers on: add table, add column, modify schema, database change, data model, new entity, schema migration."
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

### Step 7: Generate and Apply Migration

```bash
# Generate migration SQL
pnpm db:generate

# Review generated SQL in drizzle/manage/ or drizzle/runtime/
# Make minor edits if needed (ONLY to newly generated files)

# Apply migration
pnpm db:migrate
```

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

### Step 3: Generate and Apply Migration

```bash
pnpm db:generate
# Review the generated migration SQL
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
- [ ] Changeset created
- [ ] Tests written for new data access functions
