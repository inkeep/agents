---
title: ScopedTable Type Constraint Analysis
description: Analysis of why scope helpers currently work with manage tables and whether they need changes for runtime tables. Finding — the constraint is structural and already accepts runtime tables.
created: 2026-03-15
last-updated: 2026-03-15
---

## Current Type Definition (scope-definitions.ts:26-28)

```typescript
export type ScopedTable<L extends ScopeLevel> = {
  [K in ScopeKeysOf<L>]: any;
};
```

For `ScopedTable<'project'>`, this requires:
```typescript
{ tenantId: any; projectId: any; }
```

## Finding: The Constraint is STRUCTURAL, Not Schema-Specific

Both manage and runtime tables are `PgTableWithColumns` instances with identical column property patterns. A runtime table like `conversations` has `tenantId: PgColumn<...>` and `projectId: PgColumn<...>`, which satisfies `ScopedTable<'project'>`.

**Tested mentally:** `scopedWhere('project', conversations, scopes)` would type-check and work at runtime. The helpers are not used with runtime tables by convention, not by type constraint.

## What PRD-6295 Actually Needs

Since the type constraint already works, PRD-6295 may be simpler than expected:
1. Verify with an actual TypeScript compilation (not just analysis)
2. Add a runtime table to the scope-helpers unit test to prove cross-schema usage
3. Move scope-helpers to a shared location (currently in `data-access/manage/`)
4. Export from `data-access/index.ts` barrel

The "generalization" may be primarily about **relocation and export**, not type changes.

## Confidence: INFERRED (structural analysis, not compiled verification)

Verification needed: Actually compile a test that passes a runtime table to scopedWhere to confirm no hidden type issues from Drizzle's internal generics.
