---
name: pr-review-appsec-vendored
description: "Stack-specific application security checklist for this repo's frameworks: better-auth, SpiceDB/AuthZed, and Next.js RSC. Extends the generalizable pr-review-appsec agent with patterns that require framework-specific knowledge to detect."
user-invocable: false
disable-model-invocation: true
---

# Stack-Specific Application Security Checks

Security patterns specific to this repo's technology stack. Each item includes what to flag, why it matters, and a concrete detection pattern.

## How to Use This Checklist

- Review changed files against the relevant framework sections below.
- Not every section applies to every PR — better-auth checks only apply to auth code, SpiceDB checks only apply to `.zed` files and permission-check code, Next.js RSC checks only apply to components with `'use server'` or `'use client'` directives.
- When unsure whether a pattern is vulnerable, lower confidence rather than asserting.

---

## better-auth (4 items)

### SSO session missing organization context
- **Flag:** After SSO callback, `activeOrganizationId` is not explicitly set on the session.
- **Why:** better-auth does not auto-set `activeOrganizationId` after SSO login. The session authenticates the user but lacks org context, causing downstream code that reads `session.activeOrganizationId` to get `undefined` — silently bypassing org-scoped authorization.
- **Pattern:** SSO callback handlers or `afterSignIn` hooks that do not call `setActiveOrganization()` or equivalent.

### SSO auto-provisioning bypasses membership hooks
- **Flag:** SSO auto-provisioning is enabled without verifying that `beforeAddMember` hooks still fire.
- **Why:** better-auth's SSO auto-provisioning creates organization memberships directly, bypassing `beforeAddMember` hooks. Any gating logic (role assignment, approval workflows, seat limits) in those hooks is silently circumvented.
- **Pattern:** SSO config with `autoProvision: true` or equivalent where `beforeAddMember` hooks enforce business rules.

### Triple onboarding path creates duplicate memberships
- **Flag:** Three independent paths can create organization memberships: invitation acceptance, SSO auto-provisioning, and SCIM provisioning. No deduplication or reconciliation exists.
- **Why:** Each path may assign different roles, creating duplicate memberships with conflicting permissions. A user invited as `viewer` who also joins via SSO auto-provisioning as `member` has two memberships with different access levels.
- **Pattern:** Organization membership creation in invitation handlers, SSO callbacks, AND SCIM endpoints without a shared upsert-or-reconcile layer.

### Social providers not enforceable per-tenant at runtime
- **Flag:** Social auth provider configuration (Google, GitHub, etc.) is set at build-time and cannot be restricted per-tenant at the server level.
- **Why:** better-auth freezes social provider configuration at startup. Per-tenant control (e.g., "Tenant A allows Google SSO, Tenant B does not") can only be enforced via UI-layer gating, which is bypassable by calling the auth endpoint directly.
- **Pattern:** Tenant-specific social auth restrictions implemented only in UI conditional rendering without server-side enforcement in the auth flow.

---

## SpiceDB / AuthZed (2 items)

### LookupResources unbounded with wildcard schemas
- **Flag:** `LookupResources` API calls on schemas with wildcard relations (e.g., `user:*`) without pagination or result limits.
- **Why:** Wildcard relations cause `LookupResources` to fan out across all matching resources. In schemas where `public` or `anonymous` access is modeled via wildcards, a single lookup can enumerate the entire resource set — causing unbounded latency or OOM in the SpiceDB server.
- **Pattern:** `client.lookupResources()` calls without `optionalLimit` on relations that include wildcard grants. Check schema files (`.zed`) for `user:*` or `#viewer@user:*` patterns.

### Intersection operator latency on critical paths
- **Flag:** SpiceDB permission definitions using the intersection operator (`&`) on request-critical auth paths.
- **Why:** The intersection operator (`&`) in SpiceDB cannot short-circuit — both sides are always fully evaluated. On permission checks that combine two expensive relations (e.g., `viewer & org_member`), this doubles the evaluation cost. Unlike union (`+`), there is no early exit when one side is satisfied.
- **Pattern:** `.zed` schema files with `permission <name> = <relation1> & <relation2>` on permissions checked in hot request paths (API route middleware, per-item authorization in list endpoints).

---

## Security Operations (2 items)

### Re-authentication missing for sensitive operations
- **Flag:** Endpoints for email change, password change, MFA modification, or account deletion that accept the operation with only a valid session — no current-password confirmation or re-authentication step.
- **Why:** A stolen session token or CSRF on an active session grants full account takeover if sensitive operations don't require re-authentication. The attacker can change email + password without knowing the current password.
- **Pattern:** `PATCH /user/email`, `PATCH /user/password`, `DELETE /user`, `POST /user/mfa/disable` handlers where the only auth check is session validity (no `currentPassword` field in the request body, no step-up auth flow).

### Security event logging absent
- **Flag:** Authentication failures, authorization denials, and rate-limit triggers are not logged.
- **Why:** Without security event logs, incident detection is impossible — brute-force attacks, credential stuffing, and authorization probing are invisible. This is distinct from business audit trails (which log successful mutations). Security event logging captures the failures and denials.
- **Pattern:** Login handlers where the failure path returns 401 without a `logger.warn()` or `logger.info()` call. Authorization middleware that returns 403 without logging. Rate-limit middleware that triggers without logging the event, source IP, and target.

---

## Next.js / React Server Components (5 items)

### Secrets as string literals in Server Functions
- **Flag:** Hardcoded secrets (API keys, database URLs, signing keys) as string literals in files containing `'use server'` directives.
- **Why:** Server Function source code can be exposed via React Flight protocol vulnerabilities. Secrets accessed via `process.env` are safe because only the reference is in source; literal strings are in the source itself and would be exposed.
- **Pattern:** String literals matching secret patterns (long hex/base64 strings, `sk-*`, `pk-*`, connection strings) in `'use server'` files. Safe: `process.env.SECRET_NAME`.

### Server Action closure captures server-side variables
- **Flag:** `'use server'` functions defined inside other functions that close over server-side variables containing sensitive data.
- **Why:** React serializes Server Action closures to send them to the client. Variables captured in the closure — database records, user objects, internal IDs — are serialized and visible in the client bundle. This is not `dangerouslySetInnerHTML`-style exposure; it's the framework's serialization mechanism working as designed.
- **Pattern:** Arrow functions or function declarations with `'use server'` inside a parent function that has `const user = await db.query(...)` or similar in its scope. The inner function implicitly captures `user`.

### Server-to-Client Component prop serialization
- **Flag:** Sensitive data passed as props from a Server Component to a Client Component.
- **Why:** Props crossing the Server → Client Component boundary are serialized by React and sent to the browser as part of the RSC payload. Passing a full user record (including email, internal IDs, role metadata) as a prop exposes it in the client, even if the Client Component never renders those fields.
- **Pattern:** Server Components that pass `user`, `session`, `account`, or database query results as props to components marked with `'use client'`. Safe: pass only the specific fields the Client Component needs.

### NEXT_PUBLIC_ prefix on sensitive environment variables
- **Flag:** Environment variables with the `NEXT_PUBLIC_` prefix that contain secrets or sensitive configuration.
- **Why:** Next.js bundles any environment variable prefixed with `NEXT_PUBLIC_` into the client-side JavaScript. Without the prefix, env vars are server-only. The prefix is a naming convention that changes runtime behavior — `NEXT_PUBLIC_DATABASE_URL` would expose the database connection string to every browser.
- **Pattern:** `.env*` files or `next.config.*` with `NEXT_PUBLIC_` prefix on variables containing: database URLs, API keys, signing secrets, internal service URLs, auth credentials.

### ISR/static generation caches sensitive data
- **Flag:** `getStaticProps`, `generateStaticParams`, or ISR-enabled pages that fetch and cache user-specific or sensitive data.
- **Why:** Next.js Incremental Static Regeneration (ISR) and static generation cache page output as public static files served without authentication. Data fetched during static generation becomes publicly accessible — a product catalog is fine; user billing data is not.
- **Pattern:** `getStaticProps` or ISR-configured pages (`revalidate: N`) that call authenticated APIs or query user/tenant-specific data. Safe: only cache public, non-sensitive content in static pages.

---

## Severity Calibration

| Finding | Severity | Rationale |
|---|---|---|
| SSO session missing organization context | CRITICAL | Silent authorization bypass — downstream code gets undefined org |
| Re-authentication missing for sensitive operations | CRITICAL | Session hijack → full account takeover |
| Secrets as string literals in Server Functions | CRITICAL | Potential secret exposure via React Flight |
| SSO auto-provisioning bypasses membership hooks | MAJOR | Membership gating circumvented |
| Triple onboarding path duplicates | MAJOR | Conflicting permissions across duplicate memberships |
| LookupResources unbounded with wildcards | MAJOR | DoS risk on SpiceDB server |
| Security event logging absent | MAJOR | Incident detection impossible |
| Server Action closure captures server vars | MAJOR | Sensitive data serialized to client |
| RSC prop serialization leaks data | MAJOR | User data in client bundle |
| NEXT_PUBLIC_ on sensitive env vars | MAJOR | Secrets bundled into client JS |
| ISR caches sensitive data | MAJOR | Authenticated data served publicly |
| Social providers not enforceable per-tenant | MINOR | UI-only gating, bypassable via direct auth endpoint |
| Intersection operator on hot paths | MINOR | Performance impact, not direct security vulnerability |
