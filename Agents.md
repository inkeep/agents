# AGENTS.md - Comprehensive Guide for AI Coding Agents

This file provides guidance for AI coding agents (Claude Code, Cursor, Codex, Amp, etc.) when working with code in this repository.

## Essential Commands - Quick Reference

### Build & Development
- **Build**: `pnpm build` (root) or `turbo build`
- **Dev**: `pnpm dev` (root) or navigate to package and run `pnpm dev`
- **Lint**: `pnpm lint` (check) or `pnpm lint:fix` (auto-fix) or `pnpm check:fix` (Biome fix)
- **Format**: `pnpm format` (auto) or `pnpm format:check` (verify)
- **Typecheck**: `pnpm typecheck`

### Testing
- **Test (all)**: `pnpm test` or `turbo test`
- **Test (single file)**: `cd <package> && pnpm test --run <file-path>` (use `--run` to avoid watch mode)
- **Test (package)**: `cd <package> && pnpm test --run`

### Database Operations (run from monorepo root)
- **Generate migrations**: `pnpm db:generate` - Generate Drizzle migrations from schema.ts changes
- **Apply migrations**: `pnpm db:migrate` - Apply generated migrations to database
- **Drop migrations**: `pnpm db:drop` - Drop migration files (use this to remove migrations, don't manually delete)
- **Database studio**: `pnpm db:studio` - Open Drizzle Studio for database inspection
- **Check schema**: `pnpm db:check`

### Making a changelog entry
`pnpm changeset <major|minor|patch> "<changelog message>"`
Example:
```bash
pnpm changeset minor "Add new feature"
```
This will create a changeset file in the `.changeset` directory that is used by a GH Action to update packages versions.

Guidance for which semver level to use:
- Major: Do not use this level at all, it is reserved for a special future release.
- Minor: Use for schema changes that require a database migration or significant changes to the codebase or behavior.
- Patch: additive, new features & Bug fixes

### Running Examples
```bash
# From the examples directory
# Note: Use the globally installed inkeep CLI, not npx
inkeep push
```

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
- Each test worker gets in-memory SQLite database

## Package Manager
- Always use `pnpm` (not npm, yarn, or bun)

## Architecture Overview

This is the **Inkeep Agent Framework** - a multi-agent AI system with A2A (Agent-to-Agent) communication capabilities. The system provides OpenAI Chat Completions compatible API while supporting sophisticated agent orchestration.

### Core Components

#### Multi-Agent Framework

#### Database Schema (SQLite + Drizzle ORM)
[schema.ts](./packages/agents-core/src/db/schema.ts)

## Key Implementation Details

### Database Migration Workflow

#### Standard Workflow
1. Edit `packages/agents-core/src/db/schema.ts`
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
2. View error traces: `curl "http://localhost:16686/api/traces?service=inkeep-chat&tags=%7B%22error%22:%22true%22%7D"`
