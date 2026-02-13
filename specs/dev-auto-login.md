# Spec: Dev Auto-Login for Manage UI

**Status:** Draft
**Date:** 2026-02-12
**Author:** Edwin / Claude

---

## 1. Problem Statement

In local development, the Manage UI (Next.js on `localhost:3000`) requires a fully authenticated Better Auth session before any page is usable. This means every developer must:

1. Run `pnpm db:auth:init` to create the admin user, org, and SpiceDB tuples
2. Navigate to `http://localhost:3000`
3. Get redirected to `/login`
4. Type their email and password (from `.env`)
5. Click "Sign in"
6. Wait for Better Auth to create a session, set cookies, and redirect

Steps 2-6 repeat every time the session expires (7 days), cookies are cleared, or the dev DB is reset. This is pure friction with zero security value in a local-only environment.

**The Run API does not have this problem.** `runAuth.ts:467-489` already falls back to a `createDevContext()` with test defaults when `ENVIRONMENT === 'development'` and no valid API key is provided.

**The Manage UI has no equivalent bypass.** The auth chain is hard-wired: `sessionContext()` → `sessionAuth()` → `requireTenantAccess()` with no dev fallback at any layer.

---

## 2. Current State: Auth Architecture

### 2.1 Three Separate Auth Systems

| System | Routes | Auth mechanism | Dev fallback? |
|--------|--------|---------------|---------------|
| **Run API** | `/run/*` | JWT → bypass secret → Slack user JWT → DB key → team token | Yes — `createDevContext()` returns test-tenant defaults |
| **Manage API** | `/manage/*` | Session cookie OR Bearer token → bypass secret → session → DB key → Slack user JWT → internal token | Partial — bypass secret sets `userId: 'system'`, but only for Bearer token requests |
| **Manage UI** | `localhost:3000/*` | Better Auth session cookie (cross-origin to `localhost:3002`) | **No** — no fallback at any layer |

### 2.2 The Session Dependency Chain (Why Login Is Required)

When a developer opens `localhost:3000`, this chain executes:

```
1. layout.tsx renders → wraps children in AuthClientProvider
2. page.tsx (home) mounts → calls useAuthSession()
3. useAuthSession() → client.useSession() → GET /api/auth/get-session on localhost:3002
4. No cookie → getSession returns null → user is null
5. page.tsx:51-57 → !user → redirect to /login
```

After the developer manually logs in at `/login`:

```
1. login/page.tsx:89-92 → authClient.signIn.email({ email, password })
2. POST /api/auth/sign-in/email → Better Auth handler on localhost:3002
3. auth.handler() → creates session in DB → returns Response with Set-Cookie
4. Browser stores cookie for localhost:3002 (sameSite: 'none', secure: true, httpOnly: true)
5. Redirect to / → useAuthSession() → GET /api/auth/get-session (now sends cookie)
6. getSession returns { user, session } → page.tsx proceeds to load org/projects
```

### 2.3 Key Files in the Auth Chain

**API side (localhost:3002):**

| File | Role | Relevant lines |
|------|------|---------------|
| `agents-api/src/createApp.ts` | Mounts middleware, auth handler | L89-96: Better Auth handler on `/api/auth/*`; L228+: manage auth routing; L293-306: test env bypass |
| `packages/agents-core/src/auth/auth.ts` | Better Auth config | L190-387: createAuth() — session config, cookie attrs, org plugin, trusted origins |
| `packages/agents-core/src/auth/init.ts` | Bootstrap script | Creates org (upsert), user (signUpEmail), member row, SpiceDB tuples |
| `agents-api/src/middleware/sessionAuth.ts` | Session resolution | L42-71: sessionContext() — calls `auth.api.getSession({ headers })`, sets `user`/`session` on ctx; L10-36: sessionAuth() — throws 401 if no user |
| `agents-api/src/middleware/manageAuth.ts` | Bearer token auth | L46-57: bypass secret → `userId: 'system'`; L61-100: Better Auth session; L104-116: DB API key; L120-149: Slack user JWT; L150+: internal service token |
| `agents-api/src/middleware/tenantAccess.ts` | Org membership check | L41-46: `system` user → OWNER on all tenants; L63-72: session users → query member table |
| `agents-api/src/middleware/runAuth.ts` | Run API auth | L467-489: dev fallback with `createDevContext()` |
| `agents-api/src/env.ts` | API env schema | L54-67: `INKEEP_AGENTS_MANAGE_UI_USERNAME`, `INKEEP_AGENTS_MANAGE_UI_PASSWORD` already defined |

**UI side (localhost:3000):**

| File | Role | Relevant lines |
|------|------|---------------|
| `agents-manage-ui/src/app/layout.tsx` | Root layout | L70-106: Builds `runtimeConfig` from server env vars, wraps in RuntimeConfigProvider |
| `agents-manage-ui/src/contexts/runtime-config.tsx` | Config context | Passes server-side env vars to client components |
| `agents-manage-ui/src/lib/runtime-config/types.ts` | Config type | RuntimeConfig interface — defines what's exposed to client |
| `agents-manage-ui/src/contexts/auth-client.tsx` | Auth client | L17-44: `createAuthClient()` with `baseURL` from RuntimeConfig, `credentials: 'include'` |
| `agents-manage-ui/src/hooks/use-auth.ts` | Session hook | L3-15: `useAuthSession()` — wraps `client.useSession()`, returns `{ user, session, isLoading, isAuthenticated }` |
| `agents-manage-ui/src/hooks/use-is-org-admin.ts` | Admin check | L9-39: Calls `authClient.organization.getActiveMember()`, checks role |
| `agents-manage-ui/src/app/page.tsx` | Home routing | L51-57: No user → redirect to `/login`; L70: `getUserOrganizations(user.id)`; L91-99: Redirect to `/{orgId}/projects` |
| `agents-manage-ui/src/app/login/page.tsx` | Login form | L89-92: `authClient.signIn.email()`; L30-40: Redirect if already authenticated |
| `agents-manage-ui/src/lib/api/api-config.ts` | Server Action fetch | L36-61: Forwards Better Auth cookies; L67-69: Injects `INKEEP_AGENTS_API_BYPASS_SECRET` as Bearer token |

### 2.4 What init.ts Creates

`pnpm db:auth:init` runs `packages/agents-core/src/auth/init.ts` which:

1. **Writes SpiceDB schema** (`writeSpiceDbSchema()`) — must happen first
2. **Upserts organization** — `upsertOrganization(dbClient)({ organizationId: TENANT_ID, name: TENANT_ID, slug: TENANT_ID })` — creates `organization` row if not exists
3. **Creates admin user** — `auth.api.signUpEmail({ body: { email, password, name } })` — creates `user` + `account` rows via Better Auth
4. **Adds user to org** — `addUserToOrganization(dbClient)({ userId, organizationId: TENANT_ID, role: 'admin' })` — creates `member` row
5. **Syncs to SpiceDB** — `syncOrgMemberToSpiceDb({ tenantId, userId, role: 'admin', action: 'add' })` — creates authorization tuple

All operations are idempotent (upsert semantics, existence checks before inserts).

### 2.5 Better Auth Session Config

From `auth.ts:239-247`:

| Setting | Value | Effect |
|---------|-------|--------|
| `session.expiresIn` | `604800` (7 days) | Session TTL |
| `session.updateAge` | `86400` (1 day) | Auto-refresh after 1 day |
| `session.cookieCache.enabled` | `true` | Avoids DB lookup on every request (cookie-based only) |
| `session.cookieCache.maxAge` | `300` (5 min) | Cache TTL |
| Cookie `sameSite` | `'none'` | Allows cross-origin |
| Cookie `secure` | `true` | HTTPS only (browsers relax for localhost) |
| Cookie `httpOnly` | `true` | Not accessible via JS |
| Cookie domain | `undefined` for localhost | Scoped to exact origin (`localhost:3002`) |

### 2.6 CORS Config

From `auth.ts:264-270`, trusted origins include `http://localhost:3000` and `http://localhost:3002`.

From `createApp.ts:86`, `/api/auth/*` routes use `authCorsConfig` which allows the UI origin.

---

## 3. Options Considered

### 3.1 Option A: Better Auth Anonymous Plugin + Org Seeding (Rejected)

**Idea:** Enable the anonymous plugin in dev mode. On first page load, auto-create an anonymous user, auto-assign to the dev org, auto-sync SpiceDB.

**Why rejected (critical flaws found during deep evaluation):**

- **Identity instability:** Anonymous plugin creates a NEW `user` row every sign-in. When the 7-day session expires and the DevAuthProvider re-triggers anonymous sign-in, the new anonymous user has no org membership, no SpiceDB tuples, and no access to anything the previous anonymous user created.
- **Double-sign-in guard:** Better Auth's anonymous plugin rejects `POST /sign-in/anonymous` if an anonymous session cookie already exists (but is expired/stale). The client must first clear the stale cookie or call `/delete-anonymous-user` — adding complexity.
- **SpiceDB tuple orphaning:** When a new anonymous user replaces an old one, the old user's SpiceDB tuples (`organization:default#admin@user:old-anon-id`) persist but point to a deleted user. No automatic cleanup.
- **300 member org limit:** Better Auth's org plugin has `membershipLimit: 300` (configured in `auth.ts:286`). Over time, orphaned anonymous user memberships accumulate toward this limit.
- **Data ownership breakage:** `credentialReferences` has a `userId` column with unique constraint on `(toolId, userId)`. A new anonymous user can't access the old user's credential bindings.

### 3.2 Option B: Programmatic signIn.email() on Server Startup (Rejected)

**Idea:** On API server boot in dev mode, call `auth.api.signInEmail()` programmatically to create a session, then somehow pass the session to the UI.

**Why rejected:**

- `auth.api.signInEmail()` creates a session in the DB but does NOT set cookies — only `auth.handler()` returns a Response with `Set-Cookie` headers.
- Even if we extracted the session token, we can't set a cookie on `localhost:3002` from the server side. The cookie must be set via an HTTP response to the browser.
- This approach fundamentally misunderstands where the cookie needs to originate from.

### 3.3 Option C: Mock/Override useAuthSession() (Rejected)

**Idea:** In dev mode, wrap `useAuthSession()` to return a hardcoded user/session object, bypassing Better Auth entirely.

**Why rejected:**

- **Server-side auth still required.** Every Server Action in the Manage UI forwards Better Auth cookies to the API (`api-config.ts:36-61`). Without a real session cookie, Server Actions would fail with 401.
- **15+ components consume session data.** `user.id`, `user.email`, `session.activeOrganizationId` are used throughout. A mock session would need to be fully consistent with what the API expects.
- **`useIsOrgAdmin()`** calls `authClient.organization.getActiveMember()` which hits the API. A mock session wouldn't satisfy this without also mocking the org API call.
- **Two sources of truth.** Mock session on client vs real (or missing) session on server creates subtle inconsistencies.

### 3.4 Option D: Deterministic Dev Auto-Login via API Endpoint (Selected)

**Idea:** Add a dev-only `POST /api/auth/dev-session` endpoint on the API that reads the admin credentials from its own env vars, delegates to `auth.handler()` to produce a real sign-in response with `Set-Cookie`, and returns it to the client. A `DevAutoLogin` provider on the UI detects missing session in dev mode and calls this endpoint automatically.

**Why selected:**

- **Single source of truth:** Credentials are `INKEEP_AGENTS_MANAGE_UI_USERNAME` and `INKEEP_AGENTS_MANAGE_UI_PASSWORD` on the API server — the same env vars `init.ts` uses. Never exposed to the client.
- **Real session:** `auth.handler()` creates a real Better Auth session with all the right cookies, org membership, and SpiceDB state. Every downstream component (`useAuthSession`, `useIsOrgAdmin`, Server Actions, `requireTenantAccess`) works identically to manual login.
- **Identity stability:** Same user every time. Session expires? Auto-login creates a new session for the same user. No orphaned users, no orphaned SpiceDB tuples, no membership accumulation.
- **Zero credential exposure:** The `/api/auth/dev-session` endpoint reads credentials server-side and constructs the sign-in request internally. The client sends a single `fetch()` with no body.
- **Minimal changes:** ~50 lines across 3-4 files.
- **Double-gated safety:** `ENVIRONMENT === 'development'` on the API + `NODE_ENV === 'development'` on the UI. The endpoint literally doesn't exist in production (not registered in the router).

---

## 4. Working Plan: Detailed Design

### 4.1 API: Dev Session Endpoint

**File:** `agents-api/src/createApp.ts`
**Location:** Inside `createAgentsHono()`, after CORS registration for `/api/auth/*` (L90) but before the catch-all auth handler (L93-95).

```typescript
// Dev-only: auto-login endpoint — no credentials leave the server
if (auth && env.ENVIRONMENT === 'development') {
  app.post('/api/auth/dev-session', async (c) => {
    const email = env.INKEEP_AGENTS_MANAGE_UI_USERNAME;
    const password = env.INKEEP_AGENTS_MANAGE_UI_PASSWORD;

    if (!email || !password) {
      return c.json(
        { error: 'Dev credentials not configured. Run pnpm db:auth:init first.' },
        400
      );
    }

    // Construct a synthetic sign-in request and delegate to Better Auth's handler.
    // auth.handler() returns a full Response with Set-Cookie headers.
    const signInUrl = new URL('/api/auth/sign-in/email', c.req.url);
    const syntheticRequest = new Request(signInUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: c.req.header('Origin') || 'http://localhost:3000',
      },
      body: JSON.stringify({ email, password }),
    });

    return auth.handler(syntheticRequest);
  });
}
```

**Key details:**

- **Route:** `POST /api/auth/dev-session` — falls under the existing `/api/auth/*` CORS middleware (`authCorsConfig`), so cross-origin requests from `localhost:3000` are handled automatically.
- **Guard:** `env.ENVIRONMENT === 'development'` — the route is not registered at all in production/test. This is a runtime decision at server startup (the `if` block runs when `createAgentsHono()` is called), not a per-request check.
- **Also requires:** `auth` to be non-null (Better Auth is configured). If auth is disabled (no `BETTER_AUTH_SECRET`), the endpoint doesn't exist.
- **Registration order matters:** Hono uses first-match-wins routing. This route MUST be registered BEFORE the catch-all `app.on(['POST', 'GET'], '/api/auth/*', ...)` handler (L93-95). If registered after, the catch-all intercepts the request and passes it to `auth.handler()`, which returns 404 (no Better Auth route at `/dev-session`). The code block in createApp.ts should include a comment noting this ordering dependency.
- **Mechanism:** Constructs a `Request` object that looks exactly like a normal `POST /api/auth/sign-in/email` request, then passes it through `auth.handler()`. Better Auth processes it as a standard sign-in: validates credentials, creates/refreshes session, returns `Response` with `Set-Cookie`.
- **CSRF:** The synthetic request has no `Cookie` header. Better Auth's CSRF protection is cookie-dependent — it only validates Origin/Referer when cookies are present. Since the synthetic request has no cookies, CSRF validation is skipped entirely. Credential validation (email + password against DB) still runs normally.
- **Error case:** If env vars are missing, returns 400 with an actionable error message pointing to `pnpm db:auth:init`.

### 4.2 UI: DevAutoLogin Provider

**File:** New file `agents-manage-ui/src/components/providers/dev-auto-login-provider.tsx`

```typescript
'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';

export function DevAutoLoginProvider({ children }: { children: React.ReactNode }) {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const { isAuthenticated, isLoading } = useAuthSession();
  const attemptedRef = useRef(false);

  // In production, children render immediately (no gate).
  // In dev, children are gated until auto-login resolves.
  // This prevents child useEffects (e.g. page.tsx redirect to /login)
  // from firing before the auto-login fetch completes.
  const [ready, setReady] = useState(process.env.NODE_ENV !== 'development');

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Already authenticated — no auto-login needed
    if (isAuthenticated) {
      setReady(true);
      return;
    }

    // Still checking session — wait
    if (isLoading) return;

    // Only attempt once per mount
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    fetch(`${PUBLIC_INKEEP_AGENTS_API_URL}/api/auth/dev-session`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => {
        if (res.ok) {
          // Cookie is now set. Reload to let useSession() pick it up.
          window.location.reload();
        } else {
          // Auto-login failed (init not run, or credentials wrong).
          // Fall through to normal login page.
          console.warn(
            '[DevAutoLogin] Auto-login failed. Run `pnpm db:auth:init` to set up dev credentials.'
          );
          setReady(true);
        }
      })
      .catch(() => {
        // Network error (API not running). Fall through to login.
        setReady(true);
      });
  }, [isLoading, isAuthenticated, PUBLIC_INKEEP_AGENTS_API_URL]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
```

**Key details:**

- **Guard 1:** `process.env.NODE_ENV !== 'development'` — tree-shaken in production builds. The entire component is a no-op in prod.
- **Guard 2:** `isAuthenticated` — if a valid session already exists, mark ready immediately and render children.
- **Guard 3:** `isLoading` — wait for Better Auth's session check to complete before attempting auto-login.
- **Rendering gate:** In dev mode, children are NOT rendered until auto-login either succeeds (triggers `window.location.reload()`) or fails (sets `ready = true`, falls through to normal login). This prevents child components (like `page.tsx`) from mounting and redirecting to `/login` before the auto-login has a chance to complete. This is necessary because **React fires child `useEffect` hooks before parent `useEffect` hooks** — without the gate, `page.tsx`'s redirect would fire before `DevAutoLoginProvider`'s fetch.
- **Mechanism:** `fetch()` with `credentials: 'include'` sends the request to `localhost:3002/api/auth/dev-session`. The response includes `Set-Cookie`. Browser stores it. Then `window.location.reload()` triggers `useSession()` to pick up the new cookie.
- **Failure mode:** If auto-login fails (API not running, init not run, credentials wrong), `ready` is set to `true` and children render normally — the developer falls through to the normal `/login` page. This is a graceful degradation, not a breaking change.
- **`window.location.reload()`:** This is the simplest way to force Better Auth's `useSession()` to re-check. Better Auth's React client uses Nanostores internally — there's no public API to programmatically trigger a session re-fetch. A full page reload guarantees the session is picked up. This happens at most once per dev session (typically on first page load after DB reset or cookie expiry).

### 4.3 UI: Mount the Provider

**File:** `agents-manage-ui/src/app/layout.tsx`

Add `DevAutoLoginProvider` inside `AuthClientProvider` (it needs the auth client context to exist):

```diff
 <AuthClientProvider>
+  <DevAutoLoginProvider>
     {children}
     <Toaster closeButton />
+  </DevAutoLoginProvider>
 </AuthClientProvider>
```

The provider must be inside `AuthClientProvider` (needs `useAuthSession` → `useAuthClient`) and inside `RuntimeConfigProvider` (needs `useRuntimeConfig` for API URL).

### 4.4 Files Changed Summary

| File | Change | Lines |
|------|--------|-------|
| `agents-api/src/createApp.ts` | Add `POST /api/auth/dev-session` route | ~15 |
| `agents-manage-ui/src/components/providers/dev-auto-login-provider.tsx` | New file — DevAutoLoginProvider (with rendering gate) | ~50 |
| `agents-manage-ui/src/app/layout.tsx` | Wrap children with DevAutoLoginProvider | ~2 |

**Total: ~67 lines across 3 files. No schema changes. No env var changes. No config changes.**

### 4.5 Documentation and Supplemental Changes

Surgical edits to set correct expectations about auto-login in every place a developer encounters "open localhost:3000."

**Docs site (`agents-docs/content/`):**

| File | Location | Change |
|------|----------|--------|
| `deployment/(docker)/authentication.mdx` | Step 4 (L95-99) | Update "Sign in" step: note auto-login in dev, manual sign-in in production |
| `deployment/(docker)/docker-local.mdx` | L99 | Append "You'll be automatically signed in as the admin user configured above." |
| `community/contributing/overview.mdx` | Step 4 (L59-61) | Change to "You'll be signed in automatically — start building agents right away." |
| `troubleshooting.mdx` | After L88 | New section: "Authentication Issues (Local Development)" — 3 bullet causes (init not run, API not running, credentials missing) with fixes |

**Supplemental files:**

| File | Location | Change |
|------|----------|--------|
| `.env.example` | L67-69 | Add 2 comment lines: what the auth vars are for, note auto-login in dev |
| `.env.docker.example` | L26-28 | Clarify comment: "creates the initial admin user during setup" (no auto-login mention — production file) |
| `packages/create-agents/README.md` | L57 | Append "You'll be signed in automatically." (propagates to quickstart docs via `<Snippet>`) |

**Not changed (reviewed and excluded):** Root `README.md` (no setup content), `agents-manage-ui/README.md` (boilerplate, not a setup guide), `CONTRIBUTING.md` (redirects to docs), `agents-cli/README.md` and `SETUP.md` (no auth content), `AGENTS.md` (architecture, not user-facing).

---

## 5. How It Works End-to-End

### 5.1 Happy Path (First Load After DB Init)

```
Developer runs: pnpm db:auth:init
  → Creates org "default", user "dev@example.com", member row, SpiceDB tuples

Developer opens: http://localhost:3000
  → layout.tsx renders → RuntimeConfigProvider → AuthClientProvider → DevAutoLoginProvider

DevAutoLoginProvider mounts:
  → useAuthSession() returns { isLoading: true }
  → Effect skips (isLoading)

useSession() resolves:
  → GET http://localhost:3002/api/auth/get-session (no cookie)
  → Returns null → isAuthenticated: false, isLoading: false

DevAutoLoginProvider effect re-runs:
  → NODE_ENV === 'development' ✓
  → !isLoading ✓
  → !isAuthenticated ✓
  → !attemptedRef.current ✓
  → Sets attemptedRef.current = true

  → fetch('http://localhost:3002/api/auth/dev-session', { method: 'POST', credentials: 'include' })
  → API receives request
  → env.ENVIRONMENT === 'development' → route exists
  → Reads INKEEP_AGENTS_MANAGE_UI_USERNAME and PASSWORD from env
  → Constructs synthetic Request to /api/auth/sign-in/email
  → auth.handler(syntheticRequest) processes it:
    → Validates credentials against user table
    → Creates session row in DB
    → databaseHooks.session.create.before fires:
      → getInitialOrganization() returns "default" org
      → Sets activeOrganizationId on session
    → Returns Response with Set-Cookie header

  → Browser receives Response:
    → Stores cookie: better-auth.session_token=<token> (origin: localhost:3002)

  → res.ok → window.location.reload()

Page reloads:
  → DevAutoLoginProvider mounts again (new React tree)
  → useSession() → GET /api/auth/get-session (sends cookie this time)
  → Returns { user: { id, email, ... }, session: { activeOrganizationId: 'default', ... } }
  → isAuthenticated: true → DevAutoLoginProvider effect skips

page.tsx (home) loads:
  → user exists → getUserOrganizations(user.id) → finds "default" org
  → session.activeOrganizationId = 'default'
  → Redirect to /default/projects
```

### 5.2 Session Expiry (After 7 Days)

```
Developer opens localhost:3000 after 7 days:
  → Cookie exists but session expired in DB
  → useSession() → getSession returns null
  → isAuthenticated: false

DevAutoLoginProvider:
  → Detects !isAuthenticated
  → fetch /api/auth/dev-session → sign-in creates NEW session for SAME user
  → Set-Cookie with new session token
  → window.location.reload()
  → Session is valid → proceeds normally

Key: Same user identity. Same org membership. Same SpiceDB tuples. No data loss.
```

### 5.3 Init Not Run (Missing User)

```
Developer opens localhost:3000 without running pnpm db:auth:init:

Two possible failure points:

A) Env vars not set:
  → API route reads env.INKEEP_AGENTS_MANAGE_UI_USERNAME → undefined
  → Returns 400: "Dev credentials not configured. Run pnpm db:auth:init first."
  → DevAutoLoginProvider: res.ok is false → console.warn, falls through
  → page.tsx: !user → redirect to /login
  → Developer sees login form, realizes they need to run init

B) Env vars set but user doesn't exist in DB:
  → API route constructs synthetic sign-in request
  → auth.handler() → Better Auth tries to find user by email → not found
  → Returns 401 or error response
  → DevAutoLoginProvider: res.ok is false → console.warn, falls through
  → Developer sees login form
```

### 5.4 Production (Endpoint Doesn't Exist)

```
Production deployment:
  → env.ENVIRONMENT !== 'development'
  → The `if (auth && env.ENVIRONMENT === 'development')` block never executes
  → POST /api/auth/dev-session is not registered in the Hono router
  → If someone manually POSTs to it → 404

UI in production:
  → process.env.NODE_ENV !== 'development' → useEffect body returns immediately
  → DevAutoLoginProvider is a no-op
  → (In practice, tree-shaking may eliminate the dead code entirely)
```

---

## 6. Constraints and Invariants

### 6.1 Cookie Domain Constraint

- `extractCookieDomain('http://localhost:3002')` returns `undefined` (`auth.ts:128-130`)
- This means cookies have no `domain` attribute → scoped to exact origin `localhost:3002`
- The UI on `localhost:3000` CANNOT set cookies for `localhost:3002` — not via Server Actions, not via any server-side mechanism
- **Therefore, auto-login MUST happen via a client-side fetch to `localhost:3002`** (which is exactly what the dev-session endpoint + DevAutoLoginProvider does)

### 6.2 auth.api vs auth.handler

- `auth.api.signInEmail()` — creates session in DB, returns `{ user, session }` object. **Does NOT set cookies.**
- `auth.handler(request)` — processes a `Request`, returns a `Response` with `Set-Cookie` headers. **Sets cookies.**
- The dev-session endpoint uses `auth.handler()` because we need the cookie.

### 6.3 What `auth.handler()` Does for Sign-In

When processing `POST /api/auth/sign-in/email`:

1. Extracts `{ email, password }` from request body
2. Queries `user` table by email
3. Validates password hash
4. Creates `session` row in DB (calls `databaseHooks.session.create.before` which sets `activeOrganizationId`)
5. Signs session token with HMAC
6. Returns `Response` with:
   - Body: `{ user, session, redirect: false }`
   - Headers: `Set-Cookie: better-auth.session_token=<signed-token>; Path=/; SameSite=None; Secure; HttpOnly`

### 6.4 CORS Coverage

The dev-session route is under `/api/auth/*`, which is covered by:

```typescript
// createApp.ts:90
app.use('/api/auth/*', cors(authCorsConfig));
```

`authCorsConfig` is defined in `agents-api/src/middleware/cors.ts:83-90`:

```typescript
export const authCorsConfig: CorsOptions = {
  origin: originHandler,           // Dynamic — allows any localhost origin in development
  allowHeaders: ['content-type', 'Content-Type', 'authorization', 'Authorization', 'User-Agent'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,               // CRITICAL — required for cross-origin Set-Cookie
};
```

The `originHandler` calls `isOriginAllowed()` which accepts any `localhost` or `127.0.0.1` origin in development. Combined with `credentials: true`, this produces the required `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Origin: http://localhost:3000` (specific origin, not `*`) response headers that allow the browser to store the `Set-Cookie`.

**Cross-origin cookie on localhost:** Modern browsers (Chrome, Firefox, Safari) treat localhost as a "potentially trustworthy" origin. `SameSite=None; Secure` cookies over HTTP are accepted on localhost as a special exception (Chromium implemented this in 2020). The spec's cookie attributes (`sameSite: 'none', secure: true, httpOnly: true`) work correctly on localhost without HTTPS.

### 6.5 React useEffect Order and the Rendering Gate

React fires `useEffect` hooks **child-first, then parent** during the commit phase (depth-first traversal). This means:

```
1. HomeContent's useEffect fires FIRST  → router.push('/login')
2. DevAutoLoginProvider's useEffect fires SECOND → fetch('/api/auth/dev-session')
```

Without mitigation, page.tsx's redirect to `/login` would execute before DevAutoLoginProvider's auto-login fetch even starts. While the fetch would still complete in the background (Next.js `router.push` is async), the developer would see a flash of the login page before being redirected back.

**Solution: The rendering gate.** DevAutoLoginProvider gates children behind a `ready` state:

```typescript
const [ready, setReady] = useState(process.env.NODE_ENV !== 'development');
// ...
if (!ready) return <LoadingSpinner />;
return <>{children}</>;
```

When `ready` is `false`, children (including `page.tsx`) are **not mounted at all**. Their `useEffect` hooks never fire. The developer sees a spinner while the auto-login fetch runs. When the fetch completes:
- **Success:** `window.location.reload()` — page reloads, session exists, children mount and proceed normally.
- **Failure:** `setReady(true)` — children mount, page.tsx detects no session, redirects to `/login` as usual.

This eliminates the race condition entirely. The spinner is visible for 50-200ms (the time for the fetch + DB sign-in on localhost).

### 6.6 Session Accumulation

Better Auth creates a NEW session row on every sign-in (no reuse of existing sessions). Each auto-login creates a new `session` row in the DB. Old sessions are not proactively deleted — they are cleaned up lazily when someone tries to use an expired session token (the validation code deletes the row on expiry detection).

In practice, this means the dev user accumulates ~1 session row per 7 days (or per DB reset, whichever comes first). This is negligible for a dev environment. No cleanup mechanism is needed.

### 6.7 Prerequisite: `pnpm db:auth:init` Must Still Run

The dev-session endpoint calls `auth.handler()` which validates credentials against the DB. If the user hasn't been created via `pnpm db:auth:init`, sign-in will fail. The auto-login is not a replacement for init — it's a replacement for the manual login step.

**Future enhancement (out of scope for this spec):** The dev-session endpoint could check if the user exists and call `auth.api.signUpEmail()` + org setup if not, effectively inlining `init.ts`. This would eliminate the `pnpm db:auth:init` step entirely. However, init.ts also handles SpiceDB schema writing and other setup that's better kept as an explicit step.

---

## 7. Security Analysis

### 7.1 Production Safety

| Protection | Mechanism |
|-----------|-----------|
| API route doesn't exist in prod | `if (auth && env.ENVIRONMENT === 'development')` — route not registered |
| UI effect is dead code in prod | `if (process.env.NODE_ENV !== 'development') return` — tree-shaken |
| No credentials on the client | Credentials read from API server's own env vars; client sends empty POST |
| No new env vars | Uses existing `INKEEP_AGENTS_MANAGE_UI_USERNAME` / `PASSWORD` |
| No config changes | No changes to CORS, trusted origins, cookie policy, or session config |

### 7.2 Threat Model

**Q: What if someone deploys this to a public server with `ENVIRONMENT=development`?**
A: They'd have bigger problems — the Run API already has wide-open dev fallbacks (`createDevContext`). The dev-session endpoint doesn't make this worse.

**Q: Could a malicious browser extension call `/api/auth/dev-session`?**
A: Only if `ENVIRONMENT === 'development'` on the API server, which means it's a local dev machine. The endpoint creates a session for the dev user — the same session the developer would get by typing their password. No privilege escalation.

**Q: Does this expose credentials in network traffic?**
A: No. The client sends `POST /api/auth/dev-session` with no body. The server reads credentials from env vars internally. The response is the same `Set-Cookie` response that normal sign-in produces.

---

## 8. Deployment Impact Assessment

### 8.1 Verdict: No Impact on Self-Hosting or Production Deployments

The dev-session endpoint is gated by `ENVIRONMENT === 'development'` — it is not registered in the Hono router when `ENVIRONMENT=production`. Every self-hosting pathway explicitly sets `ENVIRONMENT=production`:

| Deployment | Where ENVIRONMENT is set | Value |
|---|---|---|
| **Docker Compose (local dev)** | `docker-local.mdx` | `development` |
| **Docker Compose (production)** | `.env.docker.example` + cloud VM guides | `production` |
| **Vercel** | Dashboard environment variables | `production` |
| **AWS EC2** | Deployment guide instructions | `production` |
| **Azure VM** | Deployment guide instructions | `production` |
| **GCP** | Deployment guide instructions | `production` |
| **Hetzner** | Deployment guide instructions | `production` |
| **`create-agents` CLI** | Generated `.env` | `development` (local dev only) |

### 8.2 Why There's Zero Risk

1. **The endpoint doesn't exist in production.** The dev-session route is conditionally registered inside an `if (env.ENVIRONMENT === 'development')` block. When `ENVIRONMENT=production`, the route handler is never mounted — a request to `/api/auth/dev-session` falls through to the Better Auth catch-all and returns 404.

2. **All security-sensitive gates use `ENVIRONMENT`, not `NODE_ENV`.** Every location where auth behavior branches in the codebase uses the `ENVIRONMENT` env var:
   - `createApp.ts:230` — test environment skips manage auth
   - `createApp.ts:293-303` — test environment grants OWNER defaults
   - `runAuth.ts:467` — development/test falls back to `createDevContext()`
   - `evalsAuth.ts` — development/test bypasses eval auth
   - `projectAccess.ts`, `requirePermission.ts` — development/test bypasses

   The dev-session endpoint follows the same gating pattern used by every other dev bypass in the codebase.

3. **Docker migration container runs `pnpm db:auth:init`.** The bootstrap script that creates the org/user/member rows already runs in Docker deployments. Production users set real credentials via `INKEEP_AGENTS_MANAGE_UI_USERNAME` and `INKEEP_AGENTS_MANAGE_UI_PASSWORD` in `.env.docker`. The dev-session endpoint reads these same env vars — it doesn't introduce new configuration.

4. **No new env vars needed.** The endpoint reuses `INKEEP_AGENTS_MANAGE_UI_USERNAME` and `INKEEP_AGENTS_MANAGE_UI_PASSWORD`, which already exist in `agents-api/src/env.ts:54-67` and are documented in `.env.docker.example`.

### 8.3 Changes Needed to Self-Hosting Artifacts

| Artifact | Changes needed |
|---|---|
| **Code** | None — endpoint is development-only, invisible in production |
| **Documentation** | None — all 8 deployment guides in `agents-docs/content/deployment/(docker)/` set `ENVIRONMENT=production`; dev-session is invisible |
| **Docker artifacts** | None — `.env.docker.example`, `docker-compose.yml`, migration container unaffected |
| **Vercel config** | None — `ENVIRONMENT=production` in dashboard |
| **CLI scaffolding** | None — `create-agents` already sets `ENVIRONMENT=development` for local dev; dev auto-login will "just work" for scaffolded projects |

### 8.4 Bonus: New Projects Get Auto-Login for Free

The `create-agents` CLI generates `.env` with `ENVIRONMENT=development` and includes `INKEEP_AGENTS_MANAGE_UI_USERNAME`/`PASSWORD`. Once this feature ships, new developers who scaffold a project will automatically get dev auto-login with no additional setup beyond `pnpm db:auth:init`.

---

## 9. What Doesn't Change

- **Production auth is untouched.** No changes to sessionAuth, manageAuth, tenantAccess, or any auth middleware.
- **init.ts still required.** The dev-session endpoint depends on the user existing in the DB.
- **Session expiry behavior is unchanged.** Sessions still expire after 7 days. The only difference is that re-authentication is automatic instead of manual.
- **All downstream components work identically.** `useAuthSession()`, `useIsOrgAdmin()`, Server Actions, `requireTenantAccess()` — everything sees a real Better Auth session with real org membership.
- **No env var changes.** Both `INKEEP_AGENTS_MANAGE_UI_USERNAME` and `INKEEP_AGENTS_MANAGE_UI_PASSWORD` already exist in the API's env schema (`env.ts:54-67`).

---

## 10. Open Questions

### 10.1 ~~Login Page Flash~~ (Resolved)

~~Should the DevAutoLoginProvider gate children rendering?~~ **Yes.** The rendering gate is now part of the core design (not optional), because React's child-first `useEffect` execution order means page.tsx's redirect would fire before the auto-login fetch without it. See Section 6.5.

### 10.2 Inline init.ts Logic (Future Enhancement)

Should the dev-session endpoint also handle user creation (inlining init.ts) so developers never need to run `pnpm db:auth:init`?

- **Pro:** Eliminates the last manual setup step.
- **Con:** init.ts does more than user creation (SpiceDB schema, org setup). Inlining all of it into a route handler is scope creep and mixes concerns.
- **Con:** init.ts is idempotent and only runs once. It's not that burdensome.

**Recommendation:** Out of scope. Keep init.ts as the explicit setup step. The auto-login eliminates the repetitive pain (typing credentials every time), not the one-time setup.

### 10.3 Signaling Mechanism After Cookie Set

Currently using `window.location.reload()` to force `useSession()` to pick up the new cookie. Alternatives:

- **`window.location.reload()`** — works, simple, ~100ms delay. Currently recommended.
- **Better Auth's `$fetch` refetch:** The `useSession()` hook in Better Auth uses a Nanostore. We could try `authClient.$fetch('/api/auth/get-session')` after the dev-session call to trigger a re-check without reload. Depends on Better Auth internals that may change.
- **Custom event / state:** Use a React state to re-render after the cookie is set, triggering `useSession()` to re-fire. Less reliable than reload because `useSession()` may cache the previous null result.

**Recommendation:** Use `window.location.reload()`. It's reliable, simple, and the performance cost (one extra page load in dev) is negligible.

---

## 11. Testing Plan

### 11.1 Manual Verification

1. **Happy path:** Run `pnpm db:auth:init`, start dev, open `localhost:3000` → should auto-login and redirect to dashboard without showing login form.
2. **Session expiry:** Delete session row from DB, reload → should auto-login again seamlessly.
3. **Init not run:** Start fresh DB, open `localhost:3000` → should fall through to login page with console warning.
4. **API not running:** Start only the UI, open `localhost:3000` → should fall through to login page.
5. **Production build:** Build with `NODE_ENV=production`, verify dev-session endpoint returns 404 and DevAutoLoginProvider is inert.

### 11.2 Automated Testing

- **API test:** Verify `POST /api/auth/dev-session` returns 200 with `Set-Cookie` when `ENVIRONMENT=development` and credentials are configured.
- **API test:** Verify `POST /api/auth/dev-session` returns 400 when credentials are not configured.
- **API test:** Verify `POST /api/auth/dev-session` returns 404 when `ENVIRONMENT !== development`.

---

## 12. Appendix: Why the Run API Doesn't Need This

`agents-api/src/middleware/runAuth.ts:467-489`:

```typescript
if (isDev) {
  const attempt = await authenticateRequest(reqData);
  if (attempt.authResult) {
    c.set('executionContext', buildExecutionContext(attempt.authResult, reqData));
  } else {
    // Falls back to createDevContext with test-tenant, test-project, test-agent
    c.set('executionContext', buildExecutionContext(createDevContext(reqData), reqData));
  }
  await next();
  return;
}
```

The Run API creates a synthetic execution context when no auth is provided in dev. It doesn't need a real user, session, or org membership — just a `tenantId`, `projectId`, and `agentId` for request routing.

The Manage API can't do this because it needs a real user ID for:
- Org membership queries (`getUserOrganizationsFromDb`)
- SpiceDB permission checks (`canUseProjectStrict`)
- Audit trails (`credentialReferences.userId`, `credentialReferences.createdBy`)
- Server Action cookie forwarding (the cookies ARE the auth — Server Actions forward them to the API)
