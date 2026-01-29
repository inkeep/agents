
## Table of contents

1. Goals, non-goals, and key decisions
2. User stories
3. System architecture and trust boundaries
4. Authentication primitives (what “auth” means in this system)
5. Flow A — Admin install & reinstall (Nango Connect UI)
6. Flow B — Slack user linking (one-time code)
7. Flow C — Browse Projects/Agents and Run an Agent (as-user JWT)
8. Data contracts (JWT, link codes, Nango connection reference)
9. Persistence model (runtime DB schema)
10. API surface (routes + auth matrix)
11. Middleware, module scaffolding, and mounting
12. Alternatives considered (by decision area)
13. Future work (prioritized, with why/impact/size)

---

## 1) Goals, non-goals, and key decisions

### Goals (V1)

* Let a tenant admin install a first-party Slack “work app” from Inkeep Manage UI.
* Store Slack bot credentials in **Nango** and persist a DB reference so runtime can fetch them.
* Let Slack users link Slack identity → Inkeep identity via a **one-time opaque code**.
* Let linked Slack users browse **Projects → Agents (grouped by Project)** and run an Agent from Slack.
* Ensure runtime execution uses the same Run API surface as the Vercel AI SDK provider: **`POST /run/api/chat`**.
* Introduce a normalized short-lived Slack “as-user” JWT pattern for calling both Manage + Run APIs.

### Not covered in this doc
* Work app defaults/config (default project/agent)
* Exact Slack interactions/UX.
  
### Non-goals (V1)
* Slack Marketplace direct install (server-driven OAuth start).
* Slack token rotation enablement.
* Auto-resume original Slack request after linking.
* Installer pre-link during install (installer links on first use like other users).
* Enterprise Grid support (beyond capturing optional enterprise IDs).
* Third-party work-app clients.

### Key decisions (V1)

* **Slack traffic is handled in `agents-api`**, implemented as a **separate Hono sub-app/module** mounted at a stable prefix for later extraction.
* Standardize backend namespace under **`/work-apps/slack/*`** (top-level surface).
* **Workspace → tenant uniqueness** is enforced (a Slack workspace belongs to exactly one tenant). Tenant → workspace is not capped in V1.
* Link codes are **opaque + one-time + TTL**, storing **only SHA-256 hash**.
* Slack “as-user” access tokens are **short-lived JWTs (HS256, 5m)** minted via a **central issuer** and verified in Manage/Run middleware.

---

## 2) User stories (grounding)

1. **Admin installs Slack work app**
   As an org **owner/admin**, I can install the Slack work app from Manage UI so my Slack workspace is connected.

2. **Admin reinstalls to update permissions**
   As an org **owner/admin**, I can reinstall for the **same tenant** to update scopes/permissions without breaking linked users.

3. **User links on first use**
   As a Slack user, if I’m not linked, I receive a one-time link to connect my Slack identity to my Inkeep account.

4. **User selects agent grouped by project**
   As a linked user, I can browse projects and see agents grouped by project to pick the correct agent.

5. **User runs agent via the same run surface as the SDK provider**
   As a linked user, I can prompt and receive an agent response, with execution routed to `POST /run/api/chat`.

---

## 3) System architecture and trust boundaries

### 3.1 Component diagram

```text
              ┌──────────────────────────────┐
              │        Slack Platform         │
              │  (events + interactions)      │
              └─────────────┬────────────────┘
                            │  Slack-signed HTTP
                            ▼
┌───────────────────────────────────────────────────────────┐
│                        agents-api                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Work Apps: Slack (Hono sub-app)                     │  │
│  │ mounted at /work-apps/slack/*                       │  │
│  │ - install (admin/session)                           │  │
│  │ - link (code create + redeem)                       │  │
│  │ - slack events + interactions (signature-verified)  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  Existing APIs:                                            │
│  - /manage/*  (Better Auth session + manageAuth middleware)│
│  - /run/*     (runAuth middleware)                         │
└───────────────┬───────────────────────────┬───────────────┘
                │                           │
                ▼                           ▼
     ┌──────────────────┐          ┌─────────────────────────┐
     │   Runtime DB      │          │          Nango           │
     │ work_app_slack_*  │          │ Slack bot creds store    │
     └──────────────────┘          └─────────────────────────┘

              ┌──────────────────────────────┐
              │        agents-manage-ui       │
              │ /work-apps/slack (install)    │
              │ /work-apps/slack/link (redeem)│
              └─────────────┬────────────────┘
                            │ Better Auth session
                            ▼
                        agents-api
```

### 3.2 Trust boundaries (important for auth)

* **Browser (Manage UI)**: authenticated via Better Auth session; used for install and link redemption.
* **Slack platform**: authenticated via Slack request signature verification; drives events/interactions.
* **Slack “as-user” calls into Inkeep APIs**: authenticated via short-lived JWT minted internally; used to call Manage + Run as user.

---

## 4) Authentication primitives

This system uses three distinct auth mechanisms; each applies to different routes.

### 4.1 Better Auth session (user/browser)

Used for:

* Admin install flows
* Link redemption

**Authorization rules**

* Install/reinstall endpoints: org role must be `owner|admin`.
* Link redemption: any org member can redeem (current roles: `owner|admin|member`).

### 4.2 Slack signature verification (Slack → Inkeep)

Used for:

* `/work-apps/slack/events`
* `/work-apps/slack/interactions`

Mechanism:

* Verify `X-Slack-Signature` against the raw body using signing secret.
* Enforce replay protection using `X-Slack-Request-Timestamp` (reject if outside ±5 minutes).

(Implementation snippet is in §11.2.)

### 4.3 Slack “as-user” JWT (Inkeep internal token family)

Used when Slack runtime logic needs to call:

* Manage API (list projects, list agents)
* Run API (`POST /run/api/chat`)

Properties:

* Short-lived (5 minutes), HS256
* Verified in `manageAuth.ts` + `runAuth.ts` via schema validation
* Encodes the tenant; callers do **not** send `x-inkeep-tenant-id`

(Contract + middleware rules in §8.)

---

## 5) Flow A — Admin install & reinstall

### 5.1 Sequence diagram

```text
Admin (Manage UI)          agents-api (/work-apps/slack/*)            Nango                    Slack
     |                                |                               |                        |
1    | Open /work-apps/slack          |                               |                        |
2    | POST /install/requests         |                               |                        |
     | (session owner/admin)          |-- create connect session ---->|                        |
     |                                |<-- {connectSessionToken, connectLink?} --|              |
3    | Open Nango Connect UI          |                               |-- OAuth w/ Slack ---->|
4    | Complete Slack OAuth           |                               |<-- success ------------|
     |                                |                               | (connection created)   |
5    | POST /install/complete         |-- fetch connection ---------> |                        |
     | (session owner/admin)          |<-- connection (ids/meta) -----|                        |
6    |                                |-- upsert workspace row ------> Runtime DB             |
7    | Show installed success         |                               |                        |
```

### 5.2 Step-by-step implementation details

#### Step 1–2: Create Nango Connect session

* **Route:** `POST /work-apps/slack/install/requests`
* **AuthN:** Better Auth session
* **AuthZ:** org role is `owner|admin`
* **Action:**

  * Create a Nango Connect session restricted to Slack work app integration (`allowed_integrations: ['work-apps-slack']`).
  * Return a connect session token (`connectSessionToken`) for Manage UI to open Nango Connect UI (optionally also return `connectLink` for convenience).
  * Use best-effort **ephemeral in-memory state** if needed to correlate completion (V1 parity with MCP OAuth stop-gap; see “Known gaps” in §13).

**Nango parameters (from prior art/speclets)**

* `providerConfigKey = 'work-apps-slack'`
* `connectionId` is treated as **opaque** (use the `connectionId` returned by Nango Connect UI and persist it as-is)

**Nango best practices (V1)**

* **Connect session scoping:** include tenant scoping in `end_user.tags` (preferred) so we can reconcile connections later (and for the future webhook backstop).
  * Nango’s connect-session `organization` field is deprecated; treat it as legacy/compat only if used.
* **Environments/config:** ensure Nango is configured with an integration whose ID/unique key matches `providerConfigKey='work-apps-slack'` in each environment (dev/prod).
* **Secrets:** `NANGO_SECRET_KEY` is required anywhere we call Nango server-side (e.g., install completion fetching connection credentials).

#### Step 3–4: Nango Connect UI handles Slack OAuth

* Manage UI opens the Nango Connect UI URL.
* User approves in Slack. Nango creates a connection and returns success to the UI.

**V1 constraint**

* Bot scopes only; do not request Slack user OAuth tokens (`user_scope` not requested).

#### Step 5: Persist install (UI-driven completion)

* **Route:** `POST /work-apps/slack/install/complete`
* **AuthN:** Better Auth session
* **AuthZ:** org role is `owner|admin`
* **Input contract (minimal, V1):**

  * Nango identifiers needed to look up the connection: `providerConfigKey`, `connectionId`

**Backend actions**

1. Fetch the connection from Nango using `{providerConfigKey, connectionId}`.
2. Determine Slack workspace identity (source of truth for persistence):

   * Fetch the Slack bot access token from the Nango connection credentials.
   * Call Slack Web API `auth.test` with the bot token to retrieve:
     * `slackTeamId` (required)
     * optional `slackEnterpriseId` (if present in response / workspace is in an Enterprise org)
3. Enforce **workspace → tenant uniqueness**:

   * if workspace exists for a different tenant: error (must uninstall from the other org first)
4. Upsert `work_app_slack_workspaces` record for this tenant/workspace with:

   * `slackTeamId`, optional enterprise/app IDs
   * `nangoProviderConfigKey='work-apps-slack'`
   * `nangoConnectionId` (persist the opaque Nango `connectionId` returned by Connect)
   * `installedByUserId = initiating Inkeep user`

#### Step 6–8: Reinstall behavior

* Reinstall is the same as install:

  * updates the workspace row (connection ref, installer ID, timestamps)
  * does **not** invalidate existing user mappings
* Cross-tenant reinstall is blocked with a conflict error.

### 5.3 Tables touched

* **Writes:** `work_app_slack_workspaces`
* **Reads:** `work_app_slack_workspaces` (uniqueness enforcement)

### 5.4 Alternatives considered (install)

| Alternative                                                | Pros                                  | Cons                              | Decision                                 |
| ---------------------------------------------------------- | ------------------------------------- | --------------------------------- | ---------------------------------------- |
| Handle Slack traffic in a separate “slack runtime” service | Independent scaling/isolation         | Additional service boundary now   | ❌ Not in V1 (kept in `agents-api`)       |
| Store install state in DB                                  | Serverless-durable                    | Adds Slack-only DB artifact in V1 | ❌ Not in V1 (parity with MCP stop-gap)   |
| Rely on Nango webhook as primary completion                | Durable if UI crashes                 | Additional infra + verification   | ❌ Deferred (required follow-up backstop) |
| UI-driven completion (Manage UI persists on success)       | Matches current MCP pattern; simplest | Edge case if UI doesn’t finish    | ✅ Chosen for V1                          |

---

## 6) Flow B — Slack user linking (one-time opaque code)

### 6.1 Sequence diagram

```text
Slack User        Slack Platform        agents-api (/work-apps/slack/*)         Runtime DB       Manage UI
   |                   |                           |                              |               |
1  | Interact w/ app   |---- POST /events -------->| verify Slack signature       |               |
2  |                   |                           | resolve workspace->tenant    |               |
3  |                   |                           | lookup user mapping -------->|               |
4  |                   |                           | (none)                       |               |
5  |                   |<--- ephemeral msg w/ link -| create link code row ------->|               |
6  | Click link                                                                                   |
7  |--------------------------------------------------------------------------------------------->| /work-apps/slack/link?code=...
8  | (login if needed)                                                             POST /link/redeem (session)
9  |                                                                               validate+write -> mapping + mark used
10 | Return to Slack; retry action
```

### 6.2 Step-by-step implementation details

#### Step 1: Slack inbound request

* **Route:** `POST /work-apps/slack/events` (or `/interactions` depending on UX)
* **AuthN:** Slack signature verification
* **Action:**

  * Extract `(slackTeamId, slackUserId)` from Slack payload (payload specifics vary by Slack event type; not re-specified here).
  * Resolve tenant by looking up installed workspace:

    * query `work_app_slack_workspaces` by `slackTeamId` (scoped by `clientId='work-apps-slack'`)

If no workspace found:

* treat as “not installed” (exact Slack response content is implementation detail).

#### Step 2–4: Determine whether linking is required

* Query `work_app_slack_user_mappings` by `(tenantId, clientId, slackTeamId, slackUserId)`.
* If mapping exists: proceed to “browse/run” (Flow C).
* If mapping does not exist: generate link code.

#### Step 5: Create one-time link code

* **Mechanism:** internal handler calls the same “create link code” domain logic used by `POST /work-apps/slack/link/create` (route exists for testability/extraction; see §10).
* **Data contract:**

  * Generate `code` (opaque random string).
  * Compute `linkCodeHash = sha256(code)` (hex).
  * Insert row into `work_app_slack_account_link_codes` with:

    * tenantId, clientId, slackTeamId, slackUserId, optional enterpriseId
    * `expiresAt = now + 1h`
* **Return to Slack:**

  * Provide Manage UI URL: `/work-apps/slack/link?code=<code>`
  * (Typical Slack UX is an ephemeral message; message modality not spec-critical.)

#### Step 6–9: Redeem link code in Manage UI

* **Manage UI page:** `/work-apps/slack/link?code=...`
* If not logged in: force Better Auth login.
* **Route:** `POST /work-apps/slack/link/redeem`
* **AuthN:** Better Auth session
* **Validation rules:**

  * Look up by `linkCodeHash`
  * Reject if missing, expired, or already used
* **Atomic transaction:**

  * Insert into `work_app_slack_user_mappings` (durable link)
  * Update link code row: set `usedAt`, `usedByUserId`

#### Step 10: User retries in Slack

* Auto-resume is explicitly deferred.

### 6.3 Tables touched

* **Reads:** `work_app_slack_workspaces`, `work_app_slack_user_mappings`
* **Writes:** `work_app_slack_account_link_codes`, `work_app_slack_user_mappings` (+ update link code as used)

### 6.4 Alternatives considered (linking)

| Alternative                                  | Pros                                      | Cons                                                             | Decision   |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ---------- |
| Stateless JWE link token                     | No DB write on create                     | Can’t enforce one-time use cleanly; replay/revocation complexity | ❌ Rejected |
| Long-lived credential stored at link time    | No mint-per-request                       | Long-lived user secrets; revocation/rotation complexity          | ❌ Rejected |
| Opaque code + DB row (`usedAt`, `expiresAt`) | True one-time; simple expiry; audit trail | DB write per link                                                | ✅ Chosen   |

---

## 7) Flow C — Browse Projects/Agents and Run an Agent (as-user JWT)

### 7.1 Sequence diagram

```text
Slack User / Slack UI
        |
        | (linked)
        v
agents-api Slack handlers (/events, /interactions)
  1) Lookup mapping
  2) Mint SlackUser JWT (5m, HS256) via central issuer
  3) Call Manage API as user:
       - GET /manage/api/projects
       - GET /manage/api/projects/{projectId}/agents
  4) On selection (projectId, agentId), call Run API as user:
       - POST /run/api/chat
         headers: x-inkeep-project-id, x-inkeep-agent-id
         Authorization: Bearer <SlackUser JWT>
  5) Run API verifies JWT + checks project permission + runs agent
```

### 7.2 Step-by-step implementation details

#### Step 1: Mapping lookup (durable “session”)

* Query `work_app_slack_user_mappings` by `(tenantId, clientId, slackTeamId, slackUserId)`.
* If missing → Flow B.

#### Step 2: Mint Slack “as-user” JWT (central issuer)

* Slack handler calls centralized issuer function (shared auth layer in monoservice).
* Token must conform to contract in §8 (iss/aud/tokenUse/act/sub/tenantId/slack context).
* TTL is 5 minutes.

#### Step 3: List Projects (as user)

* Slack handler calls existing Manage API endpoint:

  * `GET /manage/api/projects`
* **AuthN:** `Authorization: Bearer <SlackUser JWT>`
* **AuthZ:** enforced by Manage API (existing permission model).

#### Step 4: List Agents grouped by Project

* For each project needed for the Slack UI:

  * `GET /manage/api/projects/{projectId}/agents`
* Slack UI groups agents by their project. Selection captures both `projectId` and `agentId`.

#### Step 5: Run Agent via Run API (as user)

* Slack handler runs the agent through the same surface used by `@inkeep/ai-sdk-provider`:

  * `POST /run/api/chat`
* Required headers:

  * `x-inkeep-project-id: <projectId>`
  * `x-inkeep-agent-id: <agentId>`
* **AuthN:** `Authorization: Bearer <SlackUser JWT>`
* **AuthZ:** Run API must enforce project `use` permission (existing SpiceDB check).
* Tenant is derived from the verified JWT; do **not** send tenant header.

### 7.3 Slack bot token usage (when needed)

If Slack handlers need to call Slack Web API (posting messages, opening modals, etc.), they must fetch the bot token from Nango using the workspace’s stored connection reference (see §8.3).

### 7.4 Alternatives considered (token model)

| Alternative                                                 | Pros                                   | Cons                                                       | Decision   |
| ----------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ---------- |
| Reuse existing “internal service token” with a userId claim | No new token family                    | Blurs service vs user semantics; no explicit delegation    | ❌ Rejected |
| RS256/JWKS-style tokens                                     | Stronger separation                    | Extra key management; not required for internal-only usage | ❌ Rejected |
| Long-lived API key per linked user                          | Simple runtime                         | Long-lived secrets; revocation/rotation complexity         | ❌ Rejected |
| HS256 short-lived JWT with normalized claims                | Matches current infra; clean semantics | Shared-secret model                                        | ✅ Chosen   |

---

## 8) Data contracts

### 8.1 Slack user access token (JWT) contract

**Issuer:** `inkeep-auth`
**Audience:** `inkeep-api`
**tokenUse:** `slackUser`
**act.sub:** `inkeep-work-app-slack`
**TTL:** 5 minutes
**Algorithm:** HS256 (secret: `INKEEP_AGENTS_JWT_SIGNING_SECRET`)

```ts
import { z } from 'zod';

export const SlackAccessTokenPayloadSchema = z.object({
  iss: z.literal('inkeep-auth'),
  aud: z.literal('inkeep-api'),
  sub: z.string().min(1),  // inkeepUserId
  iat: z.number(),
  exp: z.number(),
  jti: z.string().optional(),

  tokenUse: z.literal('slackUser'),

  act: z.object({
    sub: z.literal('inkeep-work-app-slack'),
  }),

  tenantId: z.string().min(1),

  slack: z.object({
    teamId: z.string().min(1),
    userId: z.string().min(1),
    enterpriseId: z.string().min(1).optional(),
  }),
});
```

**Why this shape (and how it generalizes)**

* We need a single short-lived credential that allows Slack runtime to call **both**:
  * Manage API (list projects/agents)
  * Run API (`POST /run/api/chat`)
  without a browser session cookie.
* We model **delegation** explicitly:
  * `sub` is the end user (Inkeep user id)
  * `act.sub` is the acting client (`inkeep-work-app-slack`)
* OAuth alignment:
  * This maps cleanly to OAuth-style “subject vs actor” delegation (token `sub` as the subject, `act.sub` as the actor), similar to OAuth 2.0 Token Exchange semantics.
  * The core JWT claims (`iss`, `aud`, `sub`, `iat`, `exp`, optional `jti`) match standard JWT access-token expectations.
* We include a **token family discriminator**:
  * `tokenUse: 'slackUser'` prevents other JWT families from being accepted accidentally.
* We include **tenant scoping** in the token:
  * `tenantId` is used by middleware to set request context; callers do **not** send tenant headers.
* This should be the role model for future “delegated user” tokens:
  * keep `iss/aud/sub/iat/exp/tokenUse/act.sub/tenantId` consistent
  * add a namespaced context object (like `slack`) only when needed for downstream auth/audit.

**Verification rules (Manage + Run middleware)**

* Signature verifies (HS256).
* Schema validates (including `tokenUse` and `act.sub`).
* Auth context is set:

  * `userId = sub`
  * `tenantId = tenantId`
  * attach Slack metadata (`teamId`, `userId`, `enterpriseId`) for audit/logging.

**Revocation semantics**

* Delete mapping row to unlink.
* Unlink takes effect within token TTL (≤ 5 minutes); no per-request DB revocation check in V1.

---

### 8.2 Link codes (one-time)

* UI sees raw `code` in URL query string.
* DB stores only `sha256(code)` as hex.
* TTL: 1 hour, tracked by `expiresAt`.
* One-time use tracked via `usedAt`.

```ts
import { createHash } from 'crypto';
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
```

---

### 8.3 Nango connection reference

**Provider config key:** `work-apps-slack`
**Connection ID:** opaque Nango `connectionId` (persist the value returned by Nango Connect UI)

At runtime, fetch bot token by:

* reading workspace row to get `{nangoProviderConfigKey, nangoConnectionId}`
* calling Nango `getConnection(providerConfigKey, connectionId)`
* using returned credential access token

(Exact fields in `connection.credentials` depend on Nango auth mode. For OAuth2 connections, use `credentials.access_token` (our `NangoCredentialStore` normalizes this to `token`). Best practice: fetch the connection just before use so Nango can refresh expired tokens.)

---

## 9) Persistence model (runtime DB schema)

All tables are in runtime DB.

* `work_app_slack_workspaces`
* `work_app_slack_account_link_codes`
* `work_app_slack_user_mappings`

**Paste-ready Drizzle schema (unchanged from prior speclets; consolidated here):**
*(kept in one place to avoid repetition; flows reference table/fields by name)*

```ts
import { relations } from 'drizzle-orm';
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { organization, user } from '../auth/auth-schema';

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
};

export const WORK_APP_SLACK_CLIENT_ID = 'work-apps-slack';
export const WORK_APP_SLACK_NANGO_PROVIDER_CONFIG_KEY = 'work-apps-slack';

export const workAppSlackWorkspaces = pgTable(
  'work_app_slack_workspaces',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    id: varchar('id', { length: 256 }).notNull(),

    clientId: varchar('client_id', { length: 256 })
      .notNull()
      .default(WORK_APP_SLACK_CLIENT_ID),

    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),
    slackAppId: varchar('slack_app_id', { length: 256 }),

    nangoProviderConfigKey: varchar('nango_provider_config_key', { length: 256 })
      .notNull()
      .default(WORK_APP_SLACK_NANGO_PROVIDER_CONFIG_KEY),
    nangoConnectionId: varchar('nango_connection_id', { length: 256 }).notNull(), // opaque Nango connectionId

    status: varchar('status', { length: 50 }).notNull().default('active'),
    installedByUserId: varchar('installed_by_user_id', { length: 256 }),

    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('work_app_slack_workspaces_client_team_unique').on(t.clientId, t.slackTeamId),
    index('work_app_slack_workspaces_tenant_idx').on(t.tenantId),
    index('work_app_slack_workspaces_team_idx').on(t.slackTeamId),
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_slack_workspaces_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.installedByUserId],
      foreignColumns: [user.id],
      name: 'work_app_slack_workspaces_installed_by_user_fk',
    }).onDelete('set null'),
  ]
);

export const workAppSlackAccountLinkCodes = pgTable(
  'work_app_slack_account_link_codes',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    id: varchar('id', { length: 256 }).notNull(),

    clientId: varchar('client_id', { length: 256 })
      .notNull()
      .default(WORK_APP_SLACK_CLIENT_ID),

    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackUserId: varchar('slack_user_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),

    linkCodeHash: varchar('link_code_hash', { length: 256 }).notNull(),

    expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { mode: 'string' }),
    usedByUserId: varchar('used_by_user_id', { length: 256 }),

    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('work_app_slack_account_link_codes_hash_unique').on(t.linkCodeHash),
    index('work_app_slack_account_link_codes_lookup_idx').on(
      t.tenantId,
      t.clientId,
      t.slackTeamId,
      t.slackUserId
    ),
    index('work_app_slack_account_link_codes_expires_at_idx').on(t.expiresAt),
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_slack_account_link_codes_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.usedByUserId],
      foreignColumns: [user.id],
      name: 'work_app_slack_account_link_codes_used_by_user_fk',
    }).onDelete('set null'),
  ]
);

export const workAppSlackUserMappings = pgTable(
  'work_app_slack_user_mappings',
  {
    tenantId: varchar('tenant_id', { length: 256 }).notNull(),
    id: varchar('id', { length: 256 }).notNull(),

    clientId: varchar('client_id', { length: 256 })
      .notNull()
      .default(WORK_APP_SLACK_CLIENT_ID),

    slackTeamId: varchar('slack_team_id', { length: 256 }).notNull(),
    slackUserId: varchar('slack_user_id', { length: 256 }).notNull(),
    slackEnterpriseId: varchar('slack_enterprise_id', { length: 256 }),

    inkeepUserId: varchar('inkeep_user_id', { length: 256 }).notNull(),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),

    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    unique('work_app_slack_user_mappings_unique').on(
      t.tenantId,
      t.clientId,
      t.slackTeamId,
      t.slackUserId
    ),
    index('work_app_slack_user_mappings_user_idx').on(t.tenantId, t.inkeepUserId),
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [organization.id],
      name: 'work_app_slack_user_mappings_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.inkeepUserId],
      foreignColumns: [user.id],
      name: 'work_app_slack_user_mappings_user_fk',
    }).onDelete('cascade'),
  ]
);

export const workAppSlackUserMappingsRelations = relations(
  workAppSlackUserMappings,
  ({ one }) => ({
    user: one(user, {
      fields: [workAppSlackUserMappings.inkeepUserId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [workAppSlackUserMappings.tenantId],
      references: [organization.id],
    }),
  })
);
```

---

## 10) API surface (routes + auth matrix)

All routes are under `/work-apps/slack/*`.

| Route                               | Method | AuthN                                                        | AuthZ               | Purpose                                |                                                         |
| ----------------------------------- | -----: | ------------------------------------------------------------ | ------------------- | -------------------------------------- | ------------------------------------------------------- |
| `/work-apps/slack/install/requests` |   POST | Better Auth session                                          | org `owner          | admin`                                 | Create Nango Connect UI session/link                    |
| `/work-apps/slack/install/complete` |   POST | Better Auth session                                          | org `owner          | admin`                                 | UI-driven persistence of install (workspace)            |
| `/work-apps/slack/link/create`      |   POST | Slack signature **or internal-only** (implementation choice) | workspace installed | Create link code row + return link URL |                                                         |
| `/work-apps/slack/link/redeem`      |   POST | Better Auth session                                          | org member          | Redeem link code → mapping             |                                                         |
| `/work-apps/slack/events`           |   POST | Slack signature                                              | workspace installed | Slack Events API receiver              |                                                         |
| `/work-apps/slack/interactions`     |   POST | Slack signature                                              | workspace installed | Slack interactive payload receiver     |                                                         |

> Note on `/link/create`: the spec requires link-code creation is performed “behind the API boundary,” not via direct DB writes from Slack runtime logic. Since Slack traffic is in `agents-api` V1, this can be a route or an internal handler entry point that shares the same domain function; the DB write remains encapsulated.

---

## 11) Middleware, module scaffolding, and mounting

### 11.1 Mounting and route-level auth

* Slack work app is a standalone Hono sub-app mounted at `/work-apps/slack`.
* Slack routes **do not inherit** `/manage/*` or `/run/*` middleware automatically.
* Apply auth explicitly per route:

  * Install routes → Better Auth session + role checks
  * Link redeem → Better Auth session
  * Slack inbound routes → Slack signature verification middleware
  * Manage/Run API calls → Slack JWT verified by manageAuth/runAuth

### 11.2 Slack signature verification middleware

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifySlackSignature(params: {
  signingSecret: string;
  signature: string;
  timestamp: string;
  rawBody: string;
}): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(params.timestamp, 10)) > 300) return false;

  const base = `v0:${params.timestamp}:${params.rawBody}`;
  const digest =
    'v0=' + createHmac('sha256', params.signingSecret).update(base).digest('hex');

  return timingSafeEqual(Buffer.from(digest), Buffer.from(params.signature));
}
```

### 11.3 Manage/Run middleware integration (Slack JWT)

* Add `trySlackUserJwt(token)` to both `manageAuth.ts` and `runAuth.ts`:

  * verify signature using `INKEEP_AGENTS_JWT_SIGNING_SECRET`
  * validate against `SlackAccessTokenPayloadSchema`
  * set auth context `{ userId, tenantId, source:'slack', metadata:{ slackTeamId, slackUserId, slackEnterpriseId } }`

### 11.4 Recommended folder scaffold (extractable module)

```text
work-apps/
  slack/
    src/
      index.ts                    # exports createSlackWorkApp(config)
      app.ts                      # builds Hono instance & registers routes
      routes/
        install.ts
        link.ts
        events.ts
        interactions.ts
      middleware/
        verify-slack-signature.ts
        require-admin.ts
      domain/
        install/
        linking/
        tokens/
      types/
        config.ts
        tokens.ts
```

---

## 12) Alternatives considered (consolidated)

### Credential storage

| Alternative                        | Why not chosen                                    |
| ---------------------------------- | ------------------------------------------------- |
| Store Slack bot token in Inkeep DB | Would require building rotation/refresh ourselves |
| Generic bearer store in Nango      | Less Slack-aware for rotation/refresh             |
| **Nango Slack provider**           | ✅ Chosen (OAuth-aware, rotation-ready later)      |

### Install flow

| Alternative                                  | Why not chosen (V1)        |
| -------------------------------------------- | -------------------------- |
| Direct install (Slack Marketplace style 302) | Deferred to future work    |
| **Nango Connect UI**                         | ✅ Chosen for V1 simplicity |

### Linking mechanism

| Alternative              | Why not chosen                     |
| ------------------------ | ---------------------------------- |
| Stateless JWE            | Can’t enforce one-time use cleanly |
| **Opaque code + DB row** | ✅ Chosen (true one-time + TTL)     |

### Token design

| Alternative                                    | Why not chosen                                       |
| ---------------------------------------------- | ---------------------------------------------------- |
| Reuse internal service token shape             | Semantics unclear; no delegation modeling            |
| RS256/JWKS                                     | Key management overhead not needed for internal-only |
| **HS256 short-lived JWT w/ normalized claims** | ✅ Chosen                                             |

---

## 13) Future work (prioritized, with why/impact/size)

> Sizes are relative: **S / M / L / XL**.

### P0 — Reliability debt (high priority; impacts Slack + MCP parity)

1. **Move ephemeral OAuth/state off in-memory store** (M)
   **Why:** current best-effort in-memory state is **serverless-fragile**; callbacks/completions can fail across instances.
   **Impact:** reduces install flakiness and hard-to-debug “state invalid/expired” failures.
   **Scope:** shared store (DB/Redis/KV) for ephemeral state used in OAuth/connect flows.

2. **Implement Nango webhook reconciliation backstop** (M)
   **Why:** UI-driven completion can miss DB persistence if the browser closes mid-flow, leaving Nango connection created but not recorded.
   **Impact:** prevents “installed in Nango but not in Inkeep” inconsistencies; improves operator/debug experience.
   **Scope:** webhook receiver that:

* verifies `X-Nango-Hmac-Sha256` against raw body (HMAC-SHA256 with Nango environment secret),
* reconciles `type:"auth", operation:"creation|override"` idempotently,
* applied to Slack and retrofitted for MCP Nango flows.

---

### P1 — Product experience

3. **Work app defaults/config** (M)
   **Why:** reduces repeated selection friction.
   **Impact:** faster time-to-first-answer; fewer Slack interactions.
   **Scope:** default `projectId/agentId` storage + Manage UI config + Slack UX fallback.

4. **Auto-resume after linking** (M/L)
   **Why:** current V1 requires users to retry manually.
   **Impact:** improves first-run conversion and perceived polish.
   **Scope:** store original Slack intent context with link code; on redeem either auto-run or show “run last request” action.

---

### P3 — Growth and operations

5. **Direct install (Slack Marketplace)** (M)
   **Why:** required for certain marketplace go-to-market patterns.
   **Impact:** unlocks acquisition channel.
   **Scope:** server-driven OAuth start/callback and then import into Nango; preserve same DB shape.

6. **Cleanup job for expired link codes** (S)
   **Why:** DB hygiene and debugging clarity.
   **Impact:** reduces noise and improves operational simplicity.
   **Scope:** periodic delete of expired/used link codes (optional retention policy).

7. **Token rotation enablement** (M)
   **Why:** reduces blast radius of leaked bot tokens; improves security posture.
   **Impact:** better security; may require operational readiness.
   **Scope:** enable Slack rotation (irreversible), ensure Nango refresh works, add alerting and reinstall recovery.

8. **Nango metadata conventions** (S)
    **Why:** easier debugging and hygiene.
    **Impact:** quicker operator triage.
    **Scope:** set metadata like `kind=work-app`, `app=slack`, plus tenant/team IDs.

10. **Org viewer role support** (M)
    **Why:** future org role expansion needs explicit policy for linking/usage.
    **Impact:** avoids privilege ambiguity.
    **Scope:** define viewer/billing-admin policy; enforce in UI + backend.

11. **Third-party work-app clients** (XL)
    **Why:** external ecosystem possibility.
    **Impact:** large platform expansion.
    **Scope:** client registry, client credentials, allowlisted `act.sub`, governance model, schema evolution.

---

### Spec invariants (keep consistent across implementations)

* Route prefix: `/work-apps/slack/*`
* Nango: `providerConfigKey='work-apps-slack'`; persist Nango `connectionId` as an **opaque** identifier
* Workspace belongs to exactly one tenant; cross-tenant install is blocked
* Link code: opaque; store only SHA-256; TTL 1 hour; one-time via `usedAt`
* Slack user JWT: HS256, 5m TTL; `iss=inkeep-auth`, `aud=inkeep-api`, `tokenUse=slackUser`, `act.sub=inkeep-work-app-slack`
* Run surface: `POST /run/api/chat` with `x-inkeep-project-id` + `x-inkeep-agent-id`; tenant comes from JWT

If you want the next step, I can produce an **implementation checklist ordered by dependency** (routes → DB → middleware → install UI → slack handlers → run path) that maps 1:1 to the flows above without introducing new decisions.

---

## Appendix A) Platform / auth hygiene (detailed)

Goal: reduce token-family sprawl and make token verification deterministic across Manage/Run/Work Apps by standardizing token claims, verification utilities, and migration strategy. The Slack token is the “role model” for delegated user tokens.

### A.1 Token families to standardize

- **Delegated user tokens** (example: Slack “as-user” token)
  - Used when a non-browser client acts on behalf of an Inkeep user.
  - Modeled as: `sub = user`, `act.sub = client`.
- **Service-to-service tokens**
  - Used for internal calls where no end-user is being represented (or user attribution is optional metadata).
- **Ephemeral UI-to-API tokens** (e.g. “playground/temp” style flows)
  - Used to bridge UI sessions to API calls; must be short-lived and audience-scoped.

### A.2 Claim invariants (what we standardize)

Across all JWT families, standardize:

- **Core**: `iss`, `aud`, `iat`, `exp` (and optional `jti`).
- **Discriminator**: `tokenUse` as a required literal enum per token family (prevents token confusion).
- **Delegation**: use `act.sub` when the caller is acting “as” another principal.
- **Tenant scoping**: include `tenantId` for any token that must be tenant-scoped by middleware (avoid tenant headers for auth context).

### A.3 Verification invariants (single verification entrypoint)

Standardize middleware verification to:

1. Extract bearer token.
2. Verify signature + algorithm.
3. Validate payload against a Zod schema for the relevant `tokenUse`.
4. Map claims to a stable auth context shape for downstream code.

### A.4 Migration strategy (“phased verification support”)

- **Phase 1 (additive)**: introduce centralized token constructors and validators; keep accepting legacy tokens where needed, but add explicit `tokenUse` checks for newly minted tokens.
- **Phase 2 (consolidate)**: route all minting through the centralized module; remove ad-hoc signing in feature code.
- **Phase 3 (enforce)**: tighten middleware to reject legacy families that can be replaced, and document the supported token families.

### A.5 Practical outputs of this work

- A single shared module (in `packages/agents-core`) that exposes:
  - `sign*Token()` and `verify*Token()` per family (Slack is the reference family).
  - Shared helpers for `extractBearerToken`, consistent errors, and typed auth context mapping.
- A shared `TokenUse` enum and per-family Zod schemas.
- Tests that ensure:
  - each family rejects wrong `iss/aud/tokenUse`,
  - wrong audience cannot be used against Manage/Run endpoints,
  - and token parsing cannot silently fall through to another family.
