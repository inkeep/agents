# App Credentials & End-User Authentication — Spec

**Status:** Final (Phase 1 — Revised)
**Owner(s):** Edwin / Andrew
**Last updated:** 2026-03-05
**Links:**
- Prior proposal: External End-User Authentication PROPOSAL (in conversation)
- Research: `~/.claude/reports/embedded-widget-end-user-auth/`
- Research: `~/.claude/reports/altcha-proof-of-work-integration/`
- Evidence: `./evidence/` (spec-local findings)

---

## 1) Problem Statement

- **Who is affected:**
  1. **End-users** of customer-deployed chat widgets, MCP endpoints, and API integrations
  2. **Customer developers** integrating Inkeep agents into their products
  3. **Inkeep platform** — auth infrastructure, runtime, and manage UI

- **What pain / job-to-be-done:**
  Today, the sole mechanism for authenticating external access to agents is a flat API key (`sk_<publicId>.<secret>`) that binds to a single agent. This creates multiple problems:
  1. **No identity:** All end-users share one key. No per-user conversation history, personalization, or action authorization.
  2. **No access control per channel:** The same API key model is used for a web widget, a backend API call, and an MCP endpoint — but these channels have different trust levels, domain restrictions, and user models.
  3. **No abuse protection:** Client-side-exposed keys (web widget) have no per-user rate limiting, no PoW gate, no domain restriction.
  4. **Rigid agent binding:** One key = one agent. Customers deploying multi-agent projects need multiple keys and manual routing.
  5. **Fragmented integration model:** Slack and GitHub have their own auth/config systems in separate tables, disconnected from the API key model. Adding Discord, MCP, or other channels means more one-off tables.
  6. **Parallel internal auth paths:** The platform maintains two separate JWT auth mechanisms — `tryTempJwtAuth` for playground/copilot and `tryAppCredentialAuth` for external surfaces. Playground and copilot bypass the real auth path, so issues only surface when customers deploy to production.

- **Why now:**
  Customers need personalized copilot experiences (conversation history, user-specific context). The widget needs abuse protection before scaling. New channel types (Discord, MCP, support copilot) are on the roadmap — each will need auth configuration. Consolidating internal and external auth paths eliminates "works in playground but breaks in production" bugs and reduces auth surface area.

- **Current workaround(s):**
  - Customers pass user context as unverified metadata
  - No abuse protection beyond project-level rate limits
  - No conversation continuity across sessions
  - Each integration type has its own auth mechanism

---

## 2) Goals

- **G1:** Replace flat API keys with polymorphic **App Credentials** that encode channel type and type-specific configuration (domains, agent access, anonymous policy, rate limits).
- **G2:** Enable per-user identity for end-users — anonymous (server-issued) and authenticated (customer-signed JWT) — to support conversation history, personalization, and per-user rate limiting.
- **G3:** Provide a clean, unified model for all external access channels (Web Client, API, Trigger, MCP, Slack, Discord, Support Copilot) while respecting that some channels (Slack, GitHub) have complex integration-specific config.
- **G4:** Support conversation continuity — conversations keyed by `(tenantId, projectId, endUserId)` with history retrieval for authenticated users.
- **G5:** Cross-origin safe (widget on `docs.customer.com` → API on `api.inkeep.com`) in all browsers.
- **G6:** Eliminate separate internal auth paths. All surfaces — including playground and copilot — use the app credential path (`tryAppCredentialAuth`). No bypasses, no `tryTempJwtAuth`.

---

## 3) Non-Goals

- **NG1:** Internal multi-tenant auth (Better-Auth, SSO, SAML) — already handled.
- **NG2:** Outbound credential management for agent tool calls (OAuth tokens for calling customer APIs) — separate concern.
- **NG3:** Widget UI/UX for auth flows — separate spec.
- **NG4:** Progressive trust / dynamic rate limiting — documented deferral.
- **NG5:** OIDC/JWKS validation — HS256 sufficient for v1.
- **NG6:** Migrating existing Slack/GitHub work app config into the app credential table — they keep their existing tables.

---

## 4) Personas / Consumers

| Persona | Description | Primary scenario |
|---------|-------------|-----------------|
| **P1: Anonymous visitor** | End-user on `help.customer.com`. Not logged in. Customer may not have user accounts. | Web Client app with anonymous access enabled |
| **P2: Authenticated end-user** | End-user on `app.customer.com` logged into customer's app. | Web Client or Support Copilot app with customer-signed JWT |
| **P3: Customer developer** | Integrates `@inkeep/agents-ui` or API into their product. Configures apps in dashboard. | Creates and configures App Credentials |
| **P4: Backend integration** | Customer's server calling Inkeep API programmatically. | API-type App Credential |
| **P5: Inkeep platform** | `api.inkeep.com` — validates credentials, enforces policies, routes to agents. | All scenarios |
| **P6: Playground tester** | Dashboard user testing agents via "Try It" panel. Tests against real app credentials. | Playground test-session with selectable app credential and auth mode |
| **P7: Copilot user** | Dashboard user chatting with the Inkeep copilot. Standard `web_client` app (dogfooding). | Copilot as `web_client` app with `allowedDomains: ["app.inkeep.com"]` |

---

## 5) User Journeys

### Journey 1: Customer Creates a Web Client App

```
1. Customer logs into Inkeep dashboard
2. Navigates to Project → Apps
3. Clicks "Create App" → selects "Web Client"
4. Configures:
   - Name: "Docs Widget"
   - Allowed agents: [support-agent, docs-agent]
   - Allowed domains: [help.customer.com, docs.customer.com]
   - Anonymous access: Enabled
   - Captcha: Enabled (PoW)
5. System generates an app ID (publishable, like `app_<id>`)
6. Customer adds to widget: InkeepWidget.create({ appId: "app_..." })
7. Widget users can chat anonymously or with customer-signed JWT
```

### Journey 2: Anonymous End-User Chats via Web Widget

```
1. Visitor loads help.customer.com
2. Widget initializes, sends appId to API
3. API validates appId → loads app config (web_client type)
4. API checks: anonymous access enabled? domain allowed?
5. API issues anonymous session:
   a. Access token JWT (15m TTL): { sub: "anon_<uuid>", type: "anonymous", ... }
   b. Refresh token (7d TTL): opaque token for obtaining new access tokens
6. Widget stores both tokens in sessionStorage
7. Widget uses access token for all subsequent requests
8. Conversations created with userId = "anon_<uuid>"
9. On access token expiry (or 401):
   a. Widget calls POST /api/auth/apps/{appId}/token/refresh with refresh token
   b. API validates refresh token → issues new access token (same sub)
   c. Identity preserved — user keeps same anon_<uuid> across refreshes
10. On refresh token expiry (7d) → full re-auth, new anonymous identity
```

### Journey 3: Authenticated End-User with Conversation History

```
1. User logs into app.customer.com
2. Customer's backend signs JWT: jwt.sign({ sub: "u123", email: "..." }, SHARED_SECRET)
3. Widget initialized with authenticate callback
4. Widget sends: Authorization: Bearer <customer-jwt>, X-Inkeep-App-Id: <appId>
5. API validates appId → loads config → validates JWT with customer's secret
6. Conversations keyed by (tenantId, projectId, "u123")
7. User sees conversation history across sessions
8. On 401, widget re-invokes authenticate() callback
```

### Journey 4: Customer Creates an API App Credential

```
1. Customer creates "API" type app in dashboard
2. Configures: allowed agents, rate limits
3. System generates a secret key (like current sk_<id>.<secret>)
4. Customer uses in backend: Authorization: Bearer <secret>
5. No end-user identity (server-to-server)
```

### Journey 5: Playground "Try It" Tests Real App Credentials

```
1. Dashboard user navigates to an agent's "Try It" panel
2. UI displays app credentials for the project
3. Tester selects an app credential and auth mode (anonymous or authenticated)
4. UI calls POST /manage/.../apps/{appId}/test-session
   - manage backend validates user has project access
   - manage backend signs a JWT using the app's HS256 secret (or anon secret)
   - domain validation uses the dashboard origin (app.inkeep.com)
5. UI receives test JWT + appId
6. Playground chat requests flow through standard tryAppCredentialAuth path
7. Same auth path as production — no bypasses, no tryTempJwtAuth
```

### Journey 6: Copilot Dogfooding

```
1. On project setup (or first copilot access), system provisions a web_client app:
   - name: "Copilot"
   - allowedDomains: ["app.inkeep.com"]
   - authMode: anonymous_and_authenticated
   - hs256Enabled: true, hs256Secret: <auto-generated>
2. Dashboard user opens copilot panel
3. Manage backend signs a JWT with the copilot app's HS256 secret
   - sub = user's manage session identity
4. Copilot chat requests include X-Inkeep-App-Id + Bearer JWT
5. Requests go through standard tryAppCredentialAuth — same as any web_client
6. No special copilot auth path, no tryTempJwtAuth
```

---

## 6) Requirements

### Functional Requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| **Must** | App Credential CRUD — create, list, update, delete app credentials per project | Dashboard + API. Each credential has a type and type-specific config. | Replaces API key CRUD |
| **Must** | Polymorphic app types — at minimum: `web_client`, `api`, `trigger` | Each type has a distinct config schema validated at create/update time | Start with these 3; others added incrementally |
| **Must** | Web Client config: allowed domains, allowed agent IDs, anonymous access toggle | Domain validated at token issuance (anonymous-session, test-session). Agent access enforced per-request. | Domain check at issuance only — not per `/run/api/chat` request |
| **Must** | Web Client: anonymous session JWT issuance | `POST /api/auth/apps/{appId}/anonymous-session` returns JWT with `sub: anon_<uuid>` | No customer backend needed |
| **Must** | Web Client: customer-signed JWT validation (HS256) | Customer generates secret in dashboard. API validates signature. JWT must have `sub` + `exp`. | Scenario 2 |
| **Must** | Auth enforcement modes per app: `anonymous_only`, `anonymous_and_authenticated`, `authenticated_only` | Config field on web_client apps. Enforced in middleware. | Maps to prior spec's none/optional/required |
| **Must** | Multi-agent access per credential | App credential config includes list of allowed agent IDs. Request must specify which agent. | Replaces 1-key-1-agent model |
| **Must** | Auth middleware integration | New app credential auth path in runAuth.ts priority chain | Must not break existing auth paths during migration |
| **Must** | Conversation userId population | When end-user identity is available, set `conversations.userId` | Plumbing exists, needs wiring |
| **Should** | Per-user conversation history API | Authenticated end-users can list their past conversations | New endpoint or param on existing list endpoint |
| **Should** | Per-user rate limiting | Rate limits enforced per JWT `sub`, not just per app credential | Abuse prevention for anonymous users |
| **Should** | Backward-compatible migration | Existing `sk_` API keys continue to work during transition period | Deprecation path, not hard cutover |
| **Should** | Altcha PoW for anonymous session creation | PoW gate makes identity rotation expensive | Phase 2 — abuse protection |
| **Could** | Callback-based token refresh in widget SDK | `authenticate(tokenCallback)` re-invoked on 401 | UX quality |
| **Must** | Playground test-session endpoint | `POST /manage/.../apps/{appId}/test-session` issues JWT for playground testing against real app credentials | Manage-domain endpoint; requires project access |
| **Must** | Copilot uses standard app credential | Copilot is a `web_client` app with `allowedDomains: ["app.inkeep.com"]`. No special auth bypasses. | Inkeep dogfooding its own auth system |
| **Must** | Eliminate `tryTempJwtAuth` and all related code | Remove temp JWT auth path, temp JWT utils, copilot bypass logic, related env vars and frontend hooks | G6 — unified auth path |
| **Must** | Anonymous session refresh tokens | Anonymous session returns 15m access token + 7d refresh token. `POST .../token/refresh` endpoint for renewal. | Durable anonymous identity |
| **Should** | Durable anonymous identity via refresh tokens in sessionStorage | Widget stores access + refresh tokens in sessionStorage. Refresh preserves `sub` (same `anon_<uuid>`). | Identity survives page reloads within session |
| **Could** | Anonymous-to-authenticated conversation linking | Annotate anonymous conversations with `linked_to` when user authenticates | v1.5 — documented deferral |

### Non-Functional Requirements

- **Performance:** App credential lookup <5ms (indexed by publicId). JWT validation <1ms (HS256).
- **Reliability:** HS256 validation is pure CPU — no external dependencies.
- **Security:** Domain validation at token issuance (anonymous-session, test-session endpoints), not per `/run/api/chat` request. Secrets encrypted at rest. No third-party cookies. Refresh tokens rotated on use.
- **Operability:** Structured auth error responses. `x-request-id` correlation. Auth decision logged with method and result.
- **Migration:** Existing API keys must continue working. Dashboard shows both old keys and new app credentials during transition.

---

## 7) Success Metrics & Instrumentation

- **Metric 1: App credential adoption** — % of projects using app credentials vs. legacy API keys (target: 80% within 3 months of launch)
- **Metric 2: Anonymous session creation success rate** — >99%
- **Metric 3: Auth validation latency (p99)** — <5ms
- **Metric 4: Conversation history usage** — % of authenticated end-users who access past conversations
- **Metric 5: Playground auth path** — 100% of playground requests go through `tryAppCredentialAuth` (zero through `tryTempJwtAuth`)
- **What we will log:** Auth method (anonymous/hs256/api), app type, validation result, JWT sub (hashed), domain match result, `surface` tag (widget/api/playground/copilot/slack)

---

## 8) Current State (How It Works Today)

### API Keys
- Table: `api_keys` in runtime DB (PostgreSQL)
- Scoped to: `(tenantId, projectId, agentId)` — one key per agent
- No explicit composite primary key (only unique constraint on `publicId` + indexes). Our new `apps` table adds a proper composite PK.
- Format: `sk_<publicId>.<secret>`, scrypt-hashed
- Validation in `runAuth.ts` → returns tenant/project/agent context
- See: `evidence/current-api-key-system.md`

### Auth Middleware
- 5-method priority chain: temp JWT → bypass → Slack JWT → API key → team agent token
- API key auth bypasses SpiceDB entirely (userId starts with "apikey:")
- See: `evidence/current-api-key-system.md`

### SpiceDB
- Principal types: `user` only (no anonymous, no service account, no app credential)
- API key users bypass SpiceDB checks
- See: `evidence/spicedb-schema-and-anonymous-users.md`

### Conversations
- `userId` column exists on the table. `createOrGetConversation()` accepts optional `userId` in its input, but no call site currently passes it — the plumbing is ready, only wiring is needed.
- Primary key: `(tenantId, projectId, id)` — no userId scoping
- `listConversations()` supports optional userId filter
- See: `evidence/conversation-identity-gaps.md`

### Work Apps (Slack, GitHub)
- Each has its own tables, auth flow, and config model
- Slack: workspace-scoped with channel-level agent overrides
- GitHub: installation-scoped with repo access control
- Tools table has `isWorkApp` boolean for work-app-managed tools
- See: `evidence/work-apps-as-app-types.md`

### Playground & Copilot Auth (being removed)
- **`tryTempJwtAuth`:** First in the `runAuth.ts` priority chain. Issues temporary JWTs for playground and copilot use cases. Signs with `INKEEP_TEMP_JWT_SECRET` env var.
- **Temp JWT utils:** `createTempJwt()` / `verifyTempJwt()` helper functions used by manage backend to issue JWTs for playground "Try It" and copilot.
- **Copilot bypasses:** Copilot frontend hooks call manage API to get a temp JWT, then uses it against run API. Bypasses domain validation, app credential lookup, and all web_client auth logic.
- **Impact:** Playground and copilot never exercise the real `tryAppCredentialAuth` path. Auth bugs only surface when customers deploy to production with real app credentials.
- **Removal plan:** All of the above will be eliminated in Phase 1. Playground uses `test-session` endpoint; copilot uses a standard `web_client` app credential.

---

## 9) Proposed Solution (Vertical Slice)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│               END-USER (browser on customer domain)                  │
│                                                                      │
│  Anonymous (web_client)              Authenticated (web_client)      │
│  ┌──────────────────────┐            ┌─────────────────────────┐     │
│  │ Widget sends appId   │            │ Customer backend signs  │     │
│  │ → gets anon JWT      │            │ JWT (HS256 shared secret)│     │
│  │ (+ captcha if on)    │            │                         │     │
│  └──────────┬───────────┘            └───────────┬─────────────┘     │
│             │                                    │                   │
│             ▼                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Widget SDK: InkeepWidget.create({ appId: "app_..." })       │   │
│  │  Every request sends:                                        │   │
│  │    Authorization: Bearer <end-user-jwt>                      │   │
│  │    X-Inkeep-App-Id: <appId>                                  │   │
│  │    X-Inkeep-Agent-Id: <agentId>  (which agent to talk to)   │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ HTTPS (cross-origin, Bearer token)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       api.inkeep.com                                 │
│                                                                      │
│  ┌─ runAuth.ts: App Credential Auth Path ─────────────────────────┐  │
│  │                                                                 │  │
│  │  1. Extract appId (X-Inkeep-App-Id header)                     │  │
│  │  2. Lookup app record by publicId → resolve tenant + project   │  │
│  │  3. Validate end-user JWT:                                     │  │
│  │     - Anonymous: verify with INKEEP_ANON_JWT_SECRET            │  │
│  │     - Authenticated: verify with app's HS256 secret            │  │
│  │  4. Validate agentId against app.allowedAgentIds               │  │
│  │  5. Set execution context: { tenantId, projectId, agentId,     │  │
│  │     endUserId: jwt.sub, authMethod, appId, surface }           │  │
│  │                                                                 │  │
│  │  NOTE: Domain validation happens at token issuance             │  │
│  │  (anonymous-session, test-session), not here.                  │  │
│  │                                                                 │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                              ▼                                       │
│  ┌─ Existing: Agent Runtime ──────────────────────────────────────┐  │
│  │  Receives verified user identity in execution context          │  │
│  │  Conversations keyed by (tenantId, projectId, endUserId)       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Existing: api_keys table (dual-read fallback) ────────────────┐  │
│  │  Existing sk_ keys continue working. Checked if app lookup      │  │
│  │  doesn't match.                                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Model

**New table: `apps`** (runtime DB — PostgreSQL)

```typescript
export const apps = pgTable(
  'apps',
  {
    // Scoping
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    projectId: varchar('project_id', { length: 256 }).notNull(),
    id: varchar('id', { length: 256 }).notNull(),

    // Display
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),

    // Type discriminator
    type: varchar('type', { length: 64 }).notNull(), // 'web_client' | 'api'

    // Agent access (common across all types)
    agentAccessMode: varchar('agent_access_mode', { length: 20 })
      .$type<'all' | 'selected'>()
      .notNull()
      .default('selected'),  // fail-safe: no access unless explicitly granted
    allowedAgentIds: jsonb('allowed_agent_ids')
      .$type<string[]>()
      .notNull()
      .default([]),  // only used when agentAccessMode = 'selected'
    defaultAgentId: varchar('default_agent_id', { length: 256 }),

    // Auth material
    publicId: varchar('public_id', { length: 256 }).notNull().unique(),
    keyHash: varchar('key_hash', { length: 256 }),   // nullable: web_client has no secret
    keyPrefix: varchar('key_prefix', { length: 256 }),

    // Status
    enabled: boolean('enabled').notNull().default(true),

    // Type-specific config (polymorphic JSONB)
    config: jsonb('config').$type<AppConfig>().notNull(),

    // Usage tracking
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),

    // Timestamps
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.projectId, t.id] }),
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [organization.id],
      name: 'apps_organization_fk',
    }).onDelete('cascade'),
    index('apps_public_id_idx').on(t.publicId),
    index('apps_tenant_project_idx').on(t.tenantId, t.projectId),
    index('apps_agent_access_mode_idx').on(t.agentAccessMode),
  ]
);
```

### Type-Specific Config Schemas

```typescript
// ── web_client ──────────────────────────────────────────
type WebClientConfig = {
  type: 'web_client';
  webClient: {
    // Domain restriction
    allowedDomains: string[];            // e.g., ["help.customer.com", "*.customer.com"]

    // End-user auth mode
    authMode: 'anonymous_only' | 'anonymous_and_authenticated' | 'authenticated_only';

    // Anonymous sessions
    anonymousAccessTokenLifetimeSeconds: number;   // default: 900 (15m)
    anonymousRefreshTokenLifetimeSeconds: number;   // default: 604800 (7d)

    // Customer-signed JWT (HS256)
    hs256Enabled: boolean;
    hs256Secret?: string;                // encrypted at rest; only set when hs256Enabled=true

    // Abuse protection
    captchaEnabled: boolean;             // Phase 2: Altcha PoW
  };
};

// ── api ─────────────────────────────────────────────────
type ApiConfig = {
  type: 'api';
  api: {};  // Minimal for v1; rate limits, IP allowlists added later
};

// ── Union ───────────────────────────────────────────────
type AppConfig = WebClientConfig | ApiConfig;
```

### Five Surfaces, One Auth Path

All surfaces use `tryAppCredentialAuth`. No bypasses, no `tryTempJwtAuth`.

| Surface | App Type | Auth Flow | `surface` Tag | Domain Validation |
|---|---|---|---|---|
| **Web Widget** (customer site) | `web_client` | Anonymous session or customer-signed JWT | `widget` | At anonymous-session issuance |
| **API** (customer backend) | `api` | App secret (Bearer token) | `api` | N/A (server-to-server) |
| **Playground** (dashboard "Try It") | Uses project's real app credential | `test-session` endpoint issues JWT | `playground` | At test-session issuance (app.inkeep.com) |
| **Copilot** (dashboard copilot) | `web_client` (dogfooding) | Manage backend signs JWT with app's HS256 secret | `copilot` | At JWT issuance (app.inkeep.com) |
| **Slack** | Work app (own tables) | Slack JWT (existing path) | `slack` | N/A (Slack auth) |

### App Identifier Format

| Type | Client Identifier | Secret | Example |
|---|---|---|---|
| `web_client` | `appId` = `app_<publicId>` | None (public) | `app_a1b2c3d4e5f6` |
| `api` | `appId` = `app_<publicId>` | `appSecret` = `as_<publicId>.<secret>` | `as_a1b2c3d4.ZGVj...` |

- `publicId`: 12 chars, alphanumeric + hyphen (same generation as current API keys)
- `appId` is always safe to expose client-side
- `appSecret` (API type only) follows current `sk_` key format with `as_` prefix, scrypt-hashed

### New API Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/apps/{appId}/anonymous-session` | appId in path + Origin header | Issue anonymous JWT + refresh token for web_client |
| POST | `/api/auth/apps/{appId}/token/refresh` | Refresh token in body | Exchange refresh token for new access token (same `sub`) |
| POST | `/manage/.../apps/{appId}/test-session` | Manage auth (project access) | Issue test JWT for playground against a real app credential |
| POST | `/manage/.../apps` | Manage auth | Create app |
| GET | `/manage/.../apps` | Manage auth | List apps |
| GET | `/manage/.../apps/{id}` | Manage auth | Get app |
| PUT | `/manage/.../apps/{id}` | Manage auth | Update app |
| DELETE | `/manage/.../apps/{id}` | Manage auth | Delete app |

### Anonymous Session JWT

**Issued by:** `POST /api/auth/apps/{appId}/anonymous-session`

**Request:**
```
POST /api/auth/apps/app_a1b2c3d4e5f6/anonymous-session
Origin: https://help.customer.com
Content-Type: application/json
{}
```
Phase 2 adds `{ altcha: "<base64>" }` in body.

**Validation before issuing:**
1. Lookup app by publicId → must exist, must be enabled, must be `web_client` type
2. Check `authMode` allows anonymous (`anonymous_only` or `anonymous_and_authenticated`)
3. Validate `Origin` header against `config.webClient.allowedDomains`
4. (Phase 2) Validate Altcha PoW proof

**Response:**
```json
{
  "token": "eyJ...",
  "expiresAt": "2026-03-03T00:15:00Z",
  "refreshToken": "rt_...",
  "refreshExpiresAt": "2026-03-10T00:00:00Z"
}
```

**Access token JWT payload (signed with `INKEEP_ANON_JWT_SECRET`, HS256, 15m TTL):**
```json
{
  "sub": "anon_01924abc-def0-7890-...",
  "tid": "org_xyz",
  "pid": "proj_abc",
  "app": "app_a1b2c3d4e5f6",
  "iss": "inkeep",
  "iat": 1707464400,
  "exp": 1707465300,
  "type": "anonymous"
}
```

**Refresh token (7d TTL):** Opaque token or signed JWT with `jti` claim. Used only at the `/token/refresh` endpoint. See "Token Refresh" subsection below.

### Authenticated User JWT (Customer-Signed)

**Signed by customer's backend with shared HS256 secret:**
```json
{
  "sub": "user_123",
  "email": "jane@customer.com",
  "exp": 1707580800,
  "iat": 1707580200
}
```

**Validation:**
1. App must have `hs256Enabled: true`
2. Verify HS256 signature with app's `hs256Secret`
3. Validate `exp` not expired
4. Extract `sub` as end-user identity

### Auth Middleware Integration

Updated priority chain in `runAuth.ts`:

```
Current:  JWT temp → bypass → Slack JWT → API key → team agent → fail
Proposed: APP CREDENTIAL → bypass → Slack JWT → API key (legacy fallback) → team agent → fail
```

Note: `tryTempJwtAuth` is removed entirely. App credential auth is now first in the chain.

**App credential auth path (`tryAppCredentialAuth`):**

```typescript
async function tryAppCredentialAuth(c: Context): Promise<AuthResult | null> {
  // 1. Check for appId header
  const appId = c.req.header('x-inkeep-app-id');
  if (!appId) return null;  // Not an app credential request, try next

  // 2. Lookup app by publicId
  const publicId = extractAppPublicId(appId);  // "app_abc" → "abc"
  const app = await getAppByPublicId(runDb)(publicId);
  if (!app || !app.enabled) throw 401;

  // 3. Determine surface from request context
  const surface = deriveSurface(c);  // 'widget' | 'playground' | 'copilot' | 'api'

  // 4. Type-specific validation
  if (app.type === 'web_client') {
    // NOTE: Domain validation happens at token issuance (anonymous-session,
    // test-session), NOT here. The JWT itself is proof of domain validation.

    // Validate end-user JWT (Bearer token)
    const jwt = extractBearerToken(c);
    if (jwt) {
      const identity = validateEndUserJwt(jwt, app);
      return {
        tenantId: app.tenantId, projectId: app.projectId,
        endUserId: identity.sub, surface, ...
      };
    } else if (app.config.webClient.authMode === 'authenticated_only') {
      throw 401;  // JWT required but not provided
    }
    // Anonymous without JWT — only for anonymous session creation endpoint
  }

  if (app.type === 'api') {
    // Validate secret (Bearer token = appSecret)
    const secret = extractBearerToken(c);
    const valid = await validateAppSecret(secret, app.keyHash);
    if (!valid) throw 401;
  }

  // 5. Validate requested agentId against access mode
  const requestedAgentId = c.req.header('x-inkeep-agent-id');
  const agentId = resolveAgentId(requestedAgentId, app);

  // 6. Return auth result
  return {
    tenantId: app.tenantId,
    projectId: app.projectId,
    agentId,
    apiKeyId: `app:${app.id}`,
    appId: app.id,
    appType: app.type,
    surface,
    metadata: { endUserId, authMethod },
  };
}
```

### Conversation userId Wiring

In `agents-api/src/domains/run/routes/chat.ts`, when creating a conversation:

```typescript
await createOrGetConversation(runDbClient)({
  tenantId,
  projectId,
  id: conversationId,
  agentId,
  activeSubAgentId: defaultSubAgentId,
  ref: executionContext.resolvedRef,
  userId: executionContext.metadata?.endUserId,  // NEW: populated from JWT sub
});
```

### Conversation History

**Run API (end-user facing):**

```
GET /run/api/conversations
Authorization: Bearer <end-user-jwt>
X-Inkeep-App-Id: app_a1b2c3d4e5f6
```

The endpoint extracts `sub` from the JWT and returns only that user's conversations. No `userId` parameter needed — the auth mechanism identifies the user.

Response:
```json
{
  "conversations": [
    {
      "id": "conv_abc123",
      "agentId": "support-agent",
      "title": "How to configure webhooks",
      "createdAt": "2026-03-02T10:00:00Z",
      "updatedAt": "2026-03-02T10:05:00Z"
    }
  ]
}
```

**Manage API (admin facing):**

Existing `GET /manage/.../conversations` gains an optional `userId` query param for filtering by end-user. Admins can view any user's conversations within projects they have access to.

### Token Refresh

**Endpoint:** `POST /api/auth/apps/{appId}/token/refresh`

**Request:**
```json
{
  "refreshToken": "rt_..."
}
```

**Validation:**
1. Decode refresh token → extract `sub`, `app`, `tid`, `pid`, `jti`
2. Verify signature (same `INKEEP_ANON_JWT_SECRET`)
3. Verify not expired (7d TTL)
4. (Optional) Check `jti` against deny-list for revoked tokens
5. Issue new access token with same `sub` (identity preserved)
6. Rotate refresh token — issue new refresh token, invalidate old one

**Response:**
```json
{
  "token": "eyJ...(new access token)",
  "expiresAt": "2026-03-03T00:30:00Z",
  "refreshToken": "rt_...(new refresh token)",
  "refreshExpiresAt": "2026-03-10T00:15:00Z"
}
```

**Key properties:**
- Same `sub` (`anon_<uuid>`) preserved across refreshes — durable anonymous identity
- Refresh token rotation: each use invalidates the old refresh token and issues a new one
- Widget stores tokens in `sessionStorage` (survives page reloads, cleared on tab close)
- Compatible with future Better-Auth stateful sessions (same endpoint contract)
- On refresh token expiry → full re-auth required (new anonymous session, new identity)

### Test Session (Playground)

**Endpoint:** `POST /manage/.../apps/{appId}/test-session`

**Auth:** Manage session auth (user must have project `view` or `edit` permission)

**Request:**
```json
{
  "mode": "anonymous",       // or "authenticated"
  "userIdentity": {          // only when mode = "authenticated"
    "sub": "test-user-123",
    "email": "tester@example.com"
  }
}
```

**Behavior:**
1. Validate caller has project access (manage auth)
2. Load app by ID — must exist, must be enabled
3. Validate app supports requested mode (check `authMode` config)
4. Domain validation: validate `Origin` header against app's `allowedDomains` (dashboard is `app.inkeep.com`)
5. Sign JWT:
   - **Anonymous mode:** Sign with `INKEEP_ANON_JWT_SECRET`, `sub: "anon_<uuid>"`, `type: "anonymous"`
   - **Authenticated mode:** Sign with app's `hs256Secret`, `sub` from request, `type: "authenticated"`
6. Return JWT + appId

**Response:**
```json
{
  "token": "eyJ...",
  "expiresAt": "2026-03-03T00:15:00Z",
  "appId": "app_a1b2c3d4e5f6"
}
```

The playground UI then uses this JWT + appId for standard chat requests through `tryAppCredentialAuth` — same path as production.

### Removed Components

The following auth infrastructure is eliminated in Phase 1:

| Component | Location | Replacement |
|---|---|---|
| `tryTempJwtAuth()` | `runAuth.ts` priority chain | `tryAppCredentialAuth()` (app credential is now first) |
| `createTempJwt()` / `verifyTempJwt()` | Temp JWT utility functions | `test-session` endpoint for playground; copilot app's HS256 JWT |
| `INKEEP_TEMP_JWT_SECRET` | Environment variable | `INKEEP_ANON_JWT_SECRET` (for anon sessions) + per-app `hs256Secret` |
| Copilot bypass hooks | Frontend manage UI hooks | Standard `web_client` app credential for copilot |
| Playground temp JWT issuance | Manage API temp JWT endpoint | `POST /manage/.../apps/{appId}/test-session` |

### Widget SDK API

```typescript
// Anonymous (web_client, no customer backend needed)
const widget = InkeepWidget.create({
  appId: "app_a1b2c3d4e5f6",
  agentId: "support-agent",  // which agent to talk to
});

// Authenticated (web_client, customer backend signs JWT)
const widget = InkeepWidget.create({
  appId: "app_a1b2c3d4e5f6",
  agentId: "support-agent",
  authenticate: async () => {
    const res = await fetch("/api/inkeep-token");
    const { token } = await res.json();
    return token;
  },
});
```

**Internal behavior:**
- If `authenticate` provided → call on init and on 401
- If not → request anonymous session from `/api/auth/apps/{appId}/anonymous-session`
- Access token + refresh token stored in `sessionStorage` (survives page reloads, cleared on tab close)
- On 401: attempt refresh via `POST /api/auth/apps/{appId}/token/refresh`
  - If refresh succeeds → retry request with new access token (same anonymous identity)
  - If refresh fails (expired/revoked) → re-request anonymous session (new identity)
  - If `authenticate` callback provided → re-invoke callback instead of refresh

### Customer Dashboard

New section in project settings: **Apps**

```
Project → Apps
├── [+ Create App]
├── Docs Widget (web_client) ✓ Enabled
│   ├── App ID: app_a1b2c3d4e5f6  [Copy]
│   ├── Allowed Agents: support-agent, docs-agent
│   ├── Allowed Domains: help.customer.com, docs.customer.com
│   ├── Auth Mode: Anonymous & Authenticated
│   ├── Captcha: Enabled
│   └── HS256 Secret: [Generate] [Regenerate] [Copy]
├── Backend API (api) ✓ Enabled
│   ├── App ID: app_x9y8z7w6v5u4  [Copy]
│   ├── App Secret: as_x9y8z7w6... [Shown once at creation]
│   └── Allowed Agents: all-agents
└── [Legacy API Keys section — existing sk_ keys, deprecated banner]
```

### Stateless → Stateful Auth Migration Path

Phase 1 uses stateless JWTs for anonymous sessions. The design is explicitly compatible with a future migration to Better-Auth stateful sessions:

**What stays the same across the migration:**
- Widget calls `POST /api/auth/apps/{appId}/anonymous-session` → gets a token
- Widget sends `Authorization: Bearer <token>` + `X-Inkeep-App-Id: <appId>` on every request
- Execution context output: `{ endUserId, authMethod }` — downstream code (conversations, history, rate limiting) doesn't care about the backing

**What changes internally (no client-facing impact):**
- Token format: JWT → opaque Better-Auth session token
- Validation: signature check → `auth.api.getSession()` DB lookup
- User model: no record → `user` table row with `isAnonymous: true`
- Session model: stateless → `session` table row with TTL

**Strategy pattern in auth middleware** supports both during transition:
```typescript
async function validateEndUserToken(token: string, app: AppRecord): Promise<EndUserIdentity> {
  // Phase 1: stateless JWT (fast path)
  if (looksLikeJwt(token)) {
    const claims = verifyAnonymousJwt(token, INKEEP_ANON_JWT_SECRET);
    if (claims) return { sub: claims.sub, type: claims.type };
  }
  // Phase 2+: Better-Auth session (DB lookup)
  const session = await auth.api.getSession({ headers });
  if (session?.user) {
    return { sub: session.user.id, type: session.user.isAnonymous ? 'anonymous' : 'authenticated' };
  }
  // Customer-signed JWT (HS256)
  if (app.config.webClient?.hs256Enabled) {
    const claims = verifyCustomerJwt(token, app.config.webClient.hs256Secret);
    if (claims) return { sub: claims.sub, type: 'authenticated' };
  }
  throw 401;
}
```

**Better-Auth anonymous plugin** (v1.4.19, already available):
- `anonymous()` plugin creates user records with synthetic emails + `isAnonymous: true`
- Sessions follow standard Better-Auth lifecycle (auto-refresh, revocation)
- Built-in account linking: when anonymous user authenticates via real method, accounts merge
- This would solve the conversation history continuity problem (anonymous → authenticated linking) for free

**Considerations for stateful path:**
- User/session table growth at scale (millions of anonymous visitors) — mitigated by TTL cleanup
- Cross-origin: Better-Auth supports Bearer token mode via `bearer()` plugin (already enabled)
- Organization association: anonymous users linked to customer's org via appId → project → tenant mapping

See `evidence/better-auth-anonymous-compatibility.md` for full analysis.

### Alternatives Considered

**Why not a single secret for all app types:**
Web widgets must expose their identifier client-side. A secret on a public web page is not a secret. Domain restriction + captcha + rate limiting provides equivalent protection without pretending a client-side secret adds security. API type retains a secret because it runs server-side.

**Why not model agent access as a join table:**
Cross-DB FK to manage DB (Doltgres) is impossible. JSONB array with GIN index provides both query directions. The number of agents per project is small (<20), so array scanning is negligible. Matches existing patterns (tools config uses JSONB).

---

## 10) Decision Log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D1 | Bearer token (not cookies) for cross-origin auth | T | Yes | **Decided** (from prior proposal) | Third-party cookies blocked in Safari/Firefox | Prior proposal D1 |
| D2 | HS256 customer-minted JWT for authenticated users | T | No | **Decided** (from prior proposal) | Industry standard, simple, sufficient for v1 | Prior proposal D4 |
| D3 | Callback-based token refresh in widget SDK | T | Yes (SDK API) | **Decided** (from prior proposal) | Zendesk pattern, mature design | Prior proposal D5 |
| D4 | Stateless JWT for anonymous sessions (no DB session) | T | No | **Decided** (from prior proposal) | Simpler, sufficient for v1 | Prior proposal D9 |
| D5 | Anonymous sub = `anon_` + server-generated UUIDv7 | T | No | **Decided** (from prior proposal) | Server generates ID, matches industry pattern | Prior proposal D10 |
| D6 | App credential scope: project-level (not agent-level) | T | Yes (schema) | **Decided** | Project-scoped matches web_client, api, trigger, mcp types. Slack/GitHub are tenant-scoped but keep their own tables. | `evidence/work-app-conceptual-model.md` |
| D7 | App credential vs. work app: unified for new types only (Option C) | T | Yes (schema) | **Decided** | Phase 1: `apps` table for web_client, api. Slack/GitHub stay as-is. Phase 2+: create app records for existing work apps to enable unified dashboard. | `evidence/work-app-conceptual-model.md` |
| D8 | Anonymous users NOT in SpiceDB | T | No | **Decided** | App credential config is the authorization boundary for end-users. SpiceDB stays focused on admin/member access control. API keys already bypass SpiceDB. | `evidence/spicedb-schema-and-anonymous-users.md` |
| D9 | `appId` alone sufficient for public clients (no secret for web_client); captcha + domain restriction as protection | T | Yes (API contract) | **Decided** | Matches Intercom/Drift/Zendesk pattern. `appId` = publishable identifier. API type still gets a secret. | `evidence/agent-routing-multi-agent.md` |
| D10 | Polymorphic config: JSONB column with Zod validation | T | Yes (schema) | **Decided** | Matches tools table pattern (`config JSONB` with type discriminator). Per-type Zod schemas for validation. | `evidence/work-apps-as-app-types.md` |
| D11 | App credentials in runtime DB (PostgreSQL) | T | Yes (schema) | **Decided** | Deployment/connection state, not branch-level design. Can migrate to manage DB later if needed. | `evidence/manage-vs-runtime-db-analysis.md` |
| D12 | Agent access: JSONB `allowedAgentIds` array on app credential (not join table) | T | No | **Decided** | Common concern across all types. GIN index for reverse lookups. Cross-DB FK impossible anyway. | `evidence/agent-routing-multi-agent.md` |
| D13 | Migration: dual-read in Phase 1 only; future phases deferred | T | No | **Decided** | Auth middleware checks `apps` first, falls back to `api_keys`. No auto-migration of existing keys yet. | |
| D14 | Agent access: `agentAccessMode: 'all' \| 'selected'` + `allowedAgentIds` when selected | T | No | **Decided** | Matches GitHub repo access pattern (`workAppGitHubProjectAccessMode`). Fail-safe default: `selected` with empty array = no access. Explicit `all` required for full project access. | `evidence/agent-routing-multi-agent.md` |
| D15 | CORS: keep `origin: '*'` for anonymous session endpoint, validate Origin in handler | T | No | **Decided** | Same pattern as `/run/*`. Application-level domain check is the real enforcement. CORS `origin: '*'` avoids DB lookup on preflight. | |
| D16 | Conversation history: Run API auto-scopes by JWT `sub` (no userId param) | P/T | No | **Decided** | Auth mechanism identifies the user. End-user should only see their own conversations. Manage API gets optional userId filter for admins. | |
| D17 | Remove `tryTempJwtAuth`; playground and copilot use `tryAppCredentialAuth` | T | Yes | **Decided** | Two parallel JWT auth paths cause "works in playground, breaks in production" bugs. Consolidation eliminates this class of issues entirely. | |
| D18 | Copilot is a standard `web_client` app credential (Inkeep dogfooding) | P/T | Yes | **Decided** | Copilot should exercise the same auth path as customers. `web_client` with `allowedDomains: ["app.inkeep.com"]` and HS256. No special bypasses. | |
| D19 | Playground tests real app credentials via `test-session` endpoint | P/T | No | **Decided** | Dashboard user selects a real app credential and auth mode. Manage backend signs JWT using the app's secret. Requests flow through standard `tryAppCredentialAuth`. | |
| D20 | Domain validation at token issuance only, not per-request | T | No | **Decided** | The JWT is proof that domain validation passed at issuance. Per-request Origin checking is redundant (Bearer tokens are not ambient authority) and adds unnecessary latency. | |
| D21 | Durable anonymous identity via refresh tokens (15m access + 7d refresh, sessionStorage) | T | No | **Decided** | Short-lived access tokens limit exposure. Refresh tokens preserve identity across page reloads within a session. sessionStorage clears on tab close. Compatible with future Better-Auth stateful sessions. | |
| D22 | Updated `runAuth.ts` priority chain: app credential → bypass → Slack JWT → API key (legacy) → team agent → fail | T | Yes | **Decided** | App credential auth is the primary path. `tryTempJwtAuth` removed entirely. API key fallback retained for backward compatibility during migration. | |

---

## 11) Open Questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | ~~Should app credentials live in manage DB or runtime DB?~~ | T | P0 | — | → D11: Runtime DB | **Resolved** |
| Q2 | ~~How do existing Slack/GitHub work apps relate to app credentials?~~ | T/P | P0 | — | → D7: Option C (unified for new types only) | **Resolved** |
| Q3 | ~~Agent access: JSONB array or join table?~~ | T | P1 | — | → D12: JSONB `allowedAgentIds` array | **Resolved** |
| Q4 | ~~Migration path for existing API keys?~~ | T | P1 | — | → D13: Dual-read Phase 1 only | **Resolved** |
| Q5 | Altcha PoW difficulty, challenge endpoint rate limits, and replay protection backend | T | P1 | Yes (Phase 2) | From prior proposal Q3, Q10 | Open (Phase 2) |
| Q6 | Per-user rate limit tiers per auth method | P/T | P1 | Yes (Phase 2) | From prior proposal Q5 | Open (Phase 2) |
| Q7 | ~~Should app credentials be tenant-scoped or project-scoped?~~ | T | P0 | — | → D6: Project-scoped | **Resolved** |
| Q8 | ~~Widget SDK API: `appId` as identifier~~ | P | P1 | — | → D9: `appId` alone for web_client, no secret | **Resolved** |
| Q9 | Do we need a "default" app auto-created per project for backward compat? | P | P2 | No | Deferred — existing API keys keep working via dual-read | Open (deferred) |
| Q10 | Conversation history API: how does the end-user retrieve their own conversations? | P/T | P1 | No (Phase 1) | Run API auto-scopes by JWT `sub`. Manage API gets optional userId filter for admins. | **Resolved** |
| Q11 | HS256 secret storage: encrypted column in `config` JSONB, dedicated column, or external vault (credentialReferences)? | T | P0 | **Yes (Phase 1)** | Now Phase 1 blocking — copilot needs HS256 to sign JWTs. Must resolve before implementation. | Open |
| Q12 | ~~`INKEEP_ANON_JWT_SECRET` env var provisioning and rotation~~ | T | P0 | — | Env var + 256-bit secret. Rotation = redeploy, 24h max disruption. Dual-key later if needed. | **Resolved** |
| Q13 | ~~Wildcard domain support~~ | P/T | P1 | — | Yes. Support `*.customer.com`. Reject bare `*`. | **Resolved** |
| Q14 | ~~CORS for anonymous session endpoint~~ | T | P0 | — | Keep `origin: '*'` (same as `/run/*`). App handler validates Origin against allowedDomains for real enforcement. | **Resolved** |
| Q15 | ~~Empty `allowedAgentIds` semantics~~ | P | P0 | — | → D14: `agentAccessMode: 'all' \| 'selected'` + `allowedAgentIds` when selected. GitHub access mode pattern. | **Resolved** |
| Q16 | Refresh token storage mechanism: stateless JWT with `jti` + deny-list, or opaque token with server-side lookup? | T | P1 | Yes (Phase 1) | Stateless JWT is simpler but harder to revoke. Opaque token requires storage. | Open |
| Q17 | Copilot app credential provisioning: auto-created on project setup, seed script, or manual creation? | P | P1 | Yes (Phase 1) | Must exist before copilot can work. Auto-creation is most reliable. | Open |
| Q18 | Test-session endpoint: configurable token lifetime, or fixed short TTL (e.g., 15m)? | P | P2 | No | Fixed TTL is simpler. Configurable adds flexibility for longer test sessions. | Open |
| Q19 | Transition period for `tryTempJwtAuth` removal: feature flag, phased rollout, or hard cutover? | P/T | P1 | Yes (Phase 1) | Must ensure no breakage. Feature flag allows rollback. Hard cutover is simpler. | Open |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `conversations.userId` can hold anonymous `sub` values without breaking existing queries | MED | Verify no code filters on userId format | Before Phase 1 | Active |
| A2 | Existing API key auth can coexist with new app credential auth in the same middleware | HIGH | runAuth.ts is a priority chain — additive | Before Phase 1 | Active |
| A3 | CORS `origin: '*'` on `/run/*` is sufficient for widget cross-origin | HIGH | Already deployed and working | N/A | Active |
| A4 | Altcha `altcha-lib` works in Bun runtime | MED | Test import in Bun | Before Phase 2 | Active |
| A5 | Manage backend can sign HS256 JWTs without major refactoring | HIGH | `jsonwebtoken` / `jose` already available | Before Phase 1 | Active |
| A6 | `sessionStorage` is sufficient for refresh token persistence (survives page reloads, clears on tab close) | HIGH | Standard browser API, no cross-tab sharing needed | N/A | Active |
| A7 | Removing `tryTempJwtAuth` won't break other auth paths (bypass, Slack JWT, API key, team agent) | HIGH | Priority chain is additive — removing one method doesn't affect others | Before Phase 1 | Active |

---

## 13) Phases & Rollout Plan

### Phase 1: Apps Table + Web Client + Anonymous Sessions + HS256 + Auth Consolidation

**Goal:** Customers can create App credentials in the dashboard. Web Client apps support anonymous end-users with domain restriction. HS256 customer-signed JWT validation is supported. All surfaces — including playground and copilot — use the unified `tryAppCredentialAuth` path. `tryTempJwtAuth` and all related code are removed. Conversations are keyed by end-user identity. Existing API keys continue working via dual-read.

**Non-goals:** Captcha/PoW implementation (config toggle exists but enforcement is Phase 2). Per-user rate limiting. Slack/GitHub unification. API key migration.

**In scope:**
- `apps` table in runtime DB (schema + migration)
- App CRUD routes (manage domain)
- `web_client` and `api` app types with Zod-validated JSONB config
- `appId` / `appSecret` generation (reuse existing key generation utilities)
- Anonymous session JWT issuance endpoint (`POST /api/auth/apps/{appId}/anonymous-session`) with 15m access + 7d refresh tokens
- Token refresh endpoint (`POST /api/auth/apps/{appId}/token/refresh`)
- Domain validation at token issuance (Origin header vs `allowedDomains`)
- HS256 customer-signed JWT validation (moved from Phase 2 — copilot needs it)
- Auth enforcement modes (`anonymous_only`, `anonymous_and_authenticated`, `authenticated_only`)
- App credential auth path in `runAuth.ts` (new `tryAppCredentialAuth`)
- Updated priority chain: app credential → bypass → Slack JWT → API key (legacy) → team agent → fail
- Dual-read fallback to `api_keys` table
- Multi-agent access: `allowedAgentIds` + `x-inkeep-agent-id` header validation
- `conversations.userId` population from JWT `sub`
- Conversation history: list conversations filtered by `endUserId`
- Dashboard UI: Apps section with create/edit/delete
- Widget SDK: `appId` parameter, anonymous session auto-creation, sessionStorage tokens, refresh flow
- **Test-session endpoint** (`POST /manage/.../apps/{appId}/test-session`) for playground
- **Copilot app provisioning** — standard `web_client` app with `allowedDomains: ["app.inkeep.com"]`
- **Removal of `tryTempJwtAuth`**, temp JWT utils, copilot bypass hooks, `INKEEP_TEMP_JWT_SECRET` env var

**Out of scope:** Altcha PoW (Phase 2), per-user rate limiting (Phase 2), Slack/GitHub app records (Phase 3+), API key auto-migration (Phase 3+).

**Blockers:**
- Q11: HS256 secret storage location (encrypted column vs external vault) — **now Phase 1 blocking** (copilot needs HS256)
- Q12: `INKEEP_ANON_JWT_SECRET` env var — needs to be provisioned
- Q16: Refresh token storage mechanism — must decide before implementing token refresh
- Q17: Copilot app credential provisioning strategy — must exist before removing tryTempJwtAuth
- Q19: Transition strategy for tryTempJwtAuth removal — feature flag vs hard cutover

**Acceptance criteria:**
- [ ] Customer can create a `web_client` app in dashboard with domains + agent access
- [ ] Widget initialized with `appId` obtains anonymous JWT (15m) + refresh token (7d) and chats successfully
- [ ] Anonymous identity preserved across token refreshes (same `anon_<uuid>`)
- [ ] Domain validation rejects requests from non-allowed origins at token issuance
- [ ] HS256 customer-signed JWT validation works end-to-end
- [ ] Auth enforcement modes enforced (`authenticated_only` rejects anonymous)
- [ ] Multi-agent: client specifies `x-inkeep-agent-id`, validated against allowlist
- [ ] `conversations.userId` populated with anonymous `sub` (e.g., `anon_01924abc...`)
- [ ] Authenticated end-user can list their conversation history
- [ ] Existing `sk_` API keys continue working (dual-read)
- [ ] Customer can create an `api` type app with secret, usable from backend
- [ ] Playground "Try It" uses test-session endpoint against real app credentials
- [ ] Copilot uses standard `web_client` app credential (no bypasses)
- [ ] `tryTempJwtAuth` fully removed — 100% of playground/copilot requests go through `tryAppCredentialAuth`
- [ ] `surface` tag logged on all auth decisions
- [ ] `pnpm check` passes

**Risks + mitigations:**
- Dual-read adds latency (two lookups on miss) → app lookup is indexed by publicId, sub-ms; API key fallback only on app miss
- Anonymous session JWT signing key rotation → use env var; document rotation procedure
- Removing `tryTempJwtAuth` breaks playground/copilot during transition → feature flag or phased rollout (Q19); copilot app must be provisioned first (Q17)
- Refresh token rotation race conditions → at-most-once semantics; old refresh token invalidated on use; grace period for concurrent requests

### Phase 2 (documented scope, not yet planned in detail)
- Altcha PoW for anonymous session creation (captchaEnabled enforcement)
- Per-user rate limiting (per JWT `sub`)

### Phase 3+ (documented deferrals — see Appendices)
- Slack/GitHub unified app records
- API key auto-migration
- Progressive trust
- Anonymous-to-authenticated conversation linking
- OIDC/JWKS
- Discord, MCP, Support Copilot, Trigger app types

---

## 14) Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Migration breaks existing API key users | Medium | High | Dual-read period; existing `sk_` keys continue working | Eng |
| Polymorphic config becomes a "god table" | Medium | Medium | Strict per-type validation schemas; consider separate config tables if types diverge too much | Eng |
| Domain validation bypass via proxy/spoofed headers | Low | Medium | Origin check is defense-in-depth, not sole auth. JWT + rate limits are primary. | Eng |
| Conversation history query performance at scale | Low | Medium | Index on (tenantId, projectId, userId). Pagination. | Eng |
| Removing `tryTempJwtAuth` breaks playground/copilot during transition | Medium | High | Feature flag or phased rollout (Q19). Copilot app must be provisioned before removal. Test-session endpoint must be deployed before playground migration. | Eng |
| Copilot app misconfiguration (wrong domains, wrong HS256 secret) | Low | Medium | Auto-provisioning with known-good defaults. Health check on copilot app at startup. | Eng |
| Refresh token rotation race conditions (concurrent requests) | Medium | Low | Grace period: old refresh token accepted for ~30s after rotation. At-most-once semantics with `jti` tracking. | Eng |

---

## 15) Appendices (Documented Deferrals)

### Appendix A: Progressive Trust (from prior proposal)
See prior proposal Appendix A. Deferred — flat rate limits sufficient for v1.

### Appendix B: Anonymous-to-Authenticated Conversation Linking
See prior proposal Appendix B. Deferred — in-place enrichment with `linked_to` column when customer demand materializes.

### Appendix C: Stateful Anonymous Auth via Better-Auth

**What we learned:** Better-Auth v1.4.19 has a built-in `anonymous()` plugin that creates user+session records without requiring email/password. The interface contract (Bearer token transport, execution context shape) is stable across stateless→stateful migration. The anonymous plugin also provides account linking for free — when an anonymous user later authenticates, accounts merge automatically.

**Why deferred:** Stateless JWT is simpler for Phase 1 — no DB writes on session creation, no user table pollution, no cleanup jobs. The stateful path adds value when revocation, progressive trust, or account linking become requirements.

**Trigger to revisit:** Need for session revocation (ban an abusive anonymous user), progressive trust (trust level stored in session), or customer demand for anonymous→authenticated conversation continuity.

**Implementation sketch:** Add `anonymous()` plugin to auth config. Add `isAnonymous` boolean to user table. Anonymous session endpoint internally calls `auth.signIn.anonymous()` instead of signing a JWT. Auth middleware adds Better-Auth session validation path alongside JWT validation.

### Appendix D: OIDC/JWKS Support
HS256 covers v1. Add RS256/JWKS when customers need zero-config Auth0/Clerk/Okta integration.

### Appendix E: Discord, MCP, Support Copilot App Types
The polymorphic model supports these. Define type-specific schemas when each channel is built. Not blocking Phase 1.

### Appendix F: Eliminated Auth Infrastructure (Phase 1)

The following components are removed as part of the auth consolidation (D17, D22):

| Component | What it does today | Why removed | Replacement |
|---|---|---|---|
| `tryTempJwtAuth()` in `runAuth.ts` | First in priority chain. Validates temp JWTs issued by manage backend for playground/copilot. | Bypasses real app credential auth path. Creates "works in playground, breaks in production" class of bugs. | `tryAppCredentialAuth()` handles all surfaces. |
| `createTempJwt()` utility | Signs temporary JWTs with `INKEEP_TEMP_JWT_SECRET` for playground and copilot. | Separate signing path from app credentials. Not tested against real app config. | Playground: `test-session` endpoint signs with app's own secret. Copilot: manage backend signs with copilot app's HS256 secret. |
| `verifyTempJwt()` utility | Verifies temp JWTs in the run auth middleware. | Counterpart to `createTempJwt()`. No longer needed. | Standard JWT validation in `tryAppCredentialAuth()`. |
| `INKEEP_TEMP_JWT_SECRET` env var | Shared secret for temp JWT signing/verification. | Replaced by per-app HS256 secrets and `INKEEP_ANON_JWT_SECRET`. | Per-app `hs256Secret` (for authenticated JWTs) + `INKEEP_ANON_JWT_SECRET` (for anonymous sessions). |
| Copilot frontend auth hooks | Manage UI hooks that call manage API to get temp JWT, then pass to copilot chat. | Copilot-specific bypass. Doesn't exercise real auth. | Standard `web_client` app credential flow. Manage backend signs JWT with copilot app's HS256 secret. |
| Playground temp JWT endpoint | Manage API endpoint that issues temp JWTs for "Try It" panel. | Issues JWTs that bypass app credential validation. | `POST /manage/.../apps/{appId}/test-session` — tests against real app credentials. |
