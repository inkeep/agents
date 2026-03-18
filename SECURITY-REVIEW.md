# Security Review Report

**Date:** 2026-03-18
**Scope:** Full codebase security audit
**Reviewer:** Automated security analysis (Claude Code)

---

## Executive Summary

This review covers authentication/authorization, injection vulnerabilities, secrets management, input validation, CORS/headers, and dependency security. The codebase has strong fundamentals — layered auth, SpiceDB-backed permissions, hashed API keys, proper webhook signature verification — but has several critical and high-severity issues that should be addressed.

---

## Critical Findings

### 1. SQL Injection via `sql.raw()` — 15+ locations

**Severity:** CRITICAL
**Impact:** Arbitrary SQL execution, data exfiltration, modification, or deletion

Multiple Dolt-specific database operations use `sql.raw()` with string interpolation of user-controlled values, completely bypassing parameterization.

**Key files:**

| File | Issue |
|------|-------|
| `packages/agents-core/src/data-access/manage/projectLifecycle.ts:227-232` | `branchName`, `tenantId`, `projectId` interpolated in `AS OF` query |
| `packages/agents-core/src/dolt/diff.ts:14-19, 41-47` | `fromRevision`, `toRevision`, `tableName` interpolated |
| `packages/agents-core/src/dolt/merge.ts:47, 127-129` | Branch names, strategy, tableName interpolated |
| `packages/agents-core/src/dolt/branch.ts:22-35, 44, 64, 75-76` | Branch names in `DOLT_BRANCH()`, `DOLT_CHECKOUT()` |
| `packages/agents-core/src/dolt/commit.ts:18-20, 81, 104, 144, 162, 186, 195` | Table names, revisions, tags interpolated |
| `packages/agents-core/src/dolt/schema-sync.ts:92` | `targetBranch` interpolated |
| `packages/agents-core/src/dolt/ref-helpers.ts:69` | Hash interpolated in `DOLT_CHECKOUT()` |
| `agents-api/src/domains/run/routes/branches-api.ts:326` | `branch.fullName` and `agentId` interpolated |

**Example (projectLifecycle.ts):**
```typescript
const result = await configDb.execute(
  sql.raw(`
    SELECT name, description, models, stop_when, created_at, updated_at
    FROM projects AS OF '${branchName}'
    WHERE tenant_id = '${tenantId}' AND id = '${projectId}'
    LIMIT 1
  `)
);
```

**Recommendation:** Replace all `sql.raw()` calls with parameterized queries. For Dolt-specific functions that don't support standard parameterization, implement a strict allowlist validator for branch names, revision hashes, and table names (e.g., `/^[a-zA-Z0-9\-_./]+$/`).

---

### 2. Wildcard CORS on `/run/*` Routes

**Severity:** CRITICAL
**Location:** `agents-api/src/middleware/cors.ts:122-129`

```typescript
export const runCorsConfig: CorsOptions = {
  origin: '*',           // Wildcard origin
  allowHeaders: ['*'],
  credentials: true,     // Contradicts wildcard
};
```

The `/run/*` routes (agent execution endpoints) use wildcard CORS origin, which is overly permissive. While browsers will reject `credentials: true` with `origin: '*'`, this configuration signals an intent mismatch and may cause issues with different HTTP clients.

**Recommendation:** Replace wildcard with the `isOriginAllowed()` handler used by other routes.

---

### 3. No Rate Limiting

**Severity:** CRITICAL
**Location:** Global (no rate limiting middleware found)

No rate limiting exists on any endpoint:
- Auth endpoints (`/api/auth/*`) — vulnerable to credential stuffing/brute-force
- Webhook trigger endpoints — vulnerable to DoS
- Chat/API endpoints — vulnerable to abuse
- File upload endpoints — no protection

**Recommendation:** Implement rate limiting middleware, at minimum on auth, webhook, and chat endpoints.

---

## High-Severity Findings

### 4. Nango Secret Key Leaked in Credential Data

**Severity:** HIGH
**Location:** `packages/agents-core/src/credential-stores/nango-store.ts:351`

The Nango secret key is included in the credential data object returned by the store:

```typescript
const credentialData: NangoCredentialData = {
  ...tokenAndCredentials,
  secretKey: this.nangoConfig.secretKey,  // Secret key included
};
```

**Recommendation:** Remove `secretKey` from the credential data object. It should stay isolated at the store level.

### 5. Unsafe `postMessage()` with Wildcard Origin

**Severity:** HIGH
**Location:** `agents-api/src/domains/manage/routes/oauth.ts:148`

```typescript
window.opener.postMessage({ type: 'oauth-success', timestamp: Date.now() }, '*');
```

Wildcard target origin sends the message to any origin that opened the popup.

**Recommendation:** Use explicit origin: `window.opener.postMessage({...}, window.location.origin)`.

### 6. Weak OAuth State Parameter

**Severity:** HIGH
**Location:** `agents-api/src/utils/oauthService.ts:140-149`

```typescript
const state = `tool_${toolId}`;  // Predictable state
```

State parameter is deterministic and derived only from `toolId`. While PKCE provides additional protection, state should be cryptographically random.

**Recommendation:** Generate cryptographically random state values and store them server-side for verification.

### 7. In-Memory PKCE Storage (Not Production-Ready)

**Severity:** HIGH
**Location:** `agents-api/src/utils/oauthService.ts:14-26`

PKCE verifiers stored in a `Map<>` in memory. In multi-instance deployments, PKCE state from one instance won't be available on another. Code has a TODO confirming this is known.

**Recommendation:** Migrate to Redis or database-backed storage for production.

### 8. SSRF Risk in A2A Client

**Severity:** HIGH
**Location:** `agents-api/src/domains/run/a2a/client.ts:214-217`

The A2A client fetches external agent URLs from database records with no validation against private IP ranges or cloud metadata service IPs (169.254.169.254).

**Recommendation:** Apply the same `validateExternalImageUrl()` pattern (from `image-url-security.ts`) to A2A client URLs — validate DNS resolution and block private/reserved IP ranges.

### 9. Cookie `SameSite=None` in Production

**Severity:** HIGH
**Location:** `packages/agents-core/src/auth/auth.ts:256-262`

```typescript
defaultCookieAttributes: {
  httpOnly: true,
  ...(isSecure
    ? { sameSite: 'none' as const, secure: true }   // Increases CSRF surface
    : { sameSite: 'lax' as const, secure: false }),
},
```

`SameSite=None` significantly increases CSRF attack surface. Only appropriate if cross-site auth is required.

**Recommendation:** Use `SameSite=Strict` or `SameSite=Lax` unless cross-site scenarios are explicitly required.

---

## Medium-Severity Findings

### 10. Bypass Secrets in Production Builds

**Severity:** MEDIUM
**Location:** Multiple middleware files

Multiple bypass secrets exist:
- `INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET` (manageAuth.ts)
- `INKEEP_AGENTS_RUN_API_BYPASS_SECRET` (runAuth.ts)
- `INKEEP_AGENTS_EVAL_API_BYPASS_SECRET` (evalsAuth.ts)

No runtime assertion prevents these from being set in production.

**Recommendation:** Add startup assertions that these are NOT set when `ENVIRONMENT=production`.

### 11. Test Environment Auth Bypass

**Severity:** MEDIUM
**Location:** Multiple middleware files

When `ENVIRONMENT=test`, ALL auth is bypassed (tenant access set to OWNER, permission checks skipped, bearer tokens optional). If accidentally set in production, all routes would be unprotected.

**Recommendation:** Add runtime assertions that `ENVIRONMENT=test` cannot coexist with production-like configurations.

### 12. No Request Body Size Limits

**Severity:** MEDIUM
**Location:** `agents-api/src/createApp.ts`

No global JSON body size limits configured. Potential DoS via large payloads, especially on webhook and chat endpoints.

**Recommendation:** Add Hono middleware to enforce body size limits (2-10MB depending on endpoint).

### 13. User-Supplied Regex Without ReDoS Protection

**Severity:** MEDIUM
**Location:** `packages/agents-core/src/validation/schemas.ts:820-829, 846-856`

Webhook signature configuration allows user-provided regex patterns. The `validateRegex()` function checks syntax but not catastrophic backtracking patterns like `(a+)+b`.

**Recommendation:** Add ReDoS detection (e.g., check for nested quantifiers) or use a safe regex library.

### 14. Missing Security Headers

**Severity:** MEDIUM
**Location:** `agents-api/src/middleware/errorHandler.ts`

Only `X-Content-Type-Options: nosniff` is set. Missing:
- `Content-Security-Policy`
- `X-Frame-Options`
- `Strict-Transport-Security`

**Recommendation:** Add comprehensive security headers middleware.

### 15. Development Session Bypass Endpoint

**Severity:** MEDIUM
**Location:** `agents-api/src/createApp.ts:63-110`

Dev session endpoint creates sessions without normal auth flow when `ENVIRONMENT=development`. Could be exploited if environment is misconfigured.

**Recommendation:** Add defense-in-depth checks beyond just the environment variable.

### 16. `console.log/error` in Production Code

**Severity:** MEDIUM
**Location:** `nango-store.ts:277`, `oauth.ts:68`

Direct `console.log/error` calls could leak error details to stdout. Should use structured logger.

**Recommendation:** Replace all `console.*` calls with `logger.*` calls.

### 17. Routes Not Using `createProtectedRoute()`

**Severity:** MEDIUM
**Location:** `signoz.ts`, `mcp.ts`, `agents.ts` (run domain)

These routes use plain Hono methods instead of `createProtectedRoute()`. While they're behind global auth middleware, this bypasses OpenAPI auth documentation and could lead to future regressions.

**Recommendation:** Convert to `createProtectedRoute()` for consistency.

---

## Low-Severity Findings

### 18. XSS via `dangerouslySetInnerHTML` in Chart Component

**Severity:** LOW
**Location:** `agents-manage-ui/src/components/ui/chart.tsx:76-94`

Dynamic CSS generated with `dangerouslySetInnerHTML`. Color values come from a config object, so risk is low unless config validation is bypassed.

### 19. Unbounded String Fields

**Severity:** LOW
**Location:** `packages/agents-core/src/validation/schemas.ts`

Many fields (agent names, descriptions, custom context) have no max length constraint. Could enable memory exhaustion with extremely long values.

### 20. Overly Permissive Zod Schemas

**Severity:** LOW
**Location:** `packages/agents-core/src/validation/schemas.ts`

15+ uses of `z.any()` and numerous `z.record(z.string(), z.unknown())` patterns. Some are intentional (dynamic tool outputs), but several could be more strictly typed.

### 21. Missing HTTPS Enforcement for OAuth Callbacks

**Severity:** LOW
**Location:** `agents-api/src/domains/manage/routes/oauth.ts:79-82`

No validation that OAuth callback URLs use HTTPS in production.

### 22. `x-inkeep-run-as-user-id` Header Not Validated

**Severity:** LOW
**Location:** `agents-api/src/middleware/runAuth.ts:78`

The `runAsUserId` header is extracted but its format is not validated.

---

## Positive Security Findings

The codebase has several strong security patterns worth acknowledging:

- **Layered auth architecture** — Manage, Run, and Work-Apps domains each have explicit auth middleware
- **SpiceDB-backed authorization** — Fine-grained permission checks (view/use/edit) on projects
- **API keys hashed at rest** — Only prefix stored for lookup; hash used for verification
- **Timing-safe HMAC verification** — Both GitHub and Slack webhooks use `timingSafeEqual()`
- **Credential store abstraction** — Secrets stored in external services (Nango, OS Keychain), not in database
- **SSRF prevention for image downloads** — Excellent URL validation with DNS resolution checks and private IP blocking
- **Pagination limits enforced** — Max 100 items per page, tested
- **JMESPath injection protection** — Pattern-based validation with dangerous operation blocking
- **Code execution validation** — AST-based syntax validation for user-supplied function code
- **RFC 7807 error responses** — No stack traces leaked to clients
- **Strong .gitignore** — `.env` files and credential files properly excluded

---

## Remediation Priority

### Immediate (before next deploy)
1. Add ReDoS protection for user-supplied regex
2. Fix `postMessage()` wildcard origin
3. Remove Nango secret key from credential data object
4. Add runtime assertions blocking bypass secrets in production

### Short-term (next sprint)
5. Replace `sql.raw()` calls with parameterized queries or strict input validation
6. Implement rate limiting on auth, webhook, and chat endpoints
7. Fix CORS wildcard on `/run/*` routes
8. Add request body size limits
9. Migrate PKCE storage to Redis/database

### Medium-term
10. Add comprehensive security headers (CSP, HSTS, X-Frame-Options)
11. Add SSRF protection to A2A client URLs
12. Review `SameSite=None` cookie necessity
13. Add `max()` constraints to unbounded string fields
14. Convert remaining routes to `createProtectedRoute()`
