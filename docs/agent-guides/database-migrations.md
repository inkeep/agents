# Database Migrations

This guide covers database migration practices for the Inkeep Agent Framework.

## Stack

- **SQLite** database
- **Drizzle ORM** for schema management
- Schema file: `packages/agents-core/src/db/schema.ts`
- Migrations: `packages/agents-core/drizzle/`

## Commands (run from monorepo root)

```bash
pnpm db:generate  # Generate migrations from schema.ts changes
pnpm db:migrate   # Apply migrations to database
pnpm db:drop      # Drop migration files (don't manually delete)
pnpm db:studio    # Open Drizzle Studio for inspection
pnpm db:check     # Check schema
```

## Standard Workflow

1. Edit `packages/agents-core/src/db/schema.ts`
2. Run `pnpm db:generate` to create migration files
3. (Optional) Make minor edits to the newly generated SQL file if needed
4. Run `pnpm db:migrate` to apply the migration

## Critical Rules

- **NEVER manually edit files in `drizzle/meta/`** - managed by drizzle-kit
- **NEVER edit existing migration SQL files after applied** - create new migrations
- **To remove migrations, use `pnpm db:drop`** - don't manually delete
- **Only edit newly generated migrations** before first application

