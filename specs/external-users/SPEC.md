# External End-User Authentication — PROPOSAL

**Status:** Draft
**Owner(s):** Edwin
**Last updated:** 2026-02-11
**Links:**
- Research: [`~/.claude/reports/embedded-widget-end-user-auth/`](~/.claude/reports/embedded-widget-end-user-auth/)
- Research: [`~/.claude/reports/altcha-proof-of-work-integration/`](~/.claude/reports/altcha-proof-of-work-integration/)
- Research: [`~/.claude/reports/sts-patterns-external-users/`](~/.claude/reports/sts-patterns-external-users/) (previously: `workflow-platform-credential-authn`)

---

## 1) Problem Statement

- **Who is affected:** End-users of Inkeep's embedded chat widget (`@inkeep/agents-ui`) on customer websites (e.g., `help.customer.com`, `app.customer.com`). Also: customers integrating the widget, and Inkeep's own API infrastructure.
- **What pain / job-to-be-done:** Today, the widget authenticates to `api.inkeep.com` using a project-level API key. This means: (a) all end-users share one identity — no personalization, no per-user conversation history, no action authorization; (b) the API key is exposed client-side with no abuse gate — any attacker can extract it and script unlimited requests; (c) customers who want to auth-gate their widget (only their logged-in users can chat) have no mechanism.
- **Why now:** Customers are requesting personalized copilot experiences (conversation history, user-specific context, actions on behalf of the user). This requires knowing *who* the end-user is. Simultaneously, public-facing endpoints need abuse protection before scaling — the current API-key-only model has no per-user rate limiting and no computational cost to deter automated abuse.
- **Current workaround(s):** Customers pass user context as unverified metadata. No abuse protection beyond project-level rate limits. No conversation continuity across sessions.

---

## 2) Goals

- **G1:** Public unauthenticated end-users can use the chat widget with abuse protection (PoW gate + per-session rate limits) and without requiring the customer to have a backend.
- **G2:** Customers can optionally authenticate end-users against their own auth system, enabling personalized copilot experiences and action authorization.
- **G3:** The auth model is cross-origin safe (widget on `docs.customer.com` → API on `api.inkeep.com`), working in all browsers including Safari (ITP) and Firefox (ETP).
- **G4:** The architecture supports a clean upgrade path from anonymous → authenticated without requiring architectural changes.

---

## 3) Non-Goals

- **NG1:** Internal multi-tenant auth (Better-Auth, SSO, SAML) — already handled, see `agents-core/src/auth/`.
- **NG2:** Outbound credential management for agent tool calls (OAuth tokens for calling customer APIs on behalf of agents) — separate concern.
- **NG3:** Widget UI/UX for auth flows (login prompts, error states, loading spinners during PoW).
- **NG4:** Progressive trust / dynamic rate limiting (v2/v3 — documented in Appendix A).
- **NG5:** Conversation storage architecture (keyed by user ID) — separate spec, though this spec defines the identity that keys it.

---

## 4) Personas / Consumers

| Persona | Description | Primary scenario |
|---------|-------------|-----------------|
| **P1: Anonymous visitor** | End-user on `help.customer.com` docs site. Not logged in. Customer may not even have user accounts. | Scenario 1: Public unauthenticated |
| **P2: Authenticated end-user** | End-user on `app.customer.com` logged into customer's app. Customer wants Inkeep to know who they are. | Scenario 2: Customer-authenticated |
| **P3: Customer developer** | Integrates `@inkeep/agents-ui` into their site. Configures auth in Inkeep dashboard. | Both scenarios — integration surface |
| **P4: Inkeep API** | `api.inkeep.com` — validates tokens, enforces rate limits, passes identity to agent runtime. | Both scenarios — enforcement point |

---

## 5) User Journeys

### Scenario 1: Public Unauthenticated (Anonymous Visitor)

**Happy path (Phase 1 — anonymous session only):**

```
1. Visitor loads help.customer.com
2. Widget JS loads, detects no auth token in memory
3. Widget requests anonymous session:
   POST api.inkeep.com/auth/external/anonymous
   { project_key: "pk_abc" }
   → { token: "eyJ...", expires_at: "..." }
4. Widget stores JWT in memory
5. All subsequent requests include: Authorization: Bearer <jwt>
6. Visitor chats normally
7. On token expiry, widget repeats steps 3-4 transparently
```

**Happy path (Phase 2 — with Altcha PoW):**

```
1. Visitor loads help.customer.com
2. Widget JS loads, detects no auth token in memory
3. Widget requests PoW challenge:
   GET api.inkeep.com/auth/external/challenge?project_key=pk_abc
   → { algorithm, challenge, maxnumber, salt, signature }
4. Widget solves challenge in Web Worker (~200ms on modern device)
5. Widget requests anonymous session:
   POST api.inkeep.com/auth/external/anonymous
   { project_key: "pk_abc", altcha: "<base64>" }
   → { token: "eyJ...", expires_at: "..." }
6. Widget stores JWT in memory
7. All subsequent requests include: Authorization: Bearer <jwt>
8. Visitor chats normally — rate limits enforced per JWT sub
9. On token expiry, widget repeats steps 3-6 transparently
```

**Failure/recovery:**
- PoW solver fails (old browser, no Web Worker) → widget shows degraded "try again" state (Phase 2 only)
- JWT expired mid-conversation → widget auto-refreshes, retries failed request
- Rate limit hit → 429 with `Retry-After` header, widget shows "please wait"
- Challenge replay detected → 403, widget requests fresh challenge (Phase 2 only)

**Debug experience:**
- JWT is JWS (readable) — developer can paste into jwt.io to inspect claims
- Challenge/response visible in Network tab (Phase 2)
- `x-request-id` on all responses for support correlation

### Scenario 2: Customer-Authenticated (Identified End-User)

**Happy path:**

```
1. User logs into app.customer.com (using customer's own auth — Auth0, Clerk, etc.)
2. Customer's backend generates a signed JWT for Inkeep:

   jwt.sign({ sub: "u123", email: "...", exp }, SHARED_SECRET, { algorithm: "HS256" })

3. Customer's frontend passes token to widget:
   InkeepWidget.configure({ authenticate: () => fetchTokenFromBackend() })
4. Widget calls api.inkeep.com with:
   Authorization: Bearer <customer-jwt>
   X-Inkeep-Api-Key: <project-api-key>
5. API validates:
   a. API key → looks up customer config (auth mode, HS256 signing secret)
   b. JWT → validates HS256 signature with customer's shared secret
   c. Extracts claims: sub, email, custom claims
6. Agent runtime receives verified user identity as structured context
7. Conversations keyed by (tenantId, projectId, sub) — history persists
```

**Failure/recovery:**
- JWT expired → widget calls `authenticate()` callback for fresh token, retries
- JWT signature invalid → 401, widget calls callback, if still fails shows error
- Customer hasn't configured auth but sends JWT → API ignores JWT, treats as anonymous

**Debug experience:**
- Dashboard shows auth configuration status per project
- API returns structured error: `{ error: "jwt_validation_failed", detail: "signature_mismatch" }`

---

## 6) Requirements

### Functional Requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| **Must** | Anonymous session issuance | Widget can obtain a session JWT without any customer backend. Phase 1: rate-limited session creation. Phase 2: adds Altcha PoW gate (difficulty ~200ms on modern device, challenge expires in 5min, replay protection via Redis/memory set). | Scenario 1 core |
| **Must** | JWT-based session for all end-user requests | All `/run/*` end-user requests authenticated via `Authorization: Bearer <jwt>`. JWT contains `sub` (visitor/user ID), `tenant_id` (from API key), `exp`. | Both scenarios |
| **Must** | Per-session rate limiting | Rate limits enforced per JWT `sub`, not just per IP. Anonymous: ~50 msgs/hr. Authenticated: configurable per customer. | Abuse prevention |
| **Must** | Customer-signed JWT validation (HS256) | Customer generates shared secret in dashboard. API validates HS256 signature. JWT must include `sub` and `exp`. | Scenario 2 |
| **Must** | Cross-origin support | Bearer token in header (not cookies). Dynamic CORS origin validation for customer domains. Works in Safari (ITP) and Firefox (ETP). | Architecture constraint |
| **Must** | Auth enforcement modes | Per-project toggle: `none` (anonymous only), `optional` (both), `required` (reject without valid auth). | Customer config |
| **Should** | Callback-based token refresh | Widget SDK accepts `authenticate(tokenCallback)` where callback is re-invoked on 401. Transparent to end-user. | UX quality |
| **Could** | Anonymous-to-auth session linking | When user authenticates mid-session, annotate anonymous session record with `linked_to: <authenticated_sub>`. | In-place enrichment |

### Non-Functional Requirements

- **Performance:** JWT validation <1ms (HS256 ~1μs). PoW challenge generation <1ms. Session issuance <50ms (excluding PoW solve time).
- **Reliability:** HS256 validation is pure CPU — no external dependencies. No auth provider outage risk for authenticated path.
- **Security:** No third-party cookies. JWS (not JWE) for v1 — claims aren't secrets. HS256 signing keys stored encrypted at rest.
- **Operability:** Structured auth error responses with `error`, `detail` fields. `x-request-id` correlation. Auth decision logged (method used, result, latency). Dashboard shows per-project auth config status and recent auth failures.
- **Cost:** PoW is client-side (zero server cost). HS256 validation is pure CPU (no external calls). Redis for replay tracking (~5min TTL per challenge, negligible storage).

---

## 7) Success Metrics & Instrumentation

- **Metric 1: Anonymous session creation success rate**
  - Baseline: N/A (new feature)
  - Target: >99% success rate (PoW solve + session issuance)
  - Instrumentation: Log challenge issuance, solve submission, success/failure with device category
- **Metric 2: Authenticated request validation latency (p99)**
  - Baseline: N/A
  - Target: <5ms p99 (HS256 is ~1μs, overhead is config lookup)
  - Instrumentation: Histogram metric on auth middleware
- **Metric 3: Abuse reduction**
  - Baseline: Current API-key-only abuse rate
  - Target: 10x reduction in scripted abuse (measured by rate limit hits per unique IP)
  - Instrumentation: Rate limit hit counter by auth method (anonymous vs authenticated)
- **What we will log:** Auth method used (anonymous/hs256), validation result (success/failure/reason), JWT `sub` (hashed for privacy), token lifetime remaining, PoW solve time reported by client.

---

## 8) Current State (How It Works Today)

### Authentication Architecture (from agents repo)

**Run API (`/run/*`)** — the widget-facing surface:
- Auth middleware: `agents-api/src/middleware/runAuth.ts`
- Priority: JWT temp token → bypass secret → **API key** → team agent token → dev fallback
- **Today, the widget uses API key auth.** Format: `sk_{publicId}.{secret}`. Scrypt-hashed, project-scoped.
- API key lookup: O(1) by `publicId` → verify hash → return `(tenantId, projectId, agentId)`
- No per-user identity. No abuse gate. No rate limiting per end-user.

**CORS configuration:**
- `/run/*` routes: permissive CORS (`origin: '*'`)
- Already supports cross-origin widget requests

**Database models (relevant to this spec):**
- `api_keys` table: `{ id, tenantId, projectId, agentId, publicId, keyHash, keyPrefix, name, expiresAt, lastUsedAt }`
- `conversations` table: `{ tenantId, projectId, id, userId, agentId, ... }` — `userId` column exists but is nullable and not populated by widget
- No `anonymous_sessions` or `end_user_tokens` table

**What exists that we build on:**
- API key → tenant/project resolution (reuse for determining which customer's auth config to load)
- Hono middleware pattern (add new auth methods to existing priority chain)
- `conversations.userId` column (will hold authenticated `sub` once identity is available)
- `agents-core/src/utils/temp-jwt.ts` (JWT signing/verification utilities — reusable patterns)

**What does NOT exist:**
- No Altcha integration
- No anonymous session issuance endpoint
- No customer-signed JWT validation
- No JWKS fetching/caching
- No per-project auth configuration (auth mode, signing key, issuer URL)
- No per-user rate limiting on `/run/*`

---

## 9) Proposed Solution (Vertical Slice)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│               END-USER (browser on customer domain)                  │
│                                                                     │
│  Scenario 1: Anonymous              Scenario 2: Authenticated       │
│  ┌─────────────────────┐            ┌─────────────────────────┐     │
│  │ Widget requests anon │            │ Customer backend signs  │     │
│  │ session → gets JWT   │            │ JWT (HS256)              │     │
│  │ (Phase 2: +Altcha)  │            │                         │     │
│  └──────────┬──────────┘            └───────────┬─────────────┘     │
│             │                                    │                   │
│             ▼                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Widget SDK: authenticate(tokenCallback)                     │   │
│  │  Every request sends:                                        │   │
│  │    Authorization: Bearer <jwt>                               │   │
│  │    X-Inkeep-Api-Key: <project-api-key>                       │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ HTTPS (cross-origin, Bearer token)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       api.inkeep.com                                 │
│                                                                     │
│  ┌─ NEW: End-User Auth Middleware ────────────────────────────────┐  │
│  │                                                                │  │
│  │  1. Extract API key → resolve tenant + project                │  │
│  │  2. Load project auth config:                                 │  │
│  │     { mode: none|optional|required,                           │  │
│  │       hs256_enabled, hs256_secret }                           │  │
│  │  3. Validate JWT:                                             │  │
│  │     - Anonymous: verify HS256 with INKEEP_ANON_JWT_SECRET     │  │
│  │     - Authenticated: verify HS256 with customer's secret      │  │
│  │  4. Extract identity: { sub, email?, claims? }                │  │
│  │  5. Enforce rate limits per sub                               │  │
│  │  6. Set execution context: { userId: sub, authMethod, ... }   │  │
│  │                                                                │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               ▼                                      │
│  ┌─ Existing: Agent Runtime ──────────────────────────────────────┐  │
│  │  Receives user identity as structured context                  │  │
│  │  Conversations keyed by (tenantId, projectId, userId)         │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### New API Endpoints

| Method | Path | Auth | Phase | Purpose |
|--------|------|------|-------|---------|
| POST | `/auth/external/anonymous` | API key (in body: `project_key`) | 1 | Generate anonymous identity + issue JWT. Phase 2 adds required `altcha` proof in body. |
| GET | `/auth/external/challenge` | API key (query: `project_key`) | 2 | Issue Altcha PoW challenge |
| — | All existing `/run/*` | JWT (Bearer) + API key | 1 | Existing endpoints, now with per-user identity |

### Data Model Changes

**New table: `end_user_auth_configs`** (runtime DB)

```sql
CREATE TABLE end_user_auth_configs (
  tenant_id     VARCHAR(256) NOT NULL,
  project_id    VARCHAR(256) NOT NULL,
  -- Auth enforcement
  mode          VARCHAR(32)  NOT NULL DEFAULT 'none',  -- none | optional | required
  -- Anonymous auth (always available when mode != 'required')
  anon_enabled  BOOLEAN      NOT NULL DEFAULT true,
  -- Customer-signed JWT (HS256)
  hs256_enabled BOOLEAN      NOT NULL DEFAULT false,
  hs256_secret  TEXT,         -- encrypted at rest, generated in customer dashboard
  -- Metadata
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, project_id)
);
```

**No schema changes to existing tables.** The `conversations.userId` column already exists and will be populated with the JWT `sub` claim.

### JWT Payload Specification

**Anonymous session JWT (issued by Inkeep):**

```json
{
  "sub": "anon_01924abc-...",
  "tid": "org_xyz",
  "pid": "proj_abc",
  "iss": "inkeep",
  "iat": 1707464400,
  "exp": 1707550800,
  "type": "anonymous"
}
```

- `sub`: `anon_` prefix + server-generated UUIDv7. Prefix distinguishes from authenticated users.
- `tid`/`pid`: Tenant and project — derived from API key during issuance.
- `exp`: 24 hours (configurable per project).
- Signed with `INKEEP_ANON_JWT_SECRET` (HS256).

**Authenticated user JWT (issued by customer):**

```json
{
  "sub": "user_123",
  "email": "jane@customer.com",
  "name": "Jane Smith",
  "exp": 1707580800,
  "iat": 1707580200,
  "aud": "api.inkeep.com",
  "iss": "customer.com",
  "inkeep:claims": {
    "plan": "enterprise",
    "org_id": "acme_corp"
  }
}
```

- `sub` and `exp` are required.
- `email`, `name`, `aud`, `iss`, `inkeep:claims` are recommended.
- Signed with customer's shared secret (HS256) or auth provider's private key (RS256 via JWKS).

### Widget SDK API

```typescript
// Scenario 1: Anonymous (no customer backend needed)
// Widget handles Altcha + session creation automatically
const widget = InkeepWidget.create({
  apiKey: "pk_abc123",
  // No authenticate callback → anonymous mode
});

// Scenario 2: Authenticated
const widget = InkeepWidget.create({
  apiKey: "pk_abc123",
  authenticate: async () => {
    // Customer's code — fetch JWT from their backend
    const res = await fetch("/api/inkeep-token");
    const { token } = await res.json();
    return token;
  },
});

// Scenario 2 — customer backend signs JWT with shared secret
// Example backend (Node.js):
//   const token = jwt.sign(
//     { sub: user.id, email: user.email },
//     INKEEP_SHARED_SECRET,
//     { algorithm: "HS256", expiresIn: "1h" }
//   );
//   res.json({ token });
```

**Internal behavior:**
- If `authenticate` is provided → call it on init and on 401 (callback pattern)
- If `authenticate` is NOT provided → request anonymous session automatically, store JWT in memory. Phase 2 adds Altcha PoW solve before session request.
- JWT stored in JS memory (not localStorage) — cleared on page unload
- On 401: call `authenticate()` or re-request anonymous session, retry failed request once

### Auth Middleware Integration

The new end-user auth middleware slots into the existing `runAuth.ts` priority chain:

```
Current:  JWT temp token → bypass → API key → team agent token → dev fallback
                                      ↓
Proposed: JWT temp token → bypass → API key → end-user JWT → team agent token → dev fallback
                                      ↓              ↓
                                resolve tenant   validate end-user JWT
                                + project        using tenant's auth config
```

The API key resolution happens first (existing behavior). Then, if an end-user JWT is also present (`Authorization: Bearer`), the middleware validates it using the tenant's auth configuration.

### Customer Dashboard Configuration

New section in project settings:

```
End-User Authentication
├── Mode: [None] [Optional] [Required]
├── Anonymous Access
│   └── Enabled: [Yes/No] (default: Yes when mode != required)
└── Customer-Signed JWT (HS256)
    ├── Enabled: [Yes/No]
    ├── Signing Secret: [Generate] [Regenerate] [Copy]
    └── Docs link: "How to sign JWTs for Inkeep"
```

### Alternatives Considered

**Why not cookies for cross-origin auth:**
Third-party cookies (cookie from `api.inkeep.com` on page `docs.customer.com`) are blocked by Safari ITP (~18% desktop, ~27% mobile) and Firefox ETP (~3%). Silent failure — no error, cookie just isn't sent. Bearer token in `Authorization` header is the universal pattern used by all 16 chat platforms studied. See [evidence/cross-origin-token-transport.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/cross-origin-token-transport.md).

**Why not CAPTCHA instead of PoW:**
CAPTCHAs require user interaction (friction), depend on third-party services (Google reCAPTCHA), and are increasingly solved by AI. Altcha PoW is invisible, zero-dependency (MIT-licensed), and the computational cost scales with abuse. See [Altcha report](~/.claude/reports/altcha-proof-of-work-integration/).

**Why not entity merge (Intercom-style) for anonymous-to-auth transition:**
Intercom's three-tier entity model (Visitor → Lead → User) with async merge processing is designed for CRM pipelines. Inkeep is a copilot — in-place enrichment (annotate anonymous record with authenticated identity) is sufficient and dramatically simpler. See [evidence/intercom-account-linking-mechanics.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/intercom-account-linking-mechanics.md).

**Why not per-message PoW:**
Altcha at difficulty 50K takes ~200ms on modern devices and ~1.2s on budget Android. Acceptable once per session, unacceptable per-message for conversational UX. Session-level gating with per-JWT rate limits achieves the same abuse protection. See [evidence/difficulty-calibration.md](~/.claude/reports/altcha-proof-of-work-integration/evidence/difficulty-calibration.md).

---

## 10) Decision Log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D1 | Bearer token (not cookies) for cross-origin auth | T | Yes | **Decided** | Third-party cookies blocked in Safari/Firefox (~20-30% users). Industry standard across 16 chat platforms. | [cross-origin-token-transport.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/cross-origin-token-transport.md) |
| D2 | Altcha PoW gates anonymous session creation | T | No | **Decided** | Invisible, zero-dependency, makes identity rotation expensive. ~200ms on modern device at difficulty 50K. | [Altcha report](~/.claude/reports/altcha-proof-of-work-integration/) |
| D3 | JWS (signed JWT, HS256) not JWE for session token | T | No | **Decided** | Claims aren't secrets. 5-10x faster verification. Debuggable (jwt.io). Client can read `exp` for refresh timing. Upgrade to JWE later if needed. | [progressive-trust-and-jwe.md](~/.claude/reports/altcha-proof-of-work-integration/evidence/progressive-trust-and-jwe.md) |
| D4 | HS256 customer-minted JWT for authenticated users | P | No | **Decided** | HS256 is the industry standard (6 of 7 JWT platforms studied use it). Customer mints JWT on their backend, Inkeep validates with shared secret. Simple, well-understood, sufficient for v1+. OIDC/JWKS deferred — add only if customer demand materializes. | [embedded-widget-end-user-auth report](~/.claude/reports/embedded-widget-end-user-auth/) |
| D5 | Callback-based token refresh (not static token) | T | Yes (SDK API) | **Decided** | Zendesk's `loginUser(jwtCallback)` pattern is the mature design. Widget auto-retries on 401. | [zendesk-authenticated-visitors.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/zendesk-authenticated-visitors.md) |
| D6 | In-place enrichment for anon→auth transition (not entity merge) | T | No | **Decided** | v1: just swap JWT. v1.5: annotate with `linked_to`. No merge logic, no entity tiers, no conflict resolution. Algolia/Ada pattern. | [algolia-account-linking-mechanics.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/algolia-account-linking-mechanics.md), conversation |
| D7 | Tenant auth orthogonal to end-user auth | T | Yes | **Decided** | API key identifies customer. JWT identifies end-user. Both on every request. API key determines which signing key to use. Universal pattern across all platforms. | [copilotkit-auth-model.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/copilotkit-auth-model.md) |
| D8 | Auth enforcement: none / optional / required | P | No | **Decided** | Drift's 3-tier model for gradual rollout. | [hosted-platform-auth-patterns.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/hosted-platform-auth-patterns.md) |
| D9 | Stateless JWT for v1 (no DB session) | T | No | **Decided** | Approach 2 from Altcha research. 150 msgs/hr hard ceiling (3 sessions × 50 msgs). Upgrade to DB session (Approach 3) when revocation or progressive trust needed. | [three-approach-comparison.md](~/.claude/reports/altcha-proof-of-work-integration/evidence/three-approach-comparison.md) |
| D10 | Anonymous `sub` = `anon_` + server-generated UUIDv7, issued in server-signed JWT | T | No | **Decided** | Server generates ID during session creation (matches Intercom/Zendesk/Ada pattern — 8 of 16 platforms studied). `anon_` prefix distinguishes from authenticated users. Widget already makes round-trip for JWT, so no latency cost. | Conversation, [anonymous-visitor-identification.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/anonymous-visitor-identification.md) |
| D11 | Dynamic CORS origin validation (function-based) | T | No | **Decided** | `api.inkeep.com` must accept requests from many customer domains. Can't use static allowlist. | [copilotkit-auth-model.md](~/.claude/reports/embedded-widget-end-user-auth/evidence/copilotkit-auth-model.md) |

---

## 11) Open Questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Session vs per-request JWT validation — should Inkeep validate JWT on every request or establish a server-side session after initial validation? | T | P1 | No (v1: per-request) | Benchmark validation latency under load. Per-request is simpler and more secure. | Open |
| Q2 | `aud` claim enforcement — require specific audience to prevent cross-service token reuse? | T | P2 | No | Recommended but not required for HS256. Since secret is shared only between customer and Inkeep, token reuse risk is low. Validate if present, don't require. | Leaning: validate if present, don't require |
| Q3 | Altcha PoW difficulty & challenge endpoint rate limits — what maxnumber? What rate limit on challenge generation endpoint? | T | P1 | Yes (Phase 2) | Start with 50K (default). Challenge endpoint: 20/min per IP. Adjust based on abuse data. | Open |
| Q4 | Token lifetime — 24hr for anonymous? 15min for authenticated? | T | P1 | No | Anonymous: 24hr (session-length). Authenticated: follow customer JWT's own `exp`. | Leaning: 24hr anon, respect customer exp |
| Q5 | Rate limit tiers — what are the exact limits per auth method? | P/T | P1 | Yes (Phase 2) | Define concrete numbers. Anonymous: 50 msgs/hr per sub, 5 conversations/hr. Authenticated: customer-configurable, default 200 msgs/hr. | Open |
| Q6 | Conversation continuity across anonymous→auth boundary — does v1 need `linked_to` annotation? | P | P2 | No | v1: just swap JWT. Conversations under old `sub` are orphaned (acceptable for docs chat). Revisit when customers ask. | Deferred to v1.5 |
| Q7 | Secret rotation — support two active secrets during rollover? | T | P2 | No | Single secret + regenerate for v1. If customer needs zero-downtime rotation, support two active secrets (try both, accept either). Defer unless requested. | Deferred |
| Q9 | Widget behavior when auth is `required` but token invalid — error? hide? degrade? | P | P1 | No | Show error state with customer-configurable message. Don't hide widget (user expects it). | Open |
| Q10 | Replay protection backend — Redis? In-memory? Multi-server consistency? | T | P1 | Yes (Phase 2) | Redis if available. In-memory with small replay window if not. Challenge TTL = 5min, so replay set is small. | Open |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | The `/run/*` CORS config (`origin: '*'`) is sufficient for widget cross-origin requests | HIGH | Already deployed and working | N/A | Active |
| A2 | `conversations.userId` column can hold anonymous `sub` values (`anon_uuid`) without breaking existing queries | MED | Verify no existing code filters on userId format | Before Phase 1 | Active |
| A3 | Altcha's altcha-lib works in Bun runtime (agents-api uses Bun) | MED | Test import + createChallenge/verifySolution in Bun | Before Phase 2 | Active |
| A4 | Redis is available in production for replay tracking | MED | Check infra. Fallback: in-memory with TTL (acceptable for single-server, lossy for multi-server) | Before Phase 2 | Active |
| A5 | Customer dashboard (agents-manage-ui) can be extended with auth config UI without major refactor | HIGH | Existing project settings pattern is extensible | Before Phase 3 | Active |

---

## 13) Phases & Rollout Plan

### Phase 1: Anonymous Sessions

**Goal:** Public end-users can use the chat widget with anonymous session JWTs. No customer backend required. No abuse protection yet — just the identity layer.

**Non-goals:** Rate limiting (Phase 2), Altcha PoW (Phase 2), customer-signed JWT (Phase 3), JWKS, dashboard config UI, multi-key rotation.

**In scope:**
- `POST /auth/external/anonymous` — Anonymous JWT issuance (API key in body, server generates `sub`)
- End-user auth middleware (anonymous JWT validation only)
- Widget SDK: automatic anonymous session when no `authenticate` callback
- `end_user_auth_configs` table (schema only, populated via migration with defaults)

**Out of scope:** Per-sub rate limiting (Phase 2), Altcha PoW (Phase 2), customer dashboard UI, authenticated user JWT validation, JWKS caching.

**Blockers:** None.

**Acceptance criteria:**
- [ ] Widget on a customer domain can obtain anonymous session without any customer backend code
- [ ] Existing API key auth continues to work unchanged
- [ ] JWT is JWS, readable in jwt.io, contains `sub`, `tid`, `pid`, `exp`, `type: anonymous`
- [ ] On token expiry, widget auto-creates new anonymous session transparently

**Risks:**
- Without rate limiting or PoW, abuse is unconstrained beyond existing project-level limits → acceptable for initial rollout; Phase 2 closes this quickly.

### Phase 2: Rate Limiting + Altcha PoW Abuse Protection

**Goal:** Add per-user rate limiting and Altcha proof-of-work gate. Rate limits enforce per-sub quotas; PoW makes identity rotation computationally expensive.

**Non-goals:** Customer-signed JWT (Phase 3), JWKS, dashboard config UI.

**In scope:**
- Per-sub rate limiting on `/run/*` endpoints
- `GET /auth/external/challenge` — Altcha challenge issuance
- Update `POST /auth/external/anonymous` to require Altcha proof in body
- Replay protection (Redis or in-memory set with 5min TTL)
- Widget SDK: Altcha solver in Web Worker (~200ms on modern device)

**Out of scope:** Customer dashboard UI, authenticated user JWT validation, dynamic difficulty scaling (Appendix C).

**Blockers:**
- Q3 (PoW difficulty) — resolve with default 50K, adjust post-launch
- Q5 (rate limit numbers) — resolve with conservative defaults
- Q10 (replay backend) — resolve: Redis if available, in-memory fallback
- A3 (altcha-lib in Bun) — verify before implementation

**Acceptance criteria:**
- [ ] Rate limits enforced per JWT `sub` (not just per IP)
- [ ] PoW challenge-solve-verify round-trip works end-to-end
- [ ] Replayed challenges are rejected (403)
- [ ] Challenge expires after 5 minutes
- [ ] Anonymous session creation without valid PoW proof is rejected
- [ ] Widget Altcha flow is transparent to end-user

**Risks:**
- Budget Android PoW solve time >1s at 50K difficulty → mitigation: monitor client-reported solve times, adjust `maxnumber` dynamically
- Corporate NAT causing legitimate users to hit per-IP challenge limits → mitigation: generous initial limit (20/min per IP), monitor 429 rates

### Phase 3: Customer-Authenticated Users (Scenario 2)

**Goal:** Customers can authenticate end-users via HS256 shared secret JWT. Dashboard config UI.

**In scope:**
- Customer-signed JWT validation (HS256) in auth middleware
- `end_user_auth_configs` management API + dashboard UI
- Shared secret generation, storage (encrypted), display in dashboard
- Auth enforcement modes (none/optional/required)
- Widget SDK: `authenticate(callback)` with 401 retry
- Conversations keyed by authenticated `sub`

**Out of scope:** JWKS/OIDC (Phase 4), multi-key rotation, progressive trust.

**Acceptance criteria:**
- [ ] Customer can generate a signing secret in dashboard
- [ ] Customer-signed JWT with `sub` + `exp` is validated correctly
- [ ] Invalid/expired JWT returns structured 401 error
- [ ] Widget re-invokes `authenticate()` on 401 and retries
- [ ] Auth enforcement mode `required` blocks requests without valid JWT
- [ ] Conversations persist across sessions for authenticated users

### Phase 4 (Deferred): OIDC/JWKS

**Deferred until customer demand materializes.** HS256 covers the authenticated use case for v1. If customers need zero-config integration with Auth0/Clerk/Okta (RS256 via JWKS), this phase adds JWKS validation. No architectural changes needed — the middleware already validates JWT, adding a second verification method is additive.

---

## 14) Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Altcha PoW too slow on budget devices | Medium | Users can't start sessions | Monitor solve times, offer fallback difficulty, async loading | Eng |
| HS256 shared secret leaked from customer's backend | Low | Attacker forges user JWTs for that customer | Per-customer blast radius. Regenerate in dashboard. Revoke old secret immediately. | Eng + Customer |
| Inkeep's anonymous JWT secret compromised | Low | Attacker forges anonymous sessions (bypasses PoW) | Rotate secret. Anonymous sessions are low-privilege. Rate limits still enforced per sub. | Eng |
| Corporate NAT → many users share IP → session creation rate limit too strict | Medium | Legitimate users can't create sessions | Start generous (20/hr per IP). Monitor. Consider per-project-key rate limits instead. | Eng |
| Widget bundle size increase from Altcha solver | Low | Slower page load | altcha-lib solver is ~5KB gzipped. Lazy-load on first chat open. | Eng |

---

## 15) Appendices (Documented Deferrals)

### Appendix A: Progressive Trust (v3)

**What we learned:** Progressive trust (new → established → trusted with escalating rate limits) requires DB session state (Approach 3) because trust level must be mutable mid-session. JWE-per-response looked promising as a stateless alternative but has a fatal replay vulnerability — adversarial clients can replay lower-trust tokens to reset counters.

**Why deferred:** v1 with flat rate limits per anonymous JWT is sufficient for launch. Progressive trust becomes valuable when abuse patterns emerge that flat limits can't handle (e.g., slow-burn abuse below rate limits but above normal usage).

**Trigger to revisit:** Abuse data shows patterns where per-session rate limits are insufficient. Customer requests for different trust tiers.

**Implementation sketch:** Add `anonymous_user_sessions` table with `trust_level`, `message_count`, `created_at`. Update trust level based on behavioral signals (varied content, reasonable pacing, engagement). See [progressive-trust-and-jwe.md](~/.claude/reports/altcha-proof-of-work-integration/evidence/progressive-trust-and-jwe.md).

### Appendix B: Conversation History Linking (v1.5)

**What we learned:** Four patterns exist for anonymous-to-authenticated transition: entity merge (Intercom), in-place enrichment (Ada, HubSpot), token-based linking (Crisp), no merge (Botpress). Entity merge is overkill — Inkeep is a copilot, not a CRM.

**Why deferred:** Anonymous doc-site conversations are ephemeral by nature. Losing 2-3 anonymous questions when logging in is acceptable for v1. Customers haven't requested this.

**Trigger to revisit:** Customer requests conversation continuity across login boundary. Product decision to show "your recent questions" after login.

**Implementation sketch:** Add `linked_to` column on conversations table. When authenticated JWT arrives, annotate any conversation matching the previous anonymous `sub` with `linked_to = authenticated_sub`. Query expansion: `WHERE userId = ? OR linked_to = ?`.

### Appendix C: Dynamic Altcha Difficulty (v2)

**What we learned:** Altcha difficulty can scale with abuse signals. Default 50K → 500K for detected abuse patterns → 5M for rate limit exhaustion (effectively blocks automated abuse).

**Why deferred:** Static difficulty is sufficient for launch. Dynamic difficulty requires abuse signal detection infrastructure.

**Trigger to revisit:** Automated abuse at scale that static PoW + rate limits can't handle.

**Implementation sketch:** Track session creation rate by IP and by project. When rate exceeds threshold, increase `maxnumber` in challenge response. See [difficulty-calibration.md](~/.claude/reports/altcha-proof-of-work-integration/evidence/difficulty-calibration.md).

---

## References

### Research Reports
- [`~/.claude/reports/embedded-widget-end-user-auth/`](~/.claude/reports/embedded-widget-end-user-auth/) — 13-dimension study of how 20+ platforms handle embedded widget end-user authentication. Covers HS256, JWKS, HMAC, OAuth, webhook patterns. Cross-platform comparison matrices. Deep dives on Intercom, Algolia, PostHog account linking mechanics.
- [`~/.claude/reports/altcha-proof-of-work-integration/`](~/.claude/reports/altcha-proof-of-work-integration/) — Altcha PoW protocol mechanics, difficulty calibration, four-layer abuse protection, three identity approaches compared, JWT vs JWE analysis, progressive trust model.
- [`~/.claude/reports/sts-patterns-external-users/`](~/.claude/reports/sts-patterns-external-users/) — How 9 platforms (n8n, LangGraph, CrewAI, Infisical, Keycloak, Nango, Meilisearch, Typesense, Temporal) handle credential auth. Public client patterns (Meilisearch tenant tokens, Typesense scoped keys). STS/token exchange patterns.

### Key Evidence Files (Primary Sources)
- `embedded-widget-end-user-auth/evidence/cross-origin-token-transport.md` — Why cookies fail, Bearer tokens work
- `embedded-widget-end-user-auth/evidence/anonymous-visitor-identification.md` — 20-platform anonymous ID comparison
- `embedded-widget-end-user-auth/evidence/intercom-account-linking-mechanics.md` — Entity merge deep dive
- `embedded-widget-end-user-auth/evidence/algolia-account-linking-mechanics.md` — Dual-token model (no merge)
- `embedded-widget-end-user-auth/evidence/posthog-account-linking-mechanics.md` — Full server-side merge
- `embedded-widget-end-user-auth/evidence/jwks-validation-mechanics.md` — JWKS/RS256 validation algorithm
- `embedded-widget-end-user-auth/evidence/jwt-signing-mechanics-deep-dive.md` — Per-platform JWT minting
- `altcha-proof-of-work-integration/evidence/three-approach-comparison.md` — Identity approach tradeoffs
- `altcha-proof-of-work-integration/evidence/difficulty-calibration.md` — PoW timing benchmarks
- `sts-patterns-external-users/evidence/meilisearch-api-keys-tenant-tokens.md` — Public client token pattern
- `sts-patterns-external-users/evidence/typesense-scoped-keys.md` — HMAC scoped keys

### Internal Codebase References
- `agents-api/src/middleware/runAuth.ts` — Current run API auth middleware (integration point)
- `agents-api/src/createApp.ts` — CORS configuration, middleware ordering
- `agents-core/src/db/runtime/runtime-schema.ts` — API keys table, conversations table (userId column)
- `agents-core/src/utils/temp-jwt.ts` — Existing JWT signing/verification utilities
- `agents-core/src/utils/apiKeys.ts` — API key generation and validation
- `agents-core/src/auth/auth.ts` — Better-Auth configuration (session auth, not end-user auth)
