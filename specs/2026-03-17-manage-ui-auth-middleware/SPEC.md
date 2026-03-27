# Manage UI Auth Middleware — Spec

**Status:** Draft
**Owner(s):** andrew
**Last updated:** 2026-03-17
**Links:**
- Evidence: `./evidence/` (spec-local findings)

---

## 1) Problem statement
- **Who is affected:** All users of the agents-manage-ui (self-hosted and cloud deployments)
- **What pain / job-to-be-done:** Unauthenticated users can view page shells, navigation structure, sidebar items, and static content by deep-linking to any route. While no sensitive *data* leaks (API calls return 401), the UI structure itself is exposed — page layouts, feature names, navigation hierarchy, and static copy are visible.
- **Why now:** Discovered during routine testing that browsing to `/default/work-apps` in a fresh browser (no cookies) renders the full page shell including sidebar, tabs, and static content. The only auth gate is a client-side redirect on the root `/` page, which deep links bypass entirely.
- **Current workaround(s):** API-side auth prevents data leakage, but there is no workaround for page shell exposure. Client-side `useAuthSession()` checks exist on some pages but are inconsistent and always expose the initial render.

## 2) Goals
- **G1:** Prevent unauthenticated users from seeing any protected page content (including page shells, navigation, and static text) by redirecting to `/login` server-side before the page renders.
- **G2:** Preserve `returnUrl` so users land on their intended page after login.
- **G3:** Zero impact on authenticated users — no extra latency, no flash of login page.

## 3) Non-goals
- **NG1:** Role-based or permission-based route gating in middleware (API handles this).
- **NG2:** Session validation against the API in middleware (cookie presence check is sufficient; the API validates the session on data fetch).
- **NG3:** Protecting API-side routes (already handled by `manageBearerOrSessionAuth()`).

## 4) Personas / consumers
- **P1:** Unauthenticated visitor — should be redirected to `/login` immediately, never sees protected page content.
- **P2:** Authenticated user — no change to current experience; middleware passes through transparently.
- **P3:** Self-hosted operator — middleware must work without cloud-specific features.

## 5) User journeys

### Unauthenticated user deep-links to a protected page
1. User navigates to `https://app.example.com/my-org/work-apps/slack`
2. **Middleware** checks for `better-auth.session_token` cookie — not found
3. Middleware responds with 302 redirect to `/login?returnUrl=%2Fmy-org%2Fwork-apps%2Fslack`
4. User sees login page, authenticates
5. Login page reads `returnUrl` and redirects to `/my-org/work-apps/slack`
6. Page renders with full data (API calls succeed with valid session)

### Authenticated user navigates normally
1. User navigates to any protected page
2. Middleware checks for `better-auth.session_token` cookie — found
3. Middleware calls `NextResponse.next()` — request continues normally
4. No additional latency or redirect

### Session expires mid-browsing
1. User's session cookie expires (7-day expiry)
2. User clicks a link to a new page
3. Middleware detects missing/expired cookie → redirects to `/login?returnUrl=...`
4. User re-authenticates, lands back on intended page

## 6) Requirements

### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Redirect unauthenticated requests to protected routes to `/login` | Fresh browser navigating to `/default/work-apps` gets 302 to `/login` before any page content renders | Server-side, not client-side |
| Must | Pass through requests to public routes without auth check | `/login`, `/forgot-password`, `/reset-password`, `/accept-invitation/*`, `/device`, `/link`, `/no-organization`, `/oauth/*`, `/github/*` are accessible without cookies | |
| Must | Pass through static assets and Next.js internals | `/_next/*`, `/assets/*`, favicons, manifests are never redirected | |
| Must | Preserve intended destination as `returnUrl` query param | Redirect URL is `/login?returnUrl=<encoded-original-path>` | Use existing `returnUrl` handling in login page |
| Must | Pass through internal API routes | `/api/*` routes in agents-manage-ui are not redirected | These have their own auth or are internal |
| Should | Use existing `isValidReturnUrl()` validation for the return URL | Return URL starts with `/`, no `://`, no `//` | Prevent open redirect |
| Should | Handle cookie name via shared constant, not hardcoded string | Cookie name matches what Better Auth is configured with | |
| Could | Log middleware redirects for observability | Structured log with original path on redirect | Low priority |

### Non-functional requirements
- **Performance:** <1ms added latency for authenticated requests (cookie presence check only, no API call)
- **Reliability:** Middleware must never block page loads — if cookie check fails unexpectedly, fail open (allow through) rather than fail closed (redirect loop)
- **Security/privacy:** Cookie presence check only (not validation) — the API validates session integrity. This is defense-in-depth, not the primary auth boundary.

## 7) Success metrics & instrumentation
- **Metric:** Zero protected pages render for unauthenticated users (browser test)
  - Baseline: All pages render without auth
  - Target: All protected pages redirect to `/login`
  - Instrumentation: Browser automation test in CI
- **What we will log/trace:** N/A for initial implementation (Could-have)

## 8) Current state (how it works today)
- **Summary:** No `middleware.ts` exists. Auth is enforced client-side via `useAuthSession()` on the root page only. Deep links to any route bypass this check entirely. The API enforces auth on data fetches (returns 401), but the page shell, navigation, sidebar, tabs, and static content all render for unauthenticated users.
- **Key constraints:** Better Auth uses `better-auth.session_token` as the session cookie name. Login page already supports `?returnUrl=` param with open-redirect validation.
- **Known gaps:** The 3 internal API routes (`/api/signoz/*`, `/api/data-components/*`, `/api/artifact-components/*`) have no auth protection — out of scope for this spec but noted.

## 9) Proposed solution (vertical slice)

### Implementation

Create `agents-manage-ui/src/middleware.ts` with:

1. **Public route allowlist** — requests matching these patterns skip auth check:
   ```
   /login
   /forgot-password
   /reset-password
   /accept-invitation/:path*
   /device
   /link
   /no-organization
   /oauth/:path*
   /github/:path*
   /api/:path*
   /_next/:path*
   /assets/:path*
   /favicon.ico
   /manifest.json
   ```

2. **Cookie check** — for non-public routes, check `request.cookies.get('better-auth.session_token')`:
   - Present → `NextResponse.next()`
   - Missing → `NextResponse.redirect('/login?returnUrl=<encoded-path>')`

3. **Matcher config** — use Next.js `config.matcher` to exclude static assets at the framework level (more efficient than checking in middleware code):
   ```typescript
   export const config = {
     matcher: ['/((?!_next/static|_next/image|assets|favicon.ico|manifest.json).*)'],
   };
   ```

### Alternatives considered

- **Option A: Cookie check in middleware (proposed)** — Simplest. Checks cookie presence only. No API call. <1ms. Cookie validity is still verified by the API on data fetch.
- **Option B: Session validation via Better Auth API in middleware** — More secure (validates session isn't expired/revoked), but adds a network round-trip (~10-50ms) to every page load. Overkill since the API already validates on data fetch.
- **Option C: Layout-level server component auth check** — Could use `cookies()` in a server layout to redirect. But this still renders the layout before checking, and doesn't prevent the page shell from being sent to the client initially.

**Why Option A:** Defense-in-depth. The middleware's job is to prevent page shell exposure, not to be the primary auth boundary. Cookie presence is sufficient — if the cookie is present but expired, the user will see the page shell briefly but the API will return 401 and the client-side auth hook will redirect to login. This is an acceptable tradeoff for zero added latency.

## 10) Decision log

| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Use `config.matcher` for static/framework exclusions + in-function allowlist for public routes | T | No | Confirmed | Standard Next.js pattern; avoids middleware execution on static assets | N/A | Matcher regex excludes `_next/static`, `_next/image`, `assets`, `favicon.ico`, `manifest.json` |
| D2 | Cookie presence check only — no session validation in middleware | T | No | Confirmed | <1ms latency, API validates on data fetch; expired cookies are edge case (7-day expiry) | evidence/current-auth-architecture.md | Expired-but-present cookies show page shell briefly before API 401 triggers client redirect |
| D3 | Keep client-side auth check on root `/page.tsx` — clean up later | T | No | Confirmed | Also handles org-detection routing; removing requires untangling | N/A | Slight redundancy; middleware + client check both redirect unauthenticated users on `/` |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should the middleware use Next.js `config.matcher` to exclude public routes, or check in the middleware function body? | T | P1 | No | Resolved → D1: `config.matcher` + in-function allowlist | Resolved |
| Q2 | Should we remove client-side auth redirects from root `/page.tsx` after adding middleware? | T | P2 | No | Resolved → D3: Keep for now, clean up later | Resolved |
| Q3 | Should the 3 unprotected `/api/*` routes in manage-ui get auth? | X | P2 | No | Filed as [PRD-6330](https://linear.app/inkeep/issue/PRD-6330) | Deferred |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `better-auth.session_token` is the cookie name in all environments | HIGH | Verified in auth.ts — uses Better Auth default | Before implementation | Active |
| A2 | Login page `?returnUrl=` handling works correctly today | HIGH | Verified in login/page.tsx + auth-redirect.ts | Before implementation | Active |
| A3 | Next.js middleware runs before any page rendering (including layouts) | HIGH | Documented Next.js behavior | N/A | Active |

## 13) In Scope (implement now)
- **Goal:** Prevent unauthenticated users from seeing any protected page content
- **Non-goals:** Role-based gating, session validation in middleware, API route protection
- **Requirements:** See §6 — all Must and Should items
- **Proposed solution:** See §9
- **Risks + mitigations:** See §14
- **What gets instrumented:** Browser automation test confirming redirect behavior

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Redirect loop if `/login` is not in the public allowlist | Low | High — login page inaccessible | `/login` is explicitly in the allowlist; test covers this | Implementer |
| OAuth callback routes blocked by middleware | Low | High — OAuth login flow breaks | `/oauth/*` is in the allowlist; test covers this | Implementer |
| Cookie name changes in Better Auth update | Very Low | Medium — middleware stops working | Use constant/config for cookie name, not hardcoded string | Implementer |
| Middleware blocks Next.js internal routes | Low | High — app broken | Use `config.matcher` to exclude `_next/*` at framework level | Implementer |

## 15) Future Work

### Identified
- **Session validation in middleware**
  - What we know: Currently checking cookie presence only. Could validate session against Better Auth API for stronger protection (catches expired/revoked sessions before page render).
  - Why it matters: Expired cookies currently show page shell briefly before API 401 redirects.
  - What investigation is needed: Benchmark latency impact of Better Auth session check in middleware. Consider using Edge-compatible session validation.

- **Unprotected `/api/*` routes in manage-ui**
  - What we know: 3 routes (`/api/signoz/*`, `/api/data-components/*/generate-render`, `/api/artifact-components/*/generate-render`) have no auth protection.
  - Why it matters: Potential unauthorized access to monitoring data and component rendering.
  - What investigation is needed: Determine sensitivity of each route and appropriate auth level.
  - Tracking: [PRD-6330](https://linear.app/inkeep/issue/PRD-6330)

### Noted
- **Remove redundant client-side auth redirects** — After middleware is in place, the client-side `useAuthSession()` check on root `/page.tsx` is redundant for auth gating (though it still handles org-detection routing). Could be simplified.
