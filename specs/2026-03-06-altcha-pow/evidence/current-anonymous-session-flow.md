# Current Anonymous Session Flow — Evidence

**Captured:** 2026-03-06
**Source:** Codebase trace

## Anonymous Session Endpoint

**Route:** `POST /run/auth/apps/{appId}/anonymous-session`
**File:** `agents-api/src/domains/run/routes/auth.ts` (lines 38-130)
**Auth:** `noAuth()` — fully public endpoint, no authentication required

### Handler Flow

1. **App Lookup** — `getAppById(runDbClient)(appId)`
2. **App Existence & Enable Check** — 404 if not found or disabled
3. **App Type Validation** — 400 if not `web_client`
4. **Origin Validation** — reads `Origin` header, validates against `config.webClient.allowedDomains`, 403 on mismatch
5. **Anonymous User ID Generation** — `"anon_" + crypto.randomUUID()`
6. **JWT Signing** — HS256 with `INKEEP_ANON_JWT_SECRET`, lifetime from `INKEEP_ANON_SESSION_LIFETIME_SECONDS` (default 86400s)
7. **Response** — `{ token: JWT, expiresAt: ISO8601 }`

### JWT Claims

```
{ tid, pid, app, type: "anonymous", sub: "anon_<uuid>", iss: "inkeep", iat, exp }
```

## App Schema State

**Table:** `apps` in runtime DB (`packages/agents-core/src/db/runtime/runtime-schema.ts`, lines 161-178)

**WebClientConfig Zod schema** (`packages/agents-core/src/validation/schemas.ts`, lines 1849-1856):
```typescript
WebClientConfigSchema = z.object({
  type: z.literal('web_client'),
  webClient: z.object({
    allowedDomains: z.array(z.string().min(1)).min(1),
    captchaEnabled: z.boolean().default(false),  // EXISTS but NOT ENFORCED
  }),
})
```

**Type definition** (`packages/agents-core/src/types/utility.ts`, lines 417-432):
```typescript
type WebClientConfig = {
  type: 'web_client';
  webClient: {
    allowedDomains: string[];
    captchaEnabled: boolean;
  };
};
```

## Rate Limiting State

**No rate limiting middleware exists anywhere:**
- No per-app, per-user, per-origin, or global rate limiting
- No PoW gate on any endpoint
- The anonymous session endpoint is fully open (protected only by domain validation)

## Auth Middleware (`tryAppCredentialAuth`)

**File:** `agents-api/src/middleware/runAuth.ts` (lines 475-563)

- Reads `x-inkeep-app-id` header
- Validates Bearer JWT (HS256, checks `payload.app` matches, signature, expiration, issuer)
- Extracts `endUserId` from `payload.sub`
- Fire-and-forget `lastUsedAt` update (10% sample rate)

## Key File Locations

| Component | Path |
|---|---|
| Anonymous session endpoint | `agents-api/src/domains/run/routes/auth.ts` |
| Runtime apps table schema | `packages/agents-core/src/db/runtime/runtime-schema.ts` |
| App config Zod schemas | `packages/agents-core/src/validation/schemas.ts` |
| App config types | `packages/agents-core/src/types/utility.ts` |
| App credential auth middleware | `agents-api/src/middleware/runAuth.ts` |
| App data access layer | `packages/agents-core/src/data-access/runtime/apps.ts` |
| Domain validation utility | `packages/agents-core/src/utils/domain-validation.ts` |
| Environment config | `agents-api/src/env.ts` |
| Auth endpoint tests | `agents-api/src/__tests__/run/routes/auth.test.ts` |
