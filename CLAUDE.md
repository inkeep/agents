# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Setup and installation
pnpm install         # Install all dependencies for monorepo

# Development workflow
pnpm dev              # Start development server (port 3002)
pnpm test             # Run test suite with Vitest
pnpm test:coverage    # Run tests with coverage report
pnpm build           # Build for production
pnpm lint            # Run Biome linter
pnpm format          # Format code with Biome

# Database operations (run from monorepo root)
pnpm db:generate     # Generate Drizzle migrations from schema.ts changes
pnpm db:migrate      # Apply generated migrations to database
pnpm db:drop         # Drop migration files (use this to remove migrations, don't manually delete)
pnpm db:studio       # Open Drizzle Studio for database inspection
pnpm db:clean        # Clean database
pnpm db:check        # Check database schema

## Database Migration Workflow

### Standard Workflow
1. Edit `packages/agents-core/src/db/schema.ts`
2. Run `pnpm db:generate` to create migration files in `drizzle/`
3. (Optional) Make minor edits to the newly generated SQL file if needed due to drizzle-kit limitations
4. Run `pnpm db:migrate` to apply the migration to the database

### Important Rules
- ⚠️ **NEVER manually edit files in `drizzle/meta/`** - these are managed by drizzle-kit
- ⚠️ **NEVER edit existing migration SQL files after they've been applied** - create new migrations instead
- ⚠️ **To remove migrations, use `pnpm db:drop`** - don't manually delete migration files
- ✅ **Only edit newly generated migrations** before first application (if drizzle-kit has limitations)

# Running examples (from the examples directory)
# Note: Use the globally installed inkeep CLI, not npx
inkeep push agent-configurations/graph.graph.ts
inkeep chat

# Documentation development (from agents-docs directory)
pnpm dev              # Start documentation site (port 3000)
pnpm build           # Build documentation for production
```


## Architecture Overview

This is the **Inkeep Agent Framework** - a multi-agent AI system with A2A (Agent-to-Agent) communication capabilities. The system provides OpenAI Chat Completions compatible API while supporting sophisticated agent orchestration.

### Core Components

#### Multi-Agent Framework
- **Hub and Spoke Pattern**: Router agents coordinate specialized agents
- **Graph-Based Networks**: Agents connected by transfer/delegation relationships
- **A2A Protocol**: JSON-RPC based communication following Google's A2A specification
- **Context Preservation**: Conversation state maintained across agent transitions

#### Database Schema (SQLite + Drizzle ORM)
- **Shared Database**: Single SQLite database (`./local.db`) at monorepo root shared by both APIs
- **agents**: Individual AI agents with instructions and capabilities
- **agent_graphs**: Collections of agents with default entry points  
- **agent_relations**: Transfer (`complete control transfer`) and delegation (`task assignment with return`) relationships
- **tasks**: Work units with hierarchical parent-child relationships via `task_relations`
- **conversations**: User sessions with active agent tracking
- **messages**: Unified format supporting both OpenAI Chat and A2A protocols
- **tools**: MCP servers and hosted tools with configuration

#### Key Patterns

**Agent Relationships:**
- **Transfer**: Complete control transfer (router → specialist agent)
- **Delegation**: Task assignment with return (agent → sub-agent → return)

**Task Communication:**
```typescript
// A2A JSON-RPC methods
POST /a2a/{subAgentId}
{
    method: 'tasks/send' | 'tasks/get' | 'tasks/cancel'
    params: { message, taskId, etc. }
}
```

**Builder Pattern for Configuration:**
```typescript
const agent = agent({
    id: 'qa-agent',
    name: 'QA Agent', 
    instructions: 'Answer questions...',
    canTransferTo: () => [routerAgent],
    canDelegateTo: () => [specialistAgent],
    tools: { search: searchTool }
});

export const graph = agentGraph({
    defaultSubAgent: routerAgent,
    agents: [routerAgent, qaAgent, orderAgent]
    // No tenantId or apiUrl needed - CLI injects from inkeep.config.ts
});
// No graph.init() call - CLI handles initialization when pushing
```

## Key Implementation Details

### Agent Communication Flow
1. **Context ID Preservation**: `contextId` must be maintained across all agent transitions for conversation continuity
2. **Task Hierarchy**: Parent-child task relationships track delegation chains via `task_relations` table
3. **Message Threading**: All messages stored in unified format supporting both chat and A2A protocols

### MCP Tool Integration
- **Multiple Transports**: stdio, SSE, streamable HTTP
- **Dynamic Discovery**: Tools discovered from MCP servers at runtime
- **Health Monitoring**: Automated health checks for external tools
- **JSON Schema → Zod**: Automatic schema transformation for type safety

### Database Operations
- **Multi-tenancy**: All entities scoped by `tenantId`
- **Parallel Database Operations**: Use `Promise.all()` for concurrent queries (see `generateTaskHandler.ts:49-60`)
- **Race Condition Prevention**: Check for existing tasks before creation (see `executionHandler.ts:71-96`)

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
DB_FILE_NAME=path/to/sqlite.db
PORT=3002
ANTHROPIC_API_KEY=required
OPENAI_API_KEY=optional
LOG_LEVEL=debug|info|warn|error
```

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
- Update `/agents-docs/navigation.ts` to include new pages in the navigation
- Follow existing Fumadocs structure and patterns
- Add code examples and diagrams where helpful
- Note: `/agents-docs/` is a Next.js documentation site for public consumption

**Before marking any feature complete, verify:**
- [ ] Tests written and passing (`pnpm test`)
- [ ] UI components implemented in agents-manage-ui
- [ ] Documentation added to `/agents-docs/`
- [ ] All linting passes (`pnpm lint`)

### 📋 Standard Development Workflow

**After completing a feature and ensuring all tests, typecheck, and build are passing:**

1. **Create a new branch** (if not already on one):
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Run verification commands** to ensure everything passes:
   ```bash
   pnpm test
   pnpm typecheck  # or pnpm tsc --noEmit
   pnpm build
   pnpm lint
   ```

3. **Commit your changes** with a descriptive message

4. **Open a GitHub Pull Request** once all checks pass:
   ```bash
   gh pr create --title "feat: Your feature description" --body "Description of changes"
   ```
   
   This is the standard development procedure to ensure code review and CI/CD processes.
   
   **Note**: The user may override this workflow if they prefer to work directly on main or have different branch strategies.

### When Working with Agents
1. **Always call `graph.init()`** after creating agent relationships to persist to database
2. **Use builder patterns** (`agent()`, `agentGraph()`, `tool()`) instead of direct database manipulation
3. **Preserve contextId** when implementing transfer/delegation logic - extract from task IDs if needed
4. **Validate tool results** with proper type guards instead of unsafe casting
5. **Test A2A communication end-to-end** when adding new agent relationships
6. **Follow the mandatory requirements above** for all new features

### Performance Considerations
- **Parallelize database operations** using `Promise.all()` instead of sequential `await` calls
- **Optimize array processing** with `flatMap()` and `filter()` instead of nested loops
- **Implement cleanup mechanisms** for debug files and logs to prevent memory leaks

### Common Gotchas
- **Empty Task Messages**: Ensure task messages contain actual text content
- **Context Extraction**: For delegation scenarios, extract contextId from task ID patterns like `task_math-demo-123456-chatcmpl-789`
- **Tool Health**: MCP tools require health checks before use
- **Agent Discovery**: Agents register capabilities via `/.well-known/{subAgentId}/agent.json` endpoints

### File Locations
- **Core Agents**: `/execution/src/agents/Agent.ts`, `/inkeep-chat/src/agents/generateTaskHandler.ts`
- **A2A Communication**: `/execution/src/a2a/`, `/inkeep-chat/src/handlers/executionHandler.ts`
- **Database Layer**: `/packages/agents-core/src/data-access/` (agents, tasks, conversations, tools)
- **Builder Patterns**: `/configuration/src/builder/` (agent.ts, graph.ts, tool.ts)
- **Schemas**: `/packages/agents-core/src/data/db/schema.ts` (Drizzle), `/agents-run-api/src/schemas/` (Zod validation)
- **Tests**: `/inkeep-chat/src/__tests__/` (unit and integration tests)
- **UI Components**: `/agents-manage-ui/src/components/` (React components)
- **UI Pages**: `/agents-manage-ui/src/app/` (Next.js pages and routing)
- **Documentation**: `/agents-docs/` (Next.js/Fumadocs public documentation site)
- **Legacy Documentation**: `/docs-legacy/` (internal/development notes)
- **Examples**: `/examples/` for reference implementations

## Feature Development Examples

### Example: Adding a New Feature

#### 1. Unit Test Example
```typescript
// agents-manage-api/src/builder/__tests__/newFeature.test.ts
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

// Also update agents-docs/navigation.ts to include the new page:
```typescript
export default {
  docs: [
    // ... existing entries
    {
      group: "Features",
      pages: [
        "features/new-feature",  // Add this line
        // ... other feature pages
      ],
    },
  ],
};
```

## Debugging Commands

### Jaeger Tracing Debugging
Use curl commands to query Jaeger API running on localhost:16686:

```bash
# Get all services
curl "http://localhost:16686/api/services"

# Get operations for a service
curl "http://localhost:16686/api/operations?service=inkeep-chat"

# Search traces for recent activity (last hour)
curl "http://localhost:16686/api/traces?service=inkeep-chat&limit=20&lookback=1h"

# Search traces by operation name
curl "http://localhost:16686/api/traces?service=inkeep-chat&operation=agent.generate&limit=10"

# Search traces by tags (useful for finding specific agent/conversation)
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22agent.id%22:%22qa-agent%22%7D&limit=10"

# Search traces by tags for conversation ID
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22conversation.id%22:%22conv-123%22%7D"

# Get specific trace by ID
curl "http://localhost:16686/api/traces/{trace-id}"

# Search for traces with errors
curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22error%22:%22true%22%7D&limit=10"

# Search for tool call traces
curl "http://localhost:16686/api/traces?service=inkeep-chat&operation=tool.call&limit=10"

# Search traces within time range (Unix timestamps)
curl "http://localhost:16686/api/traces?service=inkeep-chat&start=1640995200000000&end=1641081600000000"
```

### Common Debugging Workflows

**Debugging Agent Transfers:**
1. View traces: `curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22conversation.id%22:%22conv-123%22%7D"`

**Debugging Tool Calls:**
1. Find tool call traces: `curl "http://localhost:16686/api/traces?service=inkeep-chat&operation=tool.call&limit=10"`

**Debugging Task Delegation:**
1. Trace execution flow: `curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22task.id%22:%22task-id%22%7D"`

**Debugging Performance Issues:**
1. Find slow operations: `curl "http://localhost:16686/api/traces?service=inkeep-chat&minDuration=5s"`
3. View error traces: `curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22error%22:%22true%22%7D"`