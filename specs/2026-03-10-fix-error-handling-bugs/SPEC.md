# PRD-6257: Fix Immediate Error Handling Bugs

**Status:** Ready for implementation
**Priority:** Urgent
**Linear:** https://linear.app/inkeep/issue/PRD-6257
**Blocks:** PRD-6258 (error sanitization), PRD-6259 (withErrorBoundary utility)

---

## 1. Problem

Two bug classes exist across 4 route files (~10 catch blocks):

1. **Missing HTTPException guards** — Auth/validation `HTTPException`s thrown by middleware get caught by route-level catch blocks and re-thrown as generic 500s. Clients see "internal server error" instead of the correct 401/403/400. Same bug class as Sentry #7322158580 (fixed in PR #2591 for `contextValidationMiddleware`).

2. **Raw `error.message` leaks** — Catch blocks pass `error.message` directly into `createApiError` for 500-level responses. DB errors like `"connect ECONNREFUSED 10.0.0.5:5432"` reach the client verbatim via the `detail` field.

## 2. Scope

### In Scope

Fix all 10 catch blocks across 4 files with the canonical pattern:
```typescript
} catch (error) {
  if (error instanceof HTTPException) { throw error; }  // guard
  // ... domain-specific checks (ZodError, 'not found', SpiceDB) ...
  throw createApiError({
    code: 'internal_server_error',
    message: 'Static fallback message',  // never error.message
  });
}
```

### Out of Scope
- Structural prevention (PRD-6258 sanitization, PRD-6259 withErrorBoundary) — separate PRs
- Adding new test infrastructure — use existing test patterns
- Refactoring the `error.message.includes('not found')` string-matching (fragile but functional; separate concern)

## 3. Files and Changes

### 3a. `agents-api/src/domains/run/routes/chatDataStream.ts`

**Lines 550-564** — Missing HTTPException guard.

| Change | Detail |
|--------|--------|
| Add import | `import { HTTPException } from 'hono/http-exception';` |
| Add guard | `if (error instanceof HTTPException) { throw error; }` as first line in catch (before `logger.error`) |

No message leak — already uses static string.

### 3b. `agents-api/src/domains/run/routes/chat.ts`

**Lines 546-563** — Weak shape check + raw message leak.

| Change | Detail |
|--------|--------|
| Add import | `import { HTTPException } from 'hono/http-exception';` |
| Replace shape check (L555-557) | Replace `error && typeof error === 'object' && 'status' in error` with `error instanceof HTTPException`. Move guard **before** `logger.error` call. |
| Fix message leak (L561) | Replace `error instanceof Error ? error.message : 'Failed to process chat completion'` with `'Failed to process chat completion'` |

### 3c. `agents-api/src/domains/manage/routes/projectFull.ts`

Already imports `HTTPException` (line 36). 4 catch blocks to fix:

| Catch block (lines) | Route | Guard fix | Message fix |
|---------------------|-------|-----------|-------------|
| 273-285 | GET full project | Add guard before `'not found'` check | L283: static `'Failed to retrieve project'` |
| 331-343 | GET full project (with relation IDs) | Add guard before `'not found'` check | L341: static `'Failed to retrieve project'` |
| 657-703 | PUT/POST upsert project | Move existing guard (L695) to **top** of catch, before ZodError check (L658) | L701: static `'Failed to update project'` |
| 795-807 | DELETE project | Add guard before `'not found'` check | L805: static `'Failed to delete project'` |

**Note on L657-703 ordering:** The HTTPException guard must come first. ZodError and `'ID mismatch'` checks are for domain errors (never HTTPExceptions). SpiceDB gRPC error detection also comes after — SpiceDB errors have `metadata` and numeric `code`, not `status` from HTTPException.

### 3d. `agents-api/src/domains/manage/routes/agentFull.ts`

No existing `HTTPException` import. 3 catch blocks to fix:

| Catch block (lines) | Route | Guard fix | Message fix |
|---------------------|-------|-----------|-------------|
| 152-164 | GET full agent | Add guard before `'not found'` check | L162: static `'Failed to retrieve agent'` |
| 298-317 | PUT/POST upsert agent | Add guard before ZodError check (L299) | L315: static `'Failed to update agent'` |
| 363-375 | DELETE agent | Add guard before `'not found'` check | L373: static `'Failed to delete agent'` |

## 4. Test Plan

Add regression tests verifying:
- HTTPExceptions (e.g., 401 from auth) pass through catch blocks unmodified (correct status code reaches client)
- Unexpected errors (e.g., DB connection failure) produce 500 with static message, not raw `error.message`
- Domain-specific checks still work: `ZodError` → 400, `'not found'` → 404, SpiceDB errors → 500 with specific message

Existing test files to extend:
- `agents-api/src/__tests__/run/routes/chat.test.ts`
- `agents-api/src/__tests__/manage/routes/crud/agentFull.test.ts`
- `agents-api/src/__tests__/manage/integration/projectFull.test.ts`

## 5. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `'not found'` string matching stops working | Very low — HTTPExceptions from auth don't contain "not found" | Covered by existing + new tests |
| `chat.ts` shape check was catching non-HTTPException errors with `status` | Low — `instanceof` is stricter and more correct; anything with a `.status` that isn't an HTTPException *should* become a 500 | Correct behavior |
| No test coverage for the bug class today | Medium — this is why the bugs existed | Addressed by test plan above |

## 6. Acceptance Criteria

- [ ] All 10 catch blocks have `if (error instanceof HTTPException) { throw error; }` as their **first** check
- [ ] Zero catch blocks pass `error.message` to `createApiError` for 500-level codes
- [ ] `pnpm check` passes
- [ ] Regression tests cover HTTPException pass-through and static message enforcement

## 7. Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Use `instanceof HTTPException` not shape check | Strict, correct, matches canonical pattern from PR #2591 |
| D2 | Replace `error.message` with static strings (not sanitized `error.message`) | PRD-6258 will add sanitization in `createApiError`; for now, static strings are the safest immediate fix |
| D3 | Keep `error.message.includes('not found')` pattern as-is | Fragile but functional; refactoring it is out of scope and lower priority |
| D4 | Move guard to top of catch in projectFull.ts L657 (before ZodError) | HTTPException must be the first check — domain errors (ZodError, SpiceDB) are never HTTPExceptions |
| D5 | Thorough test matrix per catch block | Full coverage: ZodError → 400, 'not found' → 404, SpiceDB → 500 w/ specific msg, DB failure → 500 w/ static msg, auth HTTPException → pass-through |
