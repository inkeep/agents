# App Credentials & End-User Authentication — Spec

**Status:** Final (Phase 1)
**Owner(s):** Edwin / Andrew
**Last updated:** 2026-03-03
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

- **Why now:**
  Customers need personalized copilot experiences (conversation history, user-specific context). The widget needs abuse protection before scaling. New channel types (Discord, MCP, support copilot) are on the roadmap — each will need auth configuration.

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
5. API issues anonymous session JWT: { sub: "anon_<uuid>", ... }
6. Widget uses JWT for all subsequent requests
7. Conversations created with userId = "anon_<uuid>"
8. On token expiry, widget auto-refreshes
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

---

## 6) Requirements

### Functional Requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| **Must** | App Credential CRUD — create, list, update, delete app credentials per project | Dashboard + API. Each credential has a type and type-specific config. | Replaces API key CRUD |
| **Must** | Polymorphic app types — at minimum: `web_client`, `api`, `trigger` | Each type has a distinct config schema validated at create/update time | Start with these 3; others added incrementally |
| **Must** | Web Client config: allowed domains, allowed agent IDs, anonymous access toggle | Referrer/origin header validated on every request. Agent access enforced. | Domain check = CORS + runtime validation |
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
| **Could** | Anonymous-to-authenticated conversation linking | Annotate anonymous conversations with `linked_to` when user authenticates | v1.5 — documented deferral |

### Non-Functional Requirements

- **Performance:** App credential lookup <5ms (indexed by publicId). JWT validation <1ms (HS256).
- **Reliability:** HS256 validation is pure CPU — no external dependencies.
- **Security:** Domain validation on every request (not just CORS). Secrets encrypted at rest. No third-party cookies.
- **Operability:** Structured auth error responses. `x-request-id` correlation. Auth decision logged with method and result.
- **Migration:** Existing API keys must continue working. Dashboard shows both old keys and new app credentials during transition.

---

## 7) Success Metrics & Instrumentation

- **Metric 1: App credential adoption** — % of projects using app credentials vs. legacy API keys (target: 80% within 3 months of launch)
- **Metric 2: Anonymous session creation success rate** — >99%
- **Metric 3: Auth validation latency (p99)** — <5ms
- **Metric 4: Conversation history usage** — % of authenticated end-users who access past conversations
- **What we will log:** Auth method (anonymous/hs256/api), app type, validation result, JWT sub (hashed), domain match result

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
│  │  3. Validate domain (Origin header vs app.config.allowedDomains)│  │
│  │  4. Validate end-user JWT:                                     │  │
│  │     - Anonymous: verify with INKEEP_ANON_JWT_SECRET            │  │
│  │     - Authenticated: verify with app's HS256 secret            │  │
│  │  5. Validate agentId against app.allowedAgentIds               │  │
│  │  6. Set execution context: { tenantId, projectId, agentId,     │  │
│  │     endUserId: jwt.sub, authMethod, appId }                    │  │
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
    anonymousSessionLifetimeSeconds: number;  // default: 86400 (24h)

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
| POST | `/api/auth/apps/{appId}/anonymous-session` | appId in path + Origin header | Issue anonymous JWT for web_client |
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
  "expiresAt": "2026-03-03T12:00:00Z"
}
```

**JWT payload (signed with `INKEEP_ANON_JWT_SECRET`, HS256):**
```json
{
  "sub": "anon_01924abc-def0-7890-...",
  "tid": "org_xyz",
  "pid": "proj_abc",
  "app": "app_a1b2c3d4e5f6",
  "iss": "inkeep",
  "iat": 1707464400,
  "exp": 1707550800,
  "type": "anonymous"
}
```

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
Proposed: JWT temp → bypass → Slack JWT → APP CREDENTIAL → API key (fallback) → team agent → fail
```

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

  // 3. Type-specific validation
  if (app.type === 'web_client') {
    // Validate Origin against allowedDomains
    validateOrigin(c.req.header('Origin'), app.config.webClient.allowedDomains);

    // Validate end-user JWT (Bearer token)
    const jwt = extractBearerToken(c);
    if (jwt) {
      const identity = validateEndUserJwt(jwt, app);
      return { tenantId: app.tenantId, projectId: app.projectId, endUserId: identity.sub, ... };
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

  // 4. Validate requested agentId against access mode
  const requestedAgentId = c.req.header('x-inkeep-agent-id');
  const agentId = resolveAgentId(requestedAgentId, app);
  // resolveAgentId logic:
  //   if app.agentAccessMode === 'all' → accept any agentId (or use defaultAgentId)
  //   if app.agentAccessMode === 'selected' → agentId must be in allowedAgentIds
  //   if no agentId specified → use app.defaultAgentId or first in allowedAgentIds

  // 5. Return auth result
  return {
    tenantId: app.tenantId,
    projectId: app.projectId,
    agentId,
    apiKeyId: `app:${app.id}`,
    appId: app.id,
    appType: app.type,
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
- JWT stored in JS memory (not localStorage)
- On 401: re-authenticate or re-request anonymous session, retry once

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
| Q11 | HS256 secret storage: encrypted column in `config` JSONB, dedicated column, or external vault (credentialReferences)? | T | P1 | No (Phase 2) | Schema should accommodate; implementation in Phase 2 | Open |
| Q12 | ~~`INKEEP_ANON_JWT_SECRET` env var provisioning and rotation~~ | T | P0 | — | Env var + 256-bit secret. Rotation = redeploy, 24h max disruption. Dual-key later if needed. | **Resolved** |
| Q13 | ~~Wildcard domain support~~ | P/T | P1 | — | Yes. Support `*.customer.com`. Reject bare `*`. | **Resolved** |
| Q14 | ~~CORS for anonymous session endpoint~~ | T | P0 | — | Keep `origin: '*'` (same as `/run/*`). App handler validates Origin against allowedDomains for real enforcement. | **Resolved** |
| Q15 | ~~Empty `allowedAgentIds` semantics~~ | P | P0 | — | → D14: `agentAccessMode: 'all' \| 'selected'` + `allowedAgentIds` when selected. GitHub access mode pattern. | **Resolved** |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `conversations.userId` can hold anonymous `sub` values without breaking existing queries | MED | Verify no code filters on userId format | Before Phase 1 | Active |
| A2 | Existing API key auth can coexist with new app credential auth in the same middleware | HIGH | runAuth.ts is a priority chain — additive | Before Phase 1 | Active |
| A3 | CORS `origin: '*'` on `/run/*` is sufficient for widget cross-origin | HIGH | Already deployed and working | N/A | Active |
| A4 | Altcha `altcha-lib` works in Bun runtime | MED | Test import in Bun | Before Phase 2 | Active |

---

## 13) Phases & Rollout Plan

### Phase 1: Apps Table + Web Client + Anonymous Sessions + Conversation History

**Goal:** Customers can create App credentials in the dashboard. Web Client apps support anonymous end-users with domain restriction and optional captcha. Conversations are keyed by end-user identity. Existing API keys continue working via dual-read.

**Non-goals:** Captcha/PoW implementation (config toggle exists but enforcement is Phase 2). Customer-signed JWT (HS256 auth). Per-user rate limiting. Slack/GitHub unification. API key migration.

**In scope:**
- `apps` table in runtime DB (schema + migration)
- App CRUD routes (manage domain)
- `web_client` and `api` app types with Zod-validated JSONB config
- `appId` / `appSecret` generation (reuse existing key generation utilities)
- Anonymous session JWT issuance endpoint (`POST /api/auth/apps/{appId}/anonymous-session`)
- Domain validation (Origin header vs `allowedDomains`)
- App credential auth path in `runAuth.ts` (new `tryAppCredentialAuth`)
- Dual-read fallback to `api_keys` table
- Multi-agent access: `allowedAgentIds` + `x-inkeep-agent-id` header validation
- `conversations.userId` population from JWT `sub`
- Conversation history: list conversations filtered by `endUserId`
- Dashboard UI: Apps section with create/edit/delete
- Widget SDK: `appId` parameter, anonymous session auto-creation

**Out of scope:** Altcha PoW (Phase 2), HS256 customer JWT validation (Phase 2), per-user rate limiting (Phase 2), Slack/GitHub app records (Phase 3+), API key auto-migration (Phase 3+).

**Blockers:**
- Q11: HS256 secret storage location (encrypted column vs external vault) — not blocking Phase 1 (HS256 is Phase 2), but schema should accommodate it
- Q12: `INKEEP_ANON_JWT_SECRET` env var — needs to be provisioned

**Acceptance criteria:**
- [ ] Customer can create a `web_client` app in dashboard with domains + agent access
- [ ] Widget initialized with `appId` obtains anonymous JWT and chats successfully
- [ ] Domain validation rejects requests from non-allowed origins
- [ ] Multi-agent: client specifies `x-inkeep-agent-id`, validated against allowlist
- [ ] `conversations.userId` populated with anonymous `sub` (e.g., `anon_01924abc...`)
- [ ] Authenticated end-user can list their conversation history
- [ ] Existing `sk_` API keys continue working (dual-read)
- [ ] Customer can create an `api` type app with secret, usable from backend
- [ ] `pnpm check` passes

**Risks + mitigations:**
- Dual-read adds latency (two lookups on miss) → app lookup is indexed by publicId, sub-ms; API key fallback only on app miss
- Anonymous session JWT signing key rotation → use env var; document rotation procedure

### Phase 2 (documented scope, not yet planned in detail)
- Altcha PoW for anonymous session creation (captchaEnabled enforcement)
- HS256 customer-signed JWT validation for authenticated end-users
- Per-user rate limiting (per JWT `sub`)
- Auth enforcement modes fully enforced (`authenticated_only` rejects anonymous)

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
