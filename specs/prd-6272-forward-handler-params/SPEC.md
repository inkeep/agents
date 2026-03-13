# SPEC: Route Handler Pattern Enforcement & Test Coverage

**Linear:** PRD-6272
**Status:** Draft
**Scope:** Prevention mechanism + test coverage + handler migration

## Problem Statement

The agent create/update handler bug (silently dropping `models`, `statusUpdates`, `prompt`, `stopWhen`) was caused by explicit field-picking instead of spreading the validated body. PR #2657 fixed the agent handler specifically.

However, the **same anti-pattern exists in 12+ other route handler files** across the codebase, and **test coverage gaps exist across multiple entities** — meaning similar bugs could exist or emerge without detection.

### Root Cause Analysis

The bug was an **original sin from day one** (2025-09-05). Two handlers were written simultaneously — `agentGraph.ts` (→ `agent.ts`) used explicit field-picking, while `agents.ts` (→ `subAgents.ts`) used the spread pattern. The agent handler was missing 5 fields from the start, and the gap widened as new columns were added without updating the handler.

This class of bug requires three layers of prevention:
1. **Pattern enforcement** — make the anti-pattern detectable at CI time
2. **Convention documentation** — make the correct pattern discoverable for new code
3. **Test coverage** — catch any existing or future field-dropping through round-trip persistence tests

## Deliverables

### 1. CI Check Script: `check-route-handler-patterns`

A grep-based CI script (following the existing `check-env-descriptions.mjs` pattern) that scans all route handler files and flags explicit field-picking from validated bodies.

**Detection heuristic:**
- Find handlers that call `c.req.valid('json')` and assign to a variable
- Flag handlers where that variable is accessed via `$var.field` in a DAL call without a corresponding `...$var` spread

**Scope:** All route handlers across manage/, run/, and evals/ domains.

**Integration:** Wire into `pnpm check` pipeline alongside existing checks.

**Allowlist mechanism:** Some handlers legitimately transform fields before passing (e.g., `body.id || generateId()`). The script should allow this when accompanied by a spread of the remaining fields, or via an explicit `// allow-field-picking` comment.

### 2. Migrate Remaining Handler Files to Spread Pattern

Convert all route handlers currently using explicit field-picking to the spread pattern:

| File | Handlers to fix |
|---|---|
| `apiKeys.ts` | POST, PUT |
| `apps.ts` | POST only (PUT already uses spread) |
| `tools.ts` | POST, PUT |
| `triggers.ts` | POST, PUT (~18 instances) |
| `scheduledTriggers.ts` | POST, PUT (~20 instances) |
| `artifactComponents.ts` | POST, PUT |
| `externalAgents.ts` | POST, PUT |
| `subAgentRelations.ts` | POST, PUT |
| `subAgentExternalAgentRelations.ts` | POST |
| `subAgentTeamAgentRelations.ts` | POST |
| `userProfile.ts` | POST |
| `projects.ts` | Mixed — fix explicit-picking handlers |

**Important:** Each migration must be verified — some handlers may transform fields intentionally (e.g., `body.id || generateId()`, null coercion). Transformations should be preserved as overrides after the spread: `{ ...body, id: body.id || generateId() }`.

### 3. Dedicated Skill: Route Handler Authoring

A new skill (`.claude/skills/route-handler-authoring/SKILL.md` or similar) documenting:

**Pattern requirements:**
- Always spread the validated body (`...body`) when forwarding to DAL functions
- Never use explicit field-picking (`name: body.name, description: body.description, ...`)
- Preserve transformations as overrides after the spread
- Use the existing `createProtectedRoute` pattern for authorization

**CRUD test requirements for new handlers:**
- Every entity must have round-trip persistence tests for ALL schema fields
- Create with all fields → read → verify all fields match
- Update each field → read → verify updated
- Test null/undefined handling for optional fields
- Test field clearing (set to null) for nullable fields
- Test default values are applied and returned
- Follow existing exemplary patterns (see contextConfigs.test.ts, credentialReferences.test.ts)

### 4. Expand Test Coverage for All Entities

Add round-trip field persistence tests for entities with coverage gaps:

| Entity | Missing field tests |
|---|---|
| **Agent** | `models`, `statusUpdates`, `prompt`, `stopWhen` |
| **SubAgent** | `models`, `stopWhen`, `conversationHistoryConfig` |
| **Tool** | `imageUrl`, `credentialScope`, `capabilities`, `isWorkApp` |
| **Trigger** | `signingSecretCredentialReferenceId` |
| **DataComponent/ArtifactComponent** | `render` field |

Each gap requires:
- Create with the field → read → verify persisted
- Update the field → read → verify updated
- Round-trip test with all fields simultaneously

## Acceptance Criteria

1. **CI check runs in `pnpm check`** and catches explicit field-picking in route handlers
2. **All 12+ handler files migrated** to spread pattern
3. **Existing tests pass** — no regressions from handler migrations
4. **Test coverage expanded** — all entities have round-trip persistence tests for all schema fields
5. **Skill document created** — route handler authoring conventions documented
6. **`pnpm check` passes** — typecheck, lint, test, format, new CI check all green

## Non-Goals

- Fixing the agent handler (done in PR #2657)
- Biome GritQL plugins or TypeScript-level type constraints (investigated, not practical)
- Changing DAL function signatures or Zod validation schemas
- Adding new database columns or API fields
