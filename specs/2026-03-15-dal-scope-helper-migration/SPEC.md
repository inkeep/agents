# Complete DAL Scope Helper Migration and Error Handling Infrastructure — Spec

**Status:** Approved
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-03-15
**Links:**
- Tracking: [PRD-6291](https://linear.app/inkeep/issue/PRD-6291)
- Evidence: [./evidence/](./evidence/)
- Prior PRs: [#2150](https://github.com/inkeep/agents/pull/2150) (merged), [#2151](https://github.com/inkeep/agents/pull/2151) (merged), [#2159](https://github.com/inkeep/agents/pull/2159) (merged), [#2196](https://github.com/inkeep/agents/pull/2196) (stale), [#2198](https://github.com/inkeep/agents/pull/2198) (stale)

---

## 1) Problem Statement

- **Who is affected:** Platform engineers maintaining the DAL; security posture of multi-tenant deployment
- **What pain / job-to-be-done:** ~370 manual `eq(*.tenantId, ...)` calls across 35 DAL files create (a) security risk from missed scoping, (b) maintenance burden from repetitive boilerplate, (c) inconsistency in error handling patterns. Three runtime functions have NO tenant scoping at all — a cross-tenant data access vulnerability.
- **Why now:** Scope helper infrastructure was built and proven in PRs #2150–#2159 but never propagated. Two follow-up PRs (#2196, #2198) went stale. The security gaps in tasks.ts, contextCache.ts, and apiKeys.ts are live in production.
- **Current workaround(s):** Manual `and(eq(table.tenantId, ...), eq(table.projectId, ...))` in every query. Callers of unscoped functions happen to pass scoped IDs (not enforced). Inline retry logic in ledgerArtifacts.ts with a crash bug.

## 2) Goals

- **G1:** Eliminate cross-tenant data access risk in unscoped runtime DAL functions
- **G2:** Replace all manual `eq()` scope filtering with type-safe scope helpers across all ~35 DAL files
- **G3:** Enforce DAL architectural boundary via lint rule — prevent future Drizzle query leakage
- **G4:** Provide shared, tested PG error classification and retry infrastructure

## 3) Non-Goals

- **NG1:** Changing the scope hierarchy itself (tenant → project → agent → subAgent → tool levels are fixed)
- **NG2:** Adding new scope levels or changing the SCOPE_KEYS definitions
- **NG3:** Migrating auth-domain tables (users, organizations, userProfiles) — these are intentionally unscoped by design
- **NG4:** Wrapping all DAL functions in retry logic — only providing the utility; adoption is per-function decision
- **NG5:** Performance optimization of queries during migration — 1:1 behavioral equivalence is the goal

## 4) Personas / Consumers

- **P1: Platform engineer** — writes and reviews DAL code. Benefits from reduced boilerplate, enforced patterns, and caught errors at lint time.
- **P2: Security reviewer** — audits tenant isolation. Benefits from grep-able scope helper usage instead of hunting for missing `eq()` calls.
- **P3: On-call engineer** — investigates production errors. Benefits from shared error classification with consistent logging and retry behavior.

## 5) User Journeys

Not applicable — this is internal infrastructure. No user-facing surface changes.

## 6) Requirements

### Functional Requirements

| Priority | ID | Requirement | Acceptance Criteria | Sub-Issue |
|---|---|---|---|---|
| Must | FR1 | Fix unscoped runtime DAL functions | `getTask`, `updateTask`, `listTaskIdsByContextId`, `getCacheEntry` require and enforce ProjectScopeConfig. All callers updated. Scoping isolation tests pass. | PRD-6292 |
| Must | FR2 | apiKey auth lookup functions documented as intentionally unscoped | `getApiKeyByPublicId`, `validateAndGetApiKey` remain unscoped with code comment explaining why. `updateApiKeyLastUsed` scoped via apiKey record. | PRD-6292 |
| Must | FR3 | DAL boundary lint enforcement | Drizzle imports outside `data-access/`, `db/`, `dolt/`, `validation/`, `auth/*-schema*` are lint errors. Enforced in CI via `pnpm check`. | PRD-6293 |
| Must | FR4 | Extract inline Drizzle queries from auth.ts | All Drizzle operators (`and`, `eq`) removed from `auth/auth.ts`. Queries moved to `data-access/runtime/auth.ts`. | PRD-6293 |
| Must | FR5 | Shared PG error classification | `retryable-errors.ts` classifies SQLSTATE codes (15+ PG codes, 7+ Node.js codes, pool timeout patterns). Includes `isForeignKeyViolation()`, `isSerializationError()` helpers. | PRD-6294 |
| Must | FR6 | Shared retry utility | `withRetry<T>()` and `withRetryTransaction<T>()` with configurable max retries, exponential backoff + jitter. 64+ unit tests. | PRD-6294 |
| Must | FR7 | Fix ledgerArtifacts.ts crash bug | Optional chaining on all `error.cause.code` accesses. Remove TEMPORARY DEBUG console.error calls. | PRD-6294 |
| Must | FR8 | Replace ad-hoc FK violation checks | 3 locations in routes use `isForeignKeyViolation()` shared helper instead of inline `23503` checks. | PRD-6294 |
| Must | FR9 | Scope helpers work with runtime tables | `scopedWhere` accepts both manage and runtime schema tables. Verified by unit test with runtime table. | PRD-6295 |
| Must | FR10 | Migrate all manage/ DAL files (22 files) | All manual `eq()` scope filtering replaced with scope helpers. Split: 9 simple, 8 medium, 5 complex. | PRD-6296/6297/6298 |
| Must | FR11 | Migrate all runtime/ DAL files (15 files) | All manual `eq()` scope filtering replaced with scope helpers. Excludes auth tables. | PRD-6299 |
| Should | FR12 | scope-helpers exported from barrel | `data-access/index.ts` exports scope helpers for external consumption. | PRD-6295 |
| Should | FR13 | Refactor ledgerArtifacts.ts to use shared retry | Replace inline retry loop with `withRetry()`. | PRD-6294 |

### Non-Functional Requirements

- **Performance:** No query performance regression — scope helpers produce identical SQL to manual `eq()` chains
- **Reliability:** Retry utility prevents transient PG errors from becoming user-visible failures
- **Security/privacy:** Cross-tenant data isolation enforced at DAL layer, not dependent on caller discipline
- **Operability:** Retry utility logs attempt counts, error codes, and backoff durations for observability

## 7) Success Metrics & Instrumentation

- **Metric 1: Manual eq() scope calls eliminated**
  - Baseline: ~370 manual `eq(*.tenantId, ...)` calls
  - Target: 0 (all replaced by scope helpers)
- **Metric 2: Unscoped function count**
  - Baseline: 3 files with unscoped functions (tasks.ts, contextCache.ts, apiKeys.ts)
  - Target: 0 unscoped consumption functions (auth lookup functions documented as intentional exceptions)
- **Metric 3: DAL boundary violations**
  - Baseline: 2 files with Drizzle imports outside boundary
  - Target: 0 violations, enforced by CI

## 8) Current State

### Scope Infrastructure (in place)
- `scope-definitions.ts` defines `SCOPE_KEYS` with 5 levels: tenant, project, agent, subAgent, tool
- `scope-helpers.ts` has generic `scopedWhere<L>()` + 4 named wrappers
- `ScopedTable<L>` is structurally typed — already accepts any table with required columns (manage OR runtime)
- 1 of 36 DAL files converted: `subAgentExternalAgentRelations.ts` (13 functions, reference implementation)
- scope-helpers NOT exported from `data-access/index.ts` barrel

### Security Gaps (3 files)
- `tasks.ts`: `getTask`, `updateTask`, `listTaskIdsByContextId` — no tenant/project params at all
- `contextCache.ts`: `getCacheEntry` — reads by conversationId only, no tenant filter
- `apiKeys.ts`: `getApiKeyByPublicId` and `validateAndGetApiKey` are unscoped BUT intentionally so (auth entry points that discover tenantId). `updateApiKeyLastUsed` is unscoped and should be fixed.

### Error Handling (fragmented)
- `ledgerArtifacts.ts`: Inline retry with crash bug (missing optional chaining on `error.cause.code`)
- 2 TEMPORARY DEBUG `console.error` calls left in ledgerArtifacts.ts
- 3 ad-hoc `23503` FK violation checks scattered across route handlers
- 2 ad-hoc serialization error checks (inconsistent between `40001`/`XX000`/text matching)
- 1 proper utility: `isUniqueConstraintError()` in `utils/error.ts` — good template

### Stale Branches (available for reference)
- `feat/postgres-retry-error-handling`: Full retry framework with withRetry, retryable-errors.ts, 64 tests
- `implement/data-access-layer-enforcement`: lint-data-access-boundary.sh, auth.ts extraction

### DAL Boundary Violations (2 files)
- `auth/auth.ts`: imports `and`, `eq` from drizzle-orm for inline queries
- `agents-api/src/middleware/branchScopedDb.ts`: imports `drizzle` for DB client creation (infrastructure, may need allowlisting)

## 9) Proposed Solution

### Phase 1: Security Fix + Infrastructure (parallel — PRD-6292, PRD-6293, PRD-6294)

#### 9.1 Fix Unscoped Functions (PRD-6292)

**Scope reduction based on investigation:** Only 4 of 7 originally-flagged functions need scoping. The apiKey auth functions are intentionally unscoped (see D1).

**Functions to scope:**
- `getTask(params: { id })` → `getTask(params: { id, scopes: ProjectScopeConfig })`
- `updateTask(params: { taskId, data })` → `updateTask(params: { taskId, data, scopes: ProjectScopeConfig })`
- `listTaskIdsByContextId(params: { contextId })` → `listTaskIdsByContextId(params: { contextId, scopes: ProjectScopeConfig })`
- `getCacheEntry(params: { conversationId, ... })` → `getCacheEntry(params: { conversationId, ..., scopes: ProjectScopeConfig })`

**Call site updates (8 total):**
- `executionHandler.ts`: 5 updateTask calls + 1 getTask call — pass `executionContext` scopes
- `ArtifactService.ts`: 1 getTask + 1 listTaskIdsByContextId — pass `this.context.executionContext` scopes
- `a2a/handlers.ts`: 1 updateTask — pass `agent.tenantId/projectId` scopes
- `contextCache.ts` (class): 1 getCacheEntry — pass `this.executionContext` scopes

**`updateApiKeyLastUsed` fix:** Refactor call in `validateAndGetApiKey` to pass `{ tenantId: apiKey.tenantId, projectId: apiKey.projectId }` from the already-fetched apiKey record.

**Tests:** Add scoping isolation tests for each newly-scoped function in `__tests__/data-access/scoping/`.

#### 9.2 DAL Boundary Lint (PRD-6293)

**Approach:** Biome `noRestrictedImports` rule (see D2).

**Implementation:**
1. Extract inline Drizzle queries from `auth/auth.ts` into `data-access/runtime/auth.ts`
2. Add Biome rule restricting `drizzle-orm` imports to files matching the allowlist
3. Allowlist: `**/data-access/**`, `**/db/**`, `**/dolt/**`, `**/validation/**`, `**/*-schema*`, `**/branchScopedDb*`
4. Enforced via `pnpm check` (already runs Biome lint)

#### 9.3 PG Retry Utility (PRD-6294)

**Implementation:**
1. Create `packages/agents-core/src/retry/` directory:
   - `retryable-errors.ts` — SQLSTATE classification (from stale branch)
   - `withRetry.ts` — generic retry with exponential backoff + jitter (from stale branch)
   - `isForeignKeyViolation.ts` — shared helper replacing 3 ad-hoc checks
   - `isSerializationError.ts` — shared helper unifying 40001/40P01/XX000 detection
2. Fix crash bug in `ledgerArtifacts.ts` (add optional chaining)
3. Remove TEMPORARY DEBUG console.error calls
4. Replace 3 ad-hoc FK violation checks in routes with `isForeignKeyViolation()`
5. Add barrel export from `agents-core/src/index.ts`
6. Port 64 existing tests + add tests for new helpers

### Phase 2: Scope Helper Generalization (PRD-6295)

1. Verify `ScopedTable<L>` already accepts runtime tables (compile test)
2. If type changes needed, widen the constraint
3. Move `scope-helpers.ts` to shared location OR keep in `manage/` and add re-export (see D3)
4. Export from `data-access/index.ts` barrel
5. Add runtime table to scope-helpers unit test

### Phase 2: Manage DAL Migration (parallel — PRD-6296, PRD-6297, PRD-6298)

**Pattern (from reference implementation `subAgentExternalAgentRelations.ts`):**
```typescript
// Before:
where: and(
  eq(table.tenantId, params.scopes.tenantId),
  eq(table.projectId, params.scopes.projectId)
)

// After:
where: projectScopedWhere(table, params.scopes)
```

All three sub-issues touch **completely different files** and can run in parallel:
- **Simple (9 files, PRD-6296):** contextConfigs, externalAgents, functions, scheduledTriggers, scheduledWorkflows, tools, audit-queries, subAgents, triggers. Mechanical replacement — all use `params.scopes` already.
- **Medium (8 files, PRD-6297):** agents, credentialReferences, dataComponents, artifactComponents, skills, functionTools, projects, projectLifecycle. Normalize raw `tenantId`/`projectId` params to `params.scopes` where needed. Special attention to `projects.ts` (mixed param styles).
- **Complex (5 files, PRD-6298):** subAgentRelations (95 refs, 24 functions), subAgentTeamAgentRelations (57), evalConfig (83 refs, 53 functions), agentFull (22), projectFull. Deep nesting, JOINs, multi-scope operations. Use `subAgentExternalAgentRelations.ts` as template.

### Phase 3: Runtime DAL Migration (PRD-6299)

15 files, split by complexity:
- **10 straightforward** (use `params.scopes`): messages, conversations, evalRuns, cascade-delete, ledgerArtifacts, contextCache, apiKeys, audit-queries, triggerInvocations, scheduledTriggerInvocations
- **5 need normalization** (mixed param styles): apps, github-work-app-installations, workAppSlack, slack-work-app-mcp, projects

**Excluded:** users.ts, organizations.ts, userProfiles.ts (auth tables — no tenant scope by design). tasks.ts (already fixed in Wave 1).

**Hard dependency:** Requires PRD-6295 (scope helpers accept runtime tables) to merge first. Must also rebase on PRD-6292 changes (apiKeys.ts, contextCache.ts) and PRD-6294 changes (ledgerArtifacts.ts).

### Execution Order

```
Wave 0 — land first (foundation):
  PRD-6295  generalize helpers + barrel export (1 pt, smallest PR)

Wave 1 — all 6 in parallel after Wave 0 (all touch different files):
  PRD-6292  security fix      (tasks.ts, contextCache.ts, apiKeys.ts + callers)
  PRD-6293  DAL lint           (auth/auth.ts, biome.jsonc, new auth DAL)
  PRD-6294  retry utility      (new retry/ dir, ledgerArtifacts.ts, 3 route files)
  PRD-6296  manage simple      (9 manage/ files)
  PRD-6297  manage medium      (8 manage/ files)
  PRD-6298  manage complex     (5 manage/ files)
  PRD-6299  runtime migration  (15 runtime/ files)

Expected merge conflicts (minor, mechanical):
  - PRD-6294 + PRD-6299: both touch ledgerArtifacts.ts
  - PRD-6292 + PRD-6299: both touch apiKeys.ts, contextCache.ts
  - Whoever merges second rebases — all additive changes, no logic conflicts
```

### Alternatives Considered

- **Option A: Macro/codegen approach** — Generate scope conditions from schema annotations. Rejected: higher complexity, scope helpers are simple enough.
- **Option B: Runtime middleware enforcement** — Intercept all DB queries and inject scope filters. Rejected: fragile, hard to debug, doesn't prevent bad queries from being written.
- **Option C: Do nothing for apiKey auth functions** — Accept unscoped auth lookups. Chosen: these functions intentionally discover scope, not consume it.

## 10) Decision Log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | apiKey auth functions remain unscoped — intentional exceptions | T | No | **Accepted** | Auth lookup functions discover tenantId/projectId — scoping them creates circular dependency. `updateApiKeyLastUsed` will be scoped (apiKey record available at call site). | [evidence/unscoped-function-callers.md](evidence/unscoped-function-callers.md) | PRD-6292 scope: 4 functions scoped + 1 refactored (`updateApiKeyLastUsed`) + 2 documented exceptions (`getApiKeyByPublicId`, `validateAndGetApiKey`). |
| D2 | Biome noRestrictedImports preferred; shell script fallback if Biome lacks path-override support | T | No | **Accepted** | Biome rule already proven for createProtectedRoute. Need to verify path-based override support. If Biome can't allowlist specific file paths, use shell script added to `pnpm check`. | [evidence/dal-boundary-violations.md](evidence/dal-boundary-violations.md) | PRD-6293 implementation: try Biome first, fall back to shell script. Either way, enforced in CI. |
| D3 | Keep scope-helpers in manage/, add re-export from data-access/index.ts | T | No | **Accepted** | Minimal diff. Runtime code imports from barrel. File location is misleading but not worth rename churn. | [evidence/scope-helper-type-analysis.md](evidence/scope-helper-type-analysis.md) | PRD-6295: add barrel export only, no file move. |
| D4 | 1 PR per sub-issue for migration phases | P | No | **Accepted** | Easier to review, matches Linear tracking, can merge incrementally. Sequential dependencies mean each PR builds on the prior. | N/A | 8 total PRs across the project. |
| D5 | Maximum parallelism: PRD-6295 first (foundation), then all 7 remaining PRs in parallel | P | No | **Accepted** | PRD-6295 is the foundation (barrel export + runtime table support, 1 pt). Once merged, all other sub-issues touch different files and can run fully parallel. Minor merge conflicts on shared files (ledgerArtifacts.ts, apiKeys.ts, contextCache.ts) resolved by rebase. | N/A | Wave 0: PRD-6295. Wave 1: PRD-6292/6293/6294/6296/6297/6298/6299 all parallel. |

## 11) Open Questions

| ID | Question | Type | Priority | Blocking? | Plan to Resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | `toolScopedWhere` is missing from scope-helpers.ts — SCOPE_KEYS defines `tool` level but no named wrapper exists. Is it needed for this migration? | T | P1 | No (can add later) | Check if any DAL file scopes by toolId. If yes, add wrapper. | Open |
| Q2 | Stale branch code reuse strategy — cherry-pick files from stale branches vs rewrite from scratch? Branches have diverged from main. | T | P1 | No | Stale branches have net-new files (retry/) that can be copied. Diverged files (ledgerArtifacts.ts, auth.ts) must be re-applied fresh. | Open |
| Q3 | Should `branchScopedDb.ts` be allowlisted in the DAL boundary rule or should its drizzle client creation be extracted? | T | P2 | No | It creates DB clients (infrastructure), not queries. Allowlisting is appropriate. | Open |
| Q4 | Should the migration phases (3 & 4) be individual PRs per sub-issue, or batched? | P | P2 | No | 1 PR per sub-issue. | **Resolved → D4** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification Plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | ScopedTable<L> already accepts runtime tables without type changes | MEDIUM | Compile test with runtime table passed to scopedWhere | Before PRD-6295 starts | Active |
| A2 | All callers of unscoped functions have tenantId/projectId available | HIGH | Traced all call sites (evidence/unscoped-function-callers.md) | N/A | Active |
| A3 | 64 existing retry tests from stale branch still pass against current main | MEDIUM | Port tests and run | Before PRD-6294 starts | Active |
| A4 | Scope helper migration produces identical SQL (no behavioral change) | HIGH | scopedWhere is a thin wrapper over eq() + and() — same Drizzle operators | During each migration PR | Active |

## 13) In Scope (implement now)

**Goal:** Eliminate all manual scope filtering, fix security gaps, enforce DAL boundary, provide shared error handling.

**Non-goals:** See §3.

**Requirements:** FR1–FR13 (see §6).

**Proposed solution:** See §9.

**Owner(s):** TBD per sub-issue.

**Next actions (8 sub-issues):**
1. PRD-6292 — Fix unscoped functions (security, urgent)
2. PRD-6293 — DAL boundary lint
3. PRD-6294 — PG retry utility
4. PRD-6295 — Generalize scope helpers
5. PRD-6296 — Migrate manage/ simple (9 files)
6. PRD-6297 — Migrate manage/ medium (8 files)
7. PRD-6298 — Migrate manage/ complex (5 files)
8. PRD-6299 — Migrate runtime/ (15 files)

**Risks + mitigations:** See §14.

**What gets instrumented:** Retry utility logs attempt count, error code, backoff duration per retry. No new metrics — this is internal infrastructure.

## 14) Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Scope helper migration introduces subtle WHERE clause changes | Low | High — wrong query results, data leakage | Each migration PR must have 1:1 SQL equivalence review. Run existing scoping isolation tests. | Implementer + reviewer |
| Large PRs (especially PRD-6298 with 5 complex files) are hard to review | Medium | Medium — review fatigue, missed issues | Split into per-file commits within the PR. Reviewer can review commit-by-commit. | Implementer |
| Stale branch code has bitrot | Medium | Low — just need to rewrite affected parts | Net-new files (retry/) are safe to copy. Diverged files get fresh reimplementation. | Implementer |
| Biome noRestrictedImports may not support path-based allowlisting | Low | Medium — would need shell script fallback | Verify Biome rule supports `paths` filtering before committing to approach. | PRD-6293 implementer |
| Adding scopes to runtime functions breaks callers we didn't trace | Very Low | High — runtime errors | All callers traced exhaustively (evidence/unscoped-function-callers.md). TypeScript compiler catches missed call sites. | N/A |

## 15) Future Work

### Explored
- **Wrap all DAL functions in withRetry**
  - What we learned: The retry utility is designed to be opt-in per function. Not all operations are idempotent (e.g., creates). Bulk retry wrapping would require idempotency analysis per function.
  - Recommended approach: Adopt incrementally — start with read-heavy and idempotent functions.
  - Why not in scope now: Risk of double-writes without idempotency guarantees.
  - Triggers to revisit: If transient PG errors are a significant production issue.

### Identified
- **Integration-level scoping tests** — Current tests verify helper output shape, not actual cross-tenant isolation at the DB level. Would need test fixtures with multi-tenant data.
  - What we know: Gap exists but is low risk given scope helpers produce correct SQL.
  - Why it matters: Defense-in-depth for security-critical code.
  - What investigation is needed: Assess test infrastructure for multi-tenant fixtures.

### Noted
- **Scope helper codegen** — Auto-generate scope helper calls from schema annotations. Might matter if scope levels change frequently (they don't currently).
