# AGENTS.md - Inkeep Agent Framework

A multi-agent AI system with A2A (Agent-to-Agent) communication capabilities, providing OpenAI Chat Completions compatible API with sophisticated agent orchestration.

## Essential Commands

### Build & Development
```bash
pnpm build          # Build all packages
pnpm dev            # Start development
pnpm lint           # Check linting
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Format code
pnpm typecheck      # Type check
```

### Testing
```bash
pnpm test --run                           # All tests (use --run to avoid watch mode)
cd <package> && pnpm test --run <file>    # Single file
```

### Database
```bash
pnpm db:generate    # Generate migrations from schema.ts
pnpm db:migrate     # Apply migrations
pnpm db:drop        # Drop migrations (don't manually delete)
pnpm db:studio      # Open Drizzle Studio
```

### Changelog
```bash
pnpm changeset:quick <patch|minor> "<message>"
```
- **patch**: Additive features, bug fixes
- **minor**: Schema changes requiring migrations, significant behavior changes
- **major**: Reserved for special future release

## Code Style (Biome enforced)

- Single quotes, semicolons, 2-space indent, 100 char width
- Use `import type { }` for type imports
- camelCase (variables/functions), PascalCase (types/components), kebab-case (files)
- Use Zod for validation, avoid `any`
- No comments unless explicitly requested

## Package Manager

Always use `pnpm` (not npm, yarn, or bun).

## Architecture

### Core Packages
- `packages/agents-core/` - Database schema, data access layer
- `packages/agents-sdk/` - SDK for building agents
- `agents-run-api/` - Runtime API server
- `agents-manage-api/` - Management API
- `agents-manage-ui/` - Next.js admin UI
- `agents-docs/` - Public documentation (Fumadocs)

### Key Files
- Schema: `packages/agents-core/src/db/schema.ts`
- Data access: `packages/agents-core/src/data-access/`
- Examples: `agents-cookbook/template-projects/`

## Working with Agents

1. Use builder patterns (`agent()`, `subAgent()`, `tool()`) instead of direct DB manipulation
2. Always call `graph.init()` after creating agent relationships
3. Preserve `contextId` in transfer/delegation logic
4. Validate tool results with type guards
5. Test A2A communication end-to-end

## Feature Requirements

New features should include:
- **Tests**: In `__tests__/` directories, see [testing patterns](docs/agent-guides/testing-patterns.md)
- **UI**: Components in `agents-manage-ui/`, see [UI development](docs/agent-guides/ui-development.md)
- **Docs**: MDX in `agents-docs/`, see [documentation guide](docs/agent-guides/documentation.md)

## Development Workflow

1. Create branch: `git checkout -b feat/your-feature`
2. Verify: `pnpm test && pnpm typecheck && pnpm build && pnpm lint`
3. Commit with descriptive message
4. Create PR: `gh pr create --title "feat: description"`

## Detailed Guides

For task-specific information, see:
- [Testing Patterns](docs/agent-guides/testing-patterns.md)
- [UI Development](docs/agent-guides/ui-development.md)
- [Documentation](docs/agent-guides/documentation.md)
- [Database Migrations](docs/agent-guides/database-migrations.md)
- [Git Worktrees](docs/agent-guides/git-worktrees.md)
- [Debugging](docs/agent-guides/debugging.md)
