---
title: Better-Auth Interface Compatibility for Anonymous End-User Auth
description: Analysis of how the proposed stateless anonymous auth compares to Better-Auth's interface, and the path from stateless → stateful auth.
created: 2026-03-03
last-updated: 2026-03-03
---

## Better-Auth's Session Model (Current System)

**Token format:** Opaque tokens (NOT JWTs). Format: `token.hmac-signature`.
**Validation:** Always hits DB via `auth.api.getSession({ headers })` → returns `{ user, session }`.
**Storage:** `session` table: `{ id, token, userId, expiresAt, activeOrganizationId, ipAddress, userAgent }`.
**User table:** `{ id, email, name, emailVerified, image, createdAt, updatedAt }`. Email is required.
**Transport:** `Authorization: Bearer <token>` header OR cookie.

**Confidence:** CONFIRMED (read from `auth.ts`, `auth-schema.ts`, `manageAuth.ts`, `createApp.ts`)

## Better-Auth Anonymous Plugin

Better-Auth v1.4.19 (the version used) has a built-in `anonymous()` plugin:
- Creates user records with synthetic emails (`temp@{id}.com`) and `isAnonymous: true` flag
- Creates sessions like any other auth method
- Users can later "link" a real authentication method (account merging)
- Requires adding `isAnonymous` boolean to user table

**API:**
```typescript
// Server
import { anonymous } from 'better-auth/plugins';
const auth = betterAuth({ plugins: [anonymous()] });

// Client
const user = await authClient.signIn.anonymous();
// Returns session token + user record
```

**Confidence:** CONFIRMED (Better-Auth docs + codebase version check)

## Interface Comparison

| Dimension | Proposed Phase 1 (Stateless JWT) | Better-Auth Session (Stateful) |
|---|---|---|
| **Token format** | JWT (readable, self-contained) | Opaque + HMAC signature |
| **Validation** | Signature check (pure CPU, <1ms) | DB lookup via `auth.api.getSession()` |
| **Transport** | `Authorization: Bearer <jwt>` | `Authorization: Bearer <token>` |
| **User record** | None — identity is in JWT claims | `user` table row with `isAnonymous: true` |
| **Session record** | None — stateless | `session` table row |
| **Expiration** | In JWT `exp` claim (24h) | In `session.expiresAt` (7d default, auto-refresh) |
| **Revocation** | Not possible (stateless) | Delete session row |
| **Auto-refresh** | Widget requests new JWT | Better-Auth auto-refreshes |
| **Account linking** | Not supported natively | Built-in via anonymous plugin |

## What's the Same (Interface Compatibility)

Regardless of stateless vs stateful, the following are identical:

1. **Transport:** `Authorization: Bearer <token>` header — widget sends the same way
2. **App identification:** `X-Inkeep-App-Id: <appId>` header — orthogonal to user auth
3. **Execution context output:** `{ endUserId: string, authMethod: 'anonymous' | 'hs256', appId: string }` — downstream code doesn't care about the backing
4. **Conversation keying:** `(tenantId, projectId, endUserId)` — same regardless of token format

## What Changes (Stateless → Stateful Migration)

1. **Token format:** JWT → opaque (widget doesn't care — it's an opaque string either way)
2. **Validation logic in middleware:** JWT signature check → `auth.api.getSession()` call
3. **Session endpoint response:** Returns JWT → returns Better-Auth session token
4. **User model:** No user record → `user` table row with `isAnonymous: true`
5. **Anonymous session endpoint:** `POST /auth/apps/{appId}/anonymous-session` stays, but internally calls Better-Auth's anonymous sign-in instead of signing a JWT

## Compatibility Design Pattern

The auth middleware can use a strategy pattern that supports both:

```typescript
async function validateEndUserToken(token: string, app: AppRecord): Promise<EndUserIdentity> {
  // Try stateless JWT first (Phase 1, fast path)
  if (looksLikeJwt(token)) {
    const claims = verifyAnonymousJwt(token, INKEEP_ANON_JWT_SECRET);
    if (claims) return { sub: claims.sub, type: claims.type, method: 'jwt' };
  }

  // Try Better-Auth session (Phase 2+, DB lookup)
  const session = await auth.api.getSession({
    headers: new Headers({ Authorization: `Bearer ${token}` }),
  });
  if (session?.user) {
    return {
      sub: session.user.id,
      type: session.user.isAnonymous ? 'anonymous' : 'authenticated',
      method: 'better-auth',
    };
  }

  // Try customer-signed JWT (HS256)
  if (app.config.webClient?.hs256Enabled) {
    const claims = verifyCustomerJwt(token, app.config.webClient.hs256Secret);
    if (claims) return { sub: claims.sub, type: 'authenticated', method: 'hs256' };
  }

  throw new HTTPException(401, { message: 'Invalid end-user token' });
}
```

This means:
- Phase 1: Only JWT path active
- Phase 2: Both JWT and Better-Auth paths active (dual-read for tokens)
- Phase 3: Deprecate JWT path, all anonymous sessions go through Better-Auth

## Anonymous Session Endpoint Evolution

**Phase 1:**
```
POST /auth/apps/{appId}/anonymous-session
→ Validates app config + domain
→ Signs stateless JWT with INKEEP_ANON_JWT_SECRET
→ Returns { token: "eyJ...", expiresAt: "..." }
```

**Phase 2+ (Better-Auth backed):**
```
POST /auth/apps/{appId}/anonymous-session
→ Validates app config + domain
→ Calls auth.signIn.anonymous() internally (creates user + session)
→ Associates session with appId context
→ Returns { token: "tok_abc123...", expiresAt: "..." }
```

The endpoint URL and response shape stay the same. The widget doesn't know or care whether the token is a JWT or a Better-Auth session token.

## Key Insight: The Interface Contract

The contract between the widget and the API is:
1. Widget calls `/auth/apps/{appId}/anonymous-session` → gets a token
2. Widget sends `Authorization: Bearer <token>` + `X-Inkeep-App-Id: <appId>` on every request
3. API validates the token (however it wants) and extracts an end-user identity
4. Downstream code receives `endUserId` and doesn't care about the backing

This contract is stable across stateless → stateful migration. The widget SDK never needs to change.

## Considerations for Better-Auth Stateful Path

1. **User table pollution:** Each anonymous visitor creates a `user` row. At scale (millions of anonymous visitors), this could be significant. Mitigation: TTL-based cleanup of anonymous users who never convert.

2. **Session table size:** Each anonymous session creates a `session` row. Mitigation: Short expiration (1h) + cleanup job.

3. **Cross-origin challenges:** Better-Auth uses cookies by default. Cross-origin (widget on customer domain → API on api.inkeep.com) requires Bearer token mode (already supported via `bearer()` plugin).

4. **Organization association:** Better-Auth sessions have `activeOrganizationId`. Anonymous users would need to be associated with the customer's org — this is determined by the appId (which maps to a project → tenant).

5. **Account linking:** When an anonymous user later authenticates (via customer JWT), Better-Auth's anonymous plugin supports linking the accounts. This would solve the conversation history continuity problem (Appendix B in the spec).

**Confidence:** INFERRED (design analysis, not verified against running code)
