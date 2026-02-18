# SPEC: Harden Dev Auto-Login Endpoint

## Problem Statement

The `/api/auth/dev-session` endpoint creates admin sessions in development mode without requiring any credentials. The endpoint is gated by a runtime environment variable (`ENVIRONMENT=development`), which is easy to accidentally misconfigure when deploying. This change moves the auto-login flow server-side and adds a shared-secret requirement so the endpoint cannot be called without proper authorization.

## Goals

1. Replace the client-side `DevAutoLoginProvider` with a Next.js 16 `proxy.ts` that handles dev auto-login server-side
2. Gate the proxy on `NODE_ENV` (a build-time constant in Next.js, tree-shaken in production builds)
3. Require `INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET` on the API endpoint so it cannot be called without the shared secret
4. Improve DX by eliminating the reload flash that the client-side component caused

## Non-Goals

- Changing other `ENVIRONMENT === 'development'` behavior (run auth, eval auth, CORS)
- Changing production auth flows

## Acceptance Criteria

- [ ] `proxy.ts` gates on `NODE_ENV !== 'development'` and short-circuits when session cookie exists
- [ ] `proxy.ts` calls the API endpoint server-to-server with the bypass secret
- [ ] API endpoint returns 401 when bypass secret is missing, wrong, or not configured
- [ ] API endpoint continues to return 404 when `ENVIRONMENT !== 'development'`
- [ ] `DevAutoLoginProvider` component is removed
- [ ] `layout.tsx` no longer wraps children in `DevAutoLoginProvider`
- [ ] All existing dev-session tests pass with the bypass secret requirement
- [ ] New tests cover: missing secret (401), wrong secret (401), secret not configured on server (401)
- [ ] Build succeeds (proxy.ts is recognized by Next.js 16 as `Proxy (Middleware)`)
- [ ] No new lint or typecheck errors introduced

## Technical Design

### proxy.ts (new)
- Location: `agents-manage-ui/src/proxy.ts`
- `NODE_ENV` check (build-time eliminated in prod)
- Cookie-exists check (O(1) short-circuit)
- Server-to-server fetch to API with `Authorization: Bearer <bypass_secret>`
- Forwards `Set-Cookie` header to browser response
- Matcher excludes static assets, images, API routes, monitoring

### API endpoint (modified)
- Validates `Authorization` header against `INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET`
- Returns 401 if secret missing/wrong/not configured
- Existing `ENVIRONMENT === 'development'` gate unchanged (defense in depth)

### Removed
- `agents-manage-ui/src/components/providers/dev-auto-login-provider.tsx` (deleted)
- `DevAutoLoginProvider` import and usage in `layout.tsx`

## Test Cases

1. Authorized request returns 200 with session cookie
2. Missing bypass secret returns 401
3. Wrong bypass secret returns 401
4. Bypass secret not configured on server returns 401
5. Missing dev credentials (username) returns 400
6. User not found returns 400
7. HMAC-SHA-256 cookie signing works correctly
8. Cookie attributes are correct
9. findUserByEmail and createSession called with correct args
10. Non-development environment returns 404
11. Null auth returns 404
