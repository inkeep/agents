# Current Auth Architecture — Evidence

**Verified:** 2026-03-17 (code-verified via exploration agents)

## Session Management

- **Library:** Better Auth (client + server)
- **Session cookie name:** `better-auth.session_token`
- **Cookie attributes:**
  - `httpOnly: true`
  - `secure: true` (production) / `false` (localhost)
  - `sameSite: 'none'` (production) / `'lax'` (localhost)
  - Domain auto-computed from API baseURL; undefined for localhost
- **Session expiry:** 7 days (604800 seconds)
- **Cookie cache:** Compact strategy, 30-second maxAge

## Client-Side Auth Flow

1. `AuthClientProvider` wraps the app in root layout (`layout.tsx`)
2. `useAuthSession()` hook calls `client.useSession()` — returns `{ user, session, isLoading, isAuthenticated }`
3. Root page (`/page.tsx`) checks auth and redirects:
   - `!user` → `/login`
   - `user` with org → `/{orgId}/projects`
   - `user` without org → `/no-organization`
4. **No server-side route protection** — no `middleware.ts` exists

## Current Route Classification

### Public routes (no auth required)
- `/login` — Login page
- `/forgot-password` — Password reset request
- `/reset-password` — Password reset confirmation
- `/accept-invitation/[invitationId]` — Accept org invitations
- `/device` — Device authorization flow
- `/no-organization` — No org redirect page
- `/oauth/callback` — Nango OAuth redirect (cloud only)
- `/oauth/callback/tools` — Composio OAuth redirect (cloud only)
- `/github/setup-error` — GitHub setup error page
- `/link` — Account linking page

### Protected routes (require auth — currently only client-side)
- `/` — Root redirect (client-side auth check)
- `/[tenantId]/*` — All tenant-scoped routes

### Internal API routes (agents-manage-ui)
- `/api/signoz/*` — SigNoz monitoring
- `/api/data-components/[dataComponentId]/generate-render`
- `/api/artifact-components/[artifactComponentId]/generate-render`

### Static assets
- `/_next/*` — Next.js build assets
- `/assets/*` — Public static assets (in `public/` directory)
- Favicon, manifest, etc.

## API-Side Auth

- Global `sessionContext()` middleware reads session cookie on all requests → sets `user`/`session` in context (or null)
- `manageBearerOrSessionAuth()` enforces auth on `/manage/tenants/*` — returns 401 if no valid session/token
- `requireTenantAccess()` validates user belongs to the requested tenant
- `requireProjectPermission()` checks view/use/edit permissions — returns 404 (not 403) on denial

## Auth Redirect Validation

- `isValidReturnUrl()` in `auth-redirect.ts` prevents open redirects
- Must start with `/`, cannot contain `://` or start with `//`
