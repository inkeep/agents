# @inkeep/agents-core

Core database schema, types, validation, and data access layer for the Inkeep Agent Framework.

## Overview

This package serves as the single source of truth for:
- **Database Schema**: Drizzle ORM schema definitions
- **Type System**: TypeScript types inferred from schemas
- **Validation**: Zod schemas for runtime validation
- **Data Access**: Functional data access layer with dependency injection
- **Migrations**: Database migration management

## Installation

```bash
pnpm add @inkeep/agents-core
```

## Architecture

### Schema as Source of Truth

The Drizzle schema (`src/db/index.ts`) is the authoritative source for all database structure. From this schema:
1. Database tables are generated
2. Zod validation schemas are derived
3. TypeScript types are inferred
4. SQL migrations are created

### Functional Data Access Pattern

All data access functions follow a consistent functional pattern with dependency injection:

```typescript
export const getAgentById = (db: DatabaseClient) => async (params: {
  tenantId: string;
  projectId: string;
  subAgentId: string;
}) => {
  // Implementation
};
```

This pattern enables:
- Easy testing with mock databases
- Flexible database configuration
- Clean separation of concerns
- Composable data operations

## Usage

### Database Client

```typescript
import { createDatabaseClient } from '@inkeep/agents-core/data-access';

// Production database
const db = createDatabaseClient({
  url: 'file:./production.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// In-memory database for testing
const testDb = createInMemoryDatabaseClient();
```

### Data Access

```typescript
import { getAgentById, createAgent, updateAgent } from '@inkeep/agents-core/data-access';

// Create function with database dependency
const getAgent = getAgentById(db);

// Use the function
const agent = await getAgent({
  tenantId: 'tenant-1',
  projectId: 'project-1',
  subAgentId: 'agent-1'
});
```

### Validation

```typescript
import { AgentInsertSchema, AgentUpdateSchema } from '@inkeep/agents-core/validation';

// Validate input data
const validatedData = AgentInsertSchema.parse({
  id: 'agent-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  name: 'Support Agent',
  description: 'Handles customer support',
  instructions: 'Be helpful and professional'
});

// Partial validation for updates
const updateData = AgentUpdateSchema.parse({
  name: 'Updated Agent Name'
});
```

### Types

```typescript
import type { 
  AgentInsert, 
  AgentSelect,
  TaskInsert,
  ConversationSelect 
} from '@inkeep/agents-core/validation';

// Use types in your application
function processAgent(agent: AgentSelect) {
  console.log(agent.name);
}
```

## Database Migrations

### Generate Migrations

After modifying the schema in `src/db/index.ts`:

```bash
# Generate SQL migration files
pnpm db:generate

# Preview changes
pnpm db:check
```

### Apply Migrations

```bash
# Run migrations
pnpm db:migrate
```

### Database Studio

```bash
# Open Drizzle Studio for database inspection
pnpm db:studio
```

## Testing

The package includes comprehensive tests for all components:

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

Tests use in-memory SQLite databases for isolation and speed.


## Multi-Service Architecture

This package is designed to support a multi-service architecture:

### Agents Manage API
Handles CRUD operations and entity management:
- Creating/updating agents
- Managing agent relationships
- Configuring tools
- Database migrations

### Agents Run API
Handles runtime operations:
- Processing conversations
- Executing tasks
- Agent communication
- Tool invocation

Both services share the same database schema and data access layer from this core package.

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Development mode (watch)
pnpm dev

# Linting and formatting
pnpm lint
pnpm format

# Type checking
pnpm typecheck
```

## Contributing

### Adding a New Entity to the Database Schema

When adding a new entity to the Inkeep Agent Framework, follow these steps to ensure proper integration across the schema, validation, and data access layers:

#### Step 1: Define the Drizzle Schema

Add your table definition to `src/db/index.ts`:

```typescript
// Example: Adding a "workflows" table
export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').notNull().primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    config: text('config', { mode: 'json' }),
    status: text('status').notNull().default('draft'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    tenantProjectIdx: index('workflows_tenant_project_idx')
      .on(table.tenantId, table.projectId),
  })
);
```

#### Step 2: Add Relationships (if applicable)

Define any relationships with existing tables:

```typescript
export const workflowRelations = relations(workflows, ({ one, many }) => ({
  // Example: A workflow belongs to an agent graph
  agentGraph: one(agentGraphs, {
    fields: [workflows.agentGraphId],
    references: [agentGraphs.id],
  }),
  // Example: A workflow can have many tasks
  tasks: many(tasks),
}));
```

#### Step 3: Create Validation Schemas

Add validation schemas to `src/validation/schemas.ts`:

```typescript
// Select schema (for reading from database)
export const WorkflowSelectSchema = createSelectSchema(workflows);

// Insert schema (for creating new records)
export const WorkflowInsertSchema = createInsertSchema(workflows).extend({
  id: resourceIdSchema,
  config: z.object({
    // Define your config structure
    triggers: z.array(z.string()).optional(),
    actions: z.array(z.string()).optional(),
  }).optional(),
});

// Update schema (for partial updates)
export const WorkflowUpdateSchema = WorkflowInsertSchema.partial().omit({
  id: true,
  tenantId: true,
  projectId: true,
});

// API schemas (without tenant/project IDs for external APIs)
export const WorkflowApiSelectSchema = createApiSchema(WorkflowSelectSchema);
export const WorkflowApiInsertSchema = createApiInsertSchema(WorkflowInsertSchema);
export const WorkflowApiUpdateSchema = createApiUpdateSchema(WorkflowUpdateSchema);
```

### Step 3.5: Add Types

Add types to `src/types/entities`

```typescript
export type WorkflowSelect = z.infer<typeof WorkflowSelectSchema>;
export type WorkflowInsert = z.infer<typeof WorkflowInsertSchema>;
export type WorkflowUpdate = z.infer<typeof WorkflowUpdateSchema>;
export type WorkflowApiSelect = z.infer<typeof WorkflowApiSelectSchema>;
export type WorkflowApiInsert = z.infer<typeof WorkflowApiInsertSchema>;
export type WorkflowApiUpdate = z.infer<typeof WorkflowApiUpdateSchema>;
```

add any types not directly inferred from the drizzle schema to `src/types/utility.ts`

#### Step 4: Create Data Access Functions

Create a new file `src/data-access/workflows.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import { workflows } from '../db/index';
import type { DatabaseClient } from './client';

// Get workflow by ID
export const getWorkflowById = (db: DatabaseClient) => async (params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
}) => {
  return db.query.workflows.findFirst({
    where: and(
      eq(workflows.tenantId, params.tenantId),
      eq(workflows.projectId, params.projectId),
      eq(workflows.id, params.workflowId)
    ),
  });
};

// List workflows
export const listWorkflows = (db: DatabaseClient) => async (params: {
  tenantId: string;
  projectId: string;
}) => {
  return db.query.workflows.findMany({
    where: and(
      eq(workflows.tenantId, params.tenantId),
      eq(workflows.projectId, params.projectId)
    ),
    orderBy: (workflows, { desc }) => [desc(workflows.createdAt)],
  });
};

// Create workflow
export const createWorkflow = (db: DatabaseClient) => async (params: {
  tenantId: string;
  projectId: string;
  data: any;
}) => {
  const [result] = await db.insert(workflows).values({
    ...params.data,
    tenantId: params.tenantId,
    projectId: params.projectId,
  }).returning();
  return result;
};

// Update workflow
export const updateWorkflow = (db: DatabaseClient) => async (params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
  data: any;
}) => {
  const [result] = await db
    .update(workflows)
    .set({
      ...params.data,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(workflows.tenantId, params.tenantId),
        eq(workflows.projectId, params.projectId),
        eq(workflows.id, params.workflowId)
      )
    )
    .returning();
  return result;
};

// Delete workflow
export const deleteWorkflow = (db: DatabaseClient) => async (params: {
  tenantId: string;
  projectId: string;
  workflowId: string;
}) => {
  await db.delete(workflows).where(
    and(
      eq(workflows.tenantId, params.tenantId),
      eq(workflows.projectId, params.projectId),
      eq(workflows.id, params.workflowId)
    )
  );
  return true;
};
```

#### Step 5: Export from Index Files

Update the relevant index files to export your new schemas and functions:

In `src/data-access/index.ts`:
```typescript
export * from './workflows';
```

#### Step 6: Generate and Apply Migrations

```bash
# Generate SQL migration for your new table
pnpm db:generate

# Apply migration to database
pnpm db:migrate
```

#### Step 7: Write Tests

Create test files for your new entity:

1. **Unit tests** in `src/__tests__/validation/workflows.test.ts`:
   - Test schema validation
   - Test edge cases and constraints

2. **Integration tests** in `src/__tests__/integration/workflows.test.ts`:
   - Test CRUD operations with real database
   - Test relationships with other entities
   - Test tenant isolation

Example integration test:
```typescript
describe('Workflow Integration Tests', () => {
  let db: DatabaseClient;
  
  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  it('should create and retrieve a workflow', async () => {
    const workflowData = {
      id: 'test-workflow',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      name: 'Test Workflow',
      description: 'A test workflow',
      status: 'draft',
    };

    const created = await createWorkflow(db)({
      tenantId: workflowData.tenantId,
      projectId: workflowData.projectId,
      data: workflowData,
    });

    expect(created.name).toBe(workflowData.name);
  });
});
```

