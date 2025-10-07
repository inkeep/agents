# Inkeep Agents Manage API

The Agents Manage API is responsible for entity management and CRUD operations for the Inkeep Agent Framework. It provides the administrative layer for creating, configuring, and managing agents, graphs, tools, and projects.

## Overview

This API handles the configuration and management layer:
- **Entity Management**: CRUD operations for all framework entities
- **Agent Configuration**: Agent creation, updates, and relationship management  
- **Graph Management**: Agent graph definitions and topology
- **Tool Management**: MCP tool registration and configuration
- **Project Management**: Multi-tenant project organization

## Architecture

### Core Entities

- **Projects**: Top-level organizational units with tenant scoping
- **Agents**: Individual AI agents with instructions and capabilities
- **Agent Graphs**: Collections of agents with defined relationships
- **Agent Relations**: Transfer and delegation relationships between agents
- **Tools**: MCP servers and hosted tool configurations
- **Tasks**: Work units with hierarchical parent-child relationships

## Development

### Setup

```bash
cd agents-run-api
pnpm install
```

If you do not have the database setup, run migrations from the monorepo root:

```bash
pnpm db:migrate
```

### Environment Variables
```env
ENVIRONMENT=development|production|test
PORT=3002
DB_FILE_NAME=path/to/sqlite.db
LOG_LEVEL=debug|info|warn|error
```

### Development Commands
```bash
pnpm dev              # Start development server
pnpm test             # Run test suite
pnpm test:coverage    # Run tests with coverage
pnpm build           # Build for production
pnpm lint            # Run linting
pnpm format          # Format code
```

### Database Operations
```bash
pnpm db:generate     # Generate migration files from schema changes
pnpm db:migrate      # Apply migration files to database
pnpm db:studio       # Open Drizzle Studio for inspection
```

## Builder Patterns

The API provides builder patterns for programmatic entity creation:

### Agent Builder
```typescript
import { agent } from '@inkeep/agents-manage-api';

const qaAgent = agent({
  id: 'qa-agent',
  name: 'QA Agent',
  instructions: 'Answer questions about our product',
  canTransferTo: () => [routerAgent],
  canDelegateTo: () => [searchAgent],
  tools: { search: searchTool }
});
```

### Graph Builder
```typescript
import { agentGraph } from '@inkeep/agents-manage-api';

const graph = agentGraph({
  id: 'customer-support',
  defaultSubAgent: routerAgent,
  agents: [routerAgent, qaAgent, orderAgent]
});

await graph.init(); // Persist to database
```

### Tool Builder
```typescript
import { tool } from '@inkeep/agents-manage-api';

const searchTool = tool({
  id: 'search-tool',
  name: 'Product Search',
  type: 'mcp',
  config: {
    command: 'search-server',
    args: ['--index', 'products']
  }
});
```

## Database Schema

The API uses SQLite with Drizzle ORM:

### Core Tables
- `projects` - Multi-tenant project organization
- `agents` - Agent definitions and instructions
- `agent_graphs` - Graph collections with default agents
- `agent_relations` - Transfer/delegation relationships
- `tools` - MCP tool configurations
- `tasks` - Execution history and hierarchy

### Key Patterns
- **Multi-tenancy**: All entities scoped by `tenant_id`
- **Relationships**: Foreign keys with cascade deletes
- **Timestamps**: `created_at`/`updated_at` on all entities
- **JSON Columns**: Complex configurations stored as JSON

## Validation

All API endpoints use Zod schemas for request/response validation:

```typescript
const createAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), 
  instructions: z.string().min(1),
  tenantId: z.string(),
  projectId: z.string()
});
```

## Integration

### With Agents Run API
The Agents Manage API provides the configuration that the Agents Run API reads during runtime. Changes to agents, graphs, or tools are immediately available to the execution layer.

### With Agents CLI
The Agents CLI uses the Agents Manage API for all `push` operations, creating and updating entities from configuration files.

### With Agents Manage UI
The Agents Manage UI provides a web interface for all Agents Manage API operations, offering visual agent and graph creation.

## Error Handling

- **Validation Errors**: Schema validation with detailed field errors
- **Constraint Errors**: Database constraint violations with helpful messages
- **Not Found Errors**: Resource-specific 404 responses
- **Conflict Errors**: Duplicate key and relationship conflicts

## Security

- **Multi-tenant Isolation**: All queries scoped by tenant ID
- **Input Validation**: Comprehensive request sanitization
- **SQL Injection Prevention**: Parameterized queries via Drizzle ORM
- **Authorization**: Configurable API key authentication

## Performance

- **Database Indexing**: Optimized indexes on frequently queried fields
- **Connection Pooling**: Efficient database connection management
- **Caching**: In-memory caching for frequently accessed entities
- **Parallel Operations**: Concurrent database operations where safe
