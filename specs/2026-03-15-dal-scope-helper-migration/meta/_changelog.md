## 2026-03-15

### Changes
- **Spec created** from PRD-6291 + 8 sub-issues (PRD-6292 through PRD-6299)
- **evidence/unscoped-function-callers.md:** Created — traced all 7 unscoped functions to callers. Critical finding: apiKey auth functions (getApiKeyByPublicId, validateAndGetApiKey) CANNOT be scoped — they discover tenantId/projectId, not consume it.
- **evidence/retry-and-error-patterns.md:** Created — inventoried crash bug in ledgerArtifacts.ts, 2 TEMPORARY DEBUG console.errors, 3 ad-hoc FK violation checks, 2 serialization error checks, 1 proper error utility (isUniqueConstraintError).
- **evidence/scope-helper-type-analysis.md:** Created — ScopedTable<L> is structurally typed with `any`, already accepts runtime tables. PRD-6295 may be simpler than expected (relocation + export, not type changes). Needs compilation verification.
- **evidence/dal-boundary-violations.md:** Created — 2 violations outside boundary (auth.ts, branchScopedDb.ts). Existing Biome noRestrictedImports pattern available to follow. scope-helpers missing from barrel export.
- **D1 proposed:** apiKey auth functions must remain unscoped (PRD-6292 scope reduction)
- **D2 proposed:** Biome noRestrictedImports vs shell script for DAL boundary enforcement
- **D3 proposed:** scope-helpers relocation strategy (keep in manage/ vs move to shared)

- **D1 accepted:** apiKey auth functions remain unscoped as intentional exceptions. PRD-6292 scope: 4 functions scoped + 1 refactored + 2 documented exceptions.
- **D2 accepted:** Biome noRestrictedImports preferred, shell script fallback.
- **D3 accepted:** Keep scope-helpers in manage/, add re-export from barrel (Option A).
- **D4 created + accepted:** 1 PR per sub-issue for migration phases.
- **Q4 resolved → D4**

- **D5 revised + accepted:** PRD-6295 lands first as Wave 0 (foundation — barrel export + runtime table support). Then all 7 remaining PRs run in parallel as Wave 1. PRD-6299 no longer needs a separate wave since helpers are ready after Wave 0.
- **Spec finalized** — status set to Approved.

### Pending (carried forward)
- Q1: toolScopedWhere missing — resolve during implementation (check if any file needs tool-level scoping)
- Q2: Stale branch reuse — implementer decision (copy net-new, rewrite diverged)
- Q3: branchScopedDb.ts — allowlist in lint rule (infrastructure, not a DAL violation)
- Verify Biome path-override capability during PRD-6293 implementation
