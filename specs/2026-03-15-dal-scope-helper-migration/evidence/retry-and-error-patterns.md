---
title: Ad-Hoc Retry and Error Handling Patterns
description: Inventory of all ad-hoc retry logic, FK violation checks, serialization error checks, and the crash bug in ledgerArtifacts.ts.
created: 2026-03-15
last-updated: 2026-03-15
---

## Crash Bug: Missing Optional Chaining

**File:** `packages/agents-core/src/data-access/runtime/ledgerArtifacts.ts:272-274`
```typescript
const isRetryable =
  error.cause.code === '40P01' ||   // NO optional chaining — crashes if error.cause is undefined
  error.cause.code === '40001' ||   // same
  error.cause.code === '55P03' ||   // same
```
**Impact:** TypeError crash if any non-PG error is thrown (e.g., validation error, network error without cause).

## TEMPORARY DEBUG console.error (2 locations)

1. `ledgerArtifacts.ts:194-204` — in `upsertLedgerArtifact`, logs compression artifact errors
2. `ledgerArtifacts.ts:298-312` — in `addLedgerArtifacts`, logs bulk insert compression errors

Both check for `compress_` in artifact IDs and dump full error objects to console.error.

## Ad-Hoc Retry Logic

### ledgerArtifacts.ts:260-289 — `addLedgerArtifacts`
- 3 attempts, exponential backoff: `min(1000 * 2^(attempt-1), 5000)`
- Checks: 40P01, 40001, 55P03, plus text patterns ("database is locked", "busy", "timeout", "deadlock", "serialization failure")
- Fallback: row-by-row insert, then minimal row insert
- **Issues:** crash bug (above), no jitter, hardcoded constants

## Ad-Hoc Foreign Key Violation Checks (23503)

1. `agents-api/src/domains/manage/routes/subAgentToolRelations.ts:258`
   ```typescript
   if ((error as any)?.cause?.code === '23503') { throw createApiError({...}) }
   ```

2. `agents-api/src/domains/manage/routes/apiKeys.ts:198`
   ```typescript
   if (error?.cause?.code === '23503') { throw createApiError({...}) }
   ```

3. `agents-api/src/domains/evals/workflow/functions/runDatasetItem.ts:119`
   ```typescript
   if (error?.cause?.code === '23503' || error?.code === '23503') { logger.warn(...) }
   ```

## Serialization Error Checks

1. `ledgerArtifacts.ts:272-274` — checks 40P01, 40001, 55P03 (with crash bug)
2. `data-access/manage/tools.ts:435-441` — checks message includes "serialization failure" or "40001", plus `cause?.code === 'XX000'` (Dolt-specific)

## Existing Proper Error Utility

`packages/agents-core/src/utils/error.ts:293-303` — `isUniqueConstraintError()`:
- Checks 23505 (PG unique violation), 1062 (Doltgres MySQL errno), "already exists" fallback
- Properly uses optional chaining throughout
- **Good template** for isForeignKeyViolation and isSerializationError

## Confidence: CONFIRMED (all findings from source code)
