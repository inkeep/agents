# AGENTS.md - Quick Reference for AI Coding Agents

## Essential Commands
- **Build**: `pnpm build` (root) or `turbo build`
- **Lint**: `pnpm lint` (check) or `pnpm lint:fix` (auto-fix) or `pnpm check:fix` (Biome fix)
- **Format**: `pnpm format` (auto) or `pnpm format:check` (verify)
- **Typecheck**: `pnpm typecheck`
- **Test (all)**: `pnpm test` or `turbo test`
- **Test (single file)**: `cd <package> && pnpm test --run <file-path>` (use `--run` to avoid watch mode)
- **Test (package)**: `cd <package> && pnpm test --run`
- **Dev**: `pnpm dev` (root) or navigate to package and run `pnpm dev`

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

## Package Manager
- Always use `pnpm` (not npm, yarn, or bun)
