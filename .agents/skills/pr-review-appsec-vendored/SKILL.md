---
name: pr-review-appsec-vendored
description: |
  Stack-specific application security checklist for this repo's frameworks:
  better-auth, SpiceDB/AuthZed, and Next.js RSC. Extends the generalizable
  pr-review-appsec agent with patterns that require framework-specific
  knowledge to detect. Loaded by pr-review-appsec.
user-invocable: false
disable-model-invocation: true
---

# Stack-Specific Application Security Checks

Security patterns specific to this repo's technology stack.

## How to Use This Checklist

- Review changed files against the relevant sections below.
- Not every section applies to every PR — better-auth checks apply to auth code, SpiceDB checks apply to `.zed` files and permission-check code, Next.js RSC checks apply to components with `'use server'` or `'use client'` directives.
- When unsure whether a pattern is vulnerable, lower confidence rather than asserting.

---

## §1 better-auth

- **SSO session missing organization context**: After SSO callback, `activeOrganizationId` is not explicitly set on the session. better-auth does not auto-set this — downstream code reading `session.activeOrganizationId` gets `undefined`, silently bypassing org-scoped authorization. Flag SSO callback handlers or `afterSignIn` hooks that do not call `setActiveOrganization()`.

- **SSO auto-provisioning bypasses membership hooks**: SSO auto-provisioning creates organization memberships directly, bypassing `beforeAddMember` hooks. Any gating logic (role assignment, approval workflows, seat limits) in those hooks is silently circumvented. Flag SSO config with `autoProvision: true` where `beforeAddMember` hooks enforce business rules.

- **Triple onboarding path creates duplicate memberships**: Three independent paths can create memberships: invitation acceptance, SSO auto-provisioning, and SCIM provisioning. Each may assign different roles, creating duplicates with conflicting permissions. Flag membership creation in invitation handlers, SSO callbacks, AND SCIM endpoints without a shared upsert-or-reconcile layer.

- **Social providers not enforceable per-tenant at runtime**: better-auth freezes social provider configuration at startup. Per-tenant control ("Tenant A allows Google SSO, Tenant B does not") can only be enforced via UI-layer gating, which is bypassable by calling the auth endpoint directly. Flag tenant-specific social auth restrictions implemented only in UI conditional rendering.

---

## §2 SpiceDB / AuthZed

- **LookupResources unbounded with wildcard schemas**: `LookupResources` on schemas with wildcard relations (`user:*`) fans out across all matching resources — unbounded latency or OOM. Flag `client.lookupResources()` calls without `optionalLimit` on relations that include wildcard grants. Check `.zed` files for `user:*` or `#viewer@user:*`.

- **Intersection operator latency on critical paths**: The intersection operator (`&`) in SpiceDB cannot short-circuit — both sides are always fully evaluated, doubling cost on expensive relations. Flag `.zed` files with `permission <name> = <relation1> & <relation2>` on permissions checked in hot request paths.

---

## §3 Security Operations

- **Re-authentication missing for sensitive operations**: Endpoints for email change, password change, MFA modification, or account deletion that accept the operation with only a valid session — no current-password confirmation. A stolen session or CSRF grants full account takeover. Flag `PATCH /user/email`, `PATCH /user/password`, `DELETE /user`, `POST /user/mfa/disable` handlers where the only auth check is session validity.

- **Security event logging absent**: Authentication failures, authorization denials, and rate-limit triggers are not logged. Without these, incident detection is impossible. Distinct from business audit trails (which log successful mutations). Flag login failure paths that return 401 without logging, authorization middleware returning 403 without logging, rate-limit triggers without logging.

---

## §4 Next.js / React Server Components

- **Secrets as string literals in Server Functions**: Server Function source code can be exposed via React Flight protocol vulnerabilities. Secrets accessed via `process.env` are safe (only the reference is in source); literal strings would be exposed. Flag secret patterns (`sk-*`, `pk-*`, connection strings, long hex/base64) in `'use server'` files. Safe: `process.env.SECRET_NAME`.

- **Server Action closure captures server-side variables**: React serializes Server Action closures to the client. Variables captured in the closure (database records, user objects, internal IDs) are visible in the client bundle. Flag `'use server'` functions inside parent functions that close over `const user = await db.query(...)` or similar.

- **Server-to-Client Component prop serialization**: Props crossing the Server → Client Component boundary are serialized and sent to the browser. Passing a full user record as a prop exposes it, even if the Client Component never renders those fields. Flag Server Components passing `user`, `session`, `account`, or query results as props to `'use client'` components. Safe: pass only needed fields.

- **NEXT_PUBLIC_ prefix on sensitive environment variables**: Next.js bundles any `NEXT_PUBLIC_`-prefixed env var into client JS. Without the prefix, env vars are server-only. Flag `.env*` files or `next.config.*` with `NEXT_PUBLIC_` prefix on database URLs, API keys, signing secrets, internal service URLs, auth credentials.

- **ISR/static generation caches sensitive data**: ISR and static generation cache page output as public static files served without auth. Flag `getStaticProps` or ISR-configured pages (`revalidate: N`) that call authenticated APIs or query user/tenant-specific data. Safe: only cache public, non-sensitive content.

---

## Severity Calibration

| Finding | Severity | Rationale |
|---|---|---|
| SSO session missing org context | CRITICAL | Silent authorization bypass |
| Re-auth missing for sensitive ops | CRITICAL | Session hijack → account takeover |
| Secrets in Server Functions | CRITICAL | Secret exposure via React Flight |
| SSO auto-provisioning bypasses hooks | MAJOR | Membership gating circumvented |
| Triple onboarding duplicates | MAJOR | Conflicting permissions |
| LookupResources unbounded | MAJOR | DoS on SpiceDB |
| Security event logging absent | MAJOR | Incident detection impossible |
| Closure captures server vars | MAJOR | Data serialized to client |
| RSC prop serialization | MAJOR | User data in client bundle |
| NEXT_PUBLIC_ on secrets | MAJOR | Secrets in client JS |
| ISR caches sensitive data | MAJOR | Auth data served publicly |
| Social providers not per-tenant enforceable | MINOR | UI-only gating, bypassable |
| Intersection operator on hot paths | MINOR | Performance, not direct vuln |
