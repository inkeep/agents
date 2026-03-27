# PRD-6258: Move Error Message Sanitization into createApiError for 500-level Errors

**Status:** Ready for implementation
**Priority:** High (Security)
**Linear:** https://linear.app/inkeep/issue/PRD-6258
**Depends on:** PRD-6257 (must land first — fixes immediate bugs in the same error paths)
**Blocks:** PRD-6259 (withErrorBoundary utility)

---

## 1. Problem

The global error handler (`errorHandler.ts`) has a regex sanitizer that redacts sensitive keywords before sending error messages to clients. However, this sanitizer is **bypassed for all `createApiError` paths** because `createApiError()` pre-bakes the HTTP response body inside the HTTPException — the global handler extracts and returns it as-is without re-sanitizing.

This means every `createApiError({ code: 'internal_server_error', message: error.message })` call site is a potential information leak. The research identified **11 call sites** that pass raw `error.message` for 500-level errors, plus 5 that interpolate internal state.

**After PRD-6257 lands**, the immediate leaks are patched (static strings). But `createApiError` remains structurally unsafe — any future developer passing `error.message` for a 500 will re-introduce the vulnerability.

## 2. Scope

### In Scope
- Add `sanitizeErrorMessage()` helper in `packages/agents-core/src/utils/error.ts`
- Apply sanitization inside `createApiError` for `status >= 500`
- Update the existing sanitizer in `handleApiError` (L197-200) to use the same helper
- Unit tests for the sanitizer and the `createApiError` integration

### Out of Scope
- Changing 4xx error messages (these are developer-crafted, intentionally descriptive)
- Modifying any call sites — the fix is centralized in `createApiError`
- Adding sanitization to the `extensions` object (separate concern, lower risk)

## 3. Changes

### Single file: `packages/agents-core/src/utils/error.ts`

#### 3a. Add `sanitizeErrorMessage` helper (before `createApiError`)

```typescript
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, '[REDACTED_HOST]')
    .replace(/postgresql:\/\/[^\s,)]+/gi, '[REDACTED_CONNECTION]')
    .replace(/\/(?:var|tmp|home|usr|etc|opt)\/\S+/g, '[REDACTED_PATH]')
    .replace(/\b(password|token|key|secret|auth|credential)\b/gi, '[REDACTED]');
}
```

| Regex | What it catches | Example |
|-------|----------------|---------|
| IPv4 with optional port | `10.0.0.5:5432` | `connect ECONNREFUSED [REDACTED_HOST]` |
| PostgreSQL connection strings | `postgresql://appuser@host:5432/db` | `[REDACTED_CONNECTION]` |
| Server file paths | `/var/task/packages/...` | `[REDACTED_PATH]` |
| Sensitive keywords | `password`, `token`, `key`, `secret`, `auth`, `credential` | `[REDACTED]` |

#### 3b. Apply in `createApiError` for 500-level errors

At line ~93 (after `const status = errorCodeToHttpStatus[code];`):

```typescript
const sanitizedMessage = status >= 500 ? sanitizeErrorMessage(message) : message;
```

Then replace all downstream uses of `message` with `sanitizedMessage`:
- L100: `detail: sanitizedMessage`
- L106: `sanitizedMessage.length > 100 ? ...`
- L110: `error: { code, message: errorMessage }` (uses truncated `sanitizedMessage`)
- L125: `new HTTPException(status, { message: sanitizedMessage, res })`

#### 3c. Update `handleApiError` sanitizer (L197-200)

Replace the inline regex with the shared helper:

```typescript
const sanitizedErrorMessage =
  error instanceof Error
    ? sanitizeErrorMessage(error.message)
    : 'Unknown error';
```

## 4. What the sanitizer does NOT catch (accepted)

| Pattern | Example | Why accepted |
|---------|---------|-------------|
| DB table/column names | `relation "agents" does not exist` | Low sensitivity; would need NLP to detect |
| SQL fragments | `SELECT * FROM agents WHERE ...` | Would require SQL parser; static messages from PRD-6257 cover the main paths |
| Internal hostnames | `svc-internal.cluster.local` | Would need hostname regex; low exposure risk |
| Version strings that look like IPs | `1.2.3.4` | Unlikely in error messages; acceptable false positive for 500s |

The sanitizer is an 80/20 defense-in-depth layer. The primary defense is PRD-6257's static messages. If a more aggressive approach is needed later, the `detail` field for 500s can be replaced entirely with a generic message (keeping raw info only in server logs).

## 5. Test Plan

Add tests in `packages/agents-core/src/utils/__tests__/error.test.ts`:

### sanitizeErrorMessage tests
- Redacts IPv4 addresses: `connect ECONNREFUSED 10.0.0.5:5432` → `connect ECONNREFUSED [REDACTED_HOST]`
- Redacts connection strings: `postgresql://appuser:pass@host:5432/db` → `[REDACTED_CONNECTION]`
- Redacts file paths: `/var/task/packages/agents-core/dist/index.js` → `[REDACTED_PATH]`
- Redacts sensitive keywords: `Invalid auth token` → `Invalid [REDACTED] [REDACTED]`
- Preserves safe messages: `Failed to retrieve project` → unchanged

### createApiError integration tests
- 500 error sanitizes message: `createApiError({ code: 'internal_server_error', message: 'connect ECONNREFUSED 10.0.0.5:5432' })` → response body `detail` does not contain `10.0.0.5`
- 400 error preserves message: `createApiError({ code: 'bad_request', message: 'Missing header: x-api-key' })` → response body `detail` contains original message unchanged

## 6. Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Sanitize only `status >= 500`, not 4xx | 4xx messages are developer-crafted and intentionally descriptive for API consumers |
| D2 | Keep sanitizer as file-private (not exported) initially | Only needed in `error.ts`; can export later if other packages need it |
| D3 | Use regex approach, not generic message replacement | Preserves some diagnostic value in 500 responses while redacting sensitive patterns |
| D4 | Add `credential` to keyword list (beyond original 5) | Matches codebase patterns (`credentialStores`, app credentials) |

## 7. Acceptance Criteria

- [ ] `sanitizeErrorMessage` helper exists and is tested
- [ ] `createApiError` sanitizes messages for `status >= 500`
- [ ] `createApiError` preserves messages for `status < 500`
- [ ] `handleApiError` uses the same sanitizer (no duplicate regex)
- [ ] `pnpm check` passes
