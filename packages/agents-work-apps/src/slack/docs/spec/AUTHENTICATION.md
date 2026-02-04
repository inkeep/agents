# Authentication & Security

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## Token Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TOKEN TYPES                                    │
├───────────────────┬──────────────────┬─────────────┬───────────────────────┤
│ Token             │ Purpose          │ Lifetime    │ Storage               │
├───────────────────┼──────────────────┼─────────────┼───────────────────────┤
│ SlackLinkToken    │ Account linking  │ 10 minutes  │ None (stateless JWT)  │
│ SlackUserToken    │ API auth         │ 5 minutes   │ None (stateless JWT)  │
│ Bot OAuth Token   │ Slack API calls  │ Indefinite  │ Nango (encrypted)     │
│ Session Token     │ Dashboard auth   │ 7 days      │ Cookie/Better Auth    │
└───────────────────┴──────────────────┴─────────────┴───────────────────────┘
```

---

## SlackLinkToken JWT Structure

Used when a user runs `/inkeep link` to connect their Slack account to Inkeep.

```json
{
  "iss": "inkeep-auth",
  "aud": "slack-link",
  "sub": "slack:T0AA0UWRXJS:U0A9WJVPN1H",
  "tokenUse": "slackLinkCode",
  "tenantId": "org_abc123",
  "slack": {
    "teamId": "T0AA0UWRXJS",
    "userId": "U0A9WJVPN1H",
    "enterpriseId": "E0AA0UUL7ML",
    "username": "john.doe"
  },
  "iat": 1706123456,
  "exp": 1706124056
}
```

---

## SlackUserToken JWT Structure

Used for authenticating API calls from Slack to the Run API.

```json
{
  "iss": "inkeep-auth",
  "aud": "inkeep-api",
  "sub": "user_xyz789",
  "tokenUse": "slackUser",
  "act": {
    "sub": "inkeep-work-app-slack"
  },
  "tenantId": "org_abc123",
  "slack": {
    "teamId": "T0AA0UWRXJS",
    "userId": "U0A9WJVPN1H",
    "enterpriseId": "E0AA0UUL7ML",
    "email": "john.doe@acme.com"
  },
  "iat": 1706123456,
  "exp": 1706123756
}
```

> **Note**: The `email` field is included when available from the user mapping (requires `users:read.email` scope).

---

## Signature Verification

All incoming Slack requests are verified using HMAC-SHA256:

```typescript
const sigBase = `v0:${timestamp}:${rawBody}`;
const signature = `v0=${hmacSha256(signingSecret, sigBase)}`;
// Compare with X-Slack-Signature header using timing-safe comparison
```

The verification includes:
- Timestamp check (within 5 minutes)
- HMAC-SHA256 signature validation
- Timing-safe comparison to prevent timing attacks

---

## Permission Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERMISSION HIERARCHY                              │
├────────────────────────────────┬────────────────────────────────────────────┤
│ Operation                      │ Required Role                              │
├────────────────────────────────┼────────────────────────────────────────────┤
│ Install workspace              │ Slack Workspace Admin + Inkeep User        │
│ Uninstall workspace            │ Inkeep Org Admin/Owner                     │
│ Set workspace default agent    │ Inkeep Org Admin/Owner                     │
│ Set channel default agent      │ Inkeep Org Admin/Owner                     │
│ Set personal default agent     │ Any linked Inkeep user                     │
│ Link own Slack account         │ Any Inkeep user                            │
│ Unlink own Slack account       │ Any linked user                            │
│ Run agent queries              │ Any linked user                            │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---

## Better Auth Integration

The Slack Work App builds on top of the existing **Better Auth** authentication system.

### Core Auth Tables (Better Auth - Pre-existing)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BETTER AUTH TABLES                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐    │
│  │      user        │       │   organization   │       │     account      │    │
│  ├──────────────────┤       ├──────────────────┤       ├──────────────────┤    │
│  │ id (PK)          │       │ id (PK)          │       │ id (PK)          │    │
│  │ name             │       │ name             │       │ user_id (FK)     │    │
│  │ email (UK)       │       │ slug (UK)        │       │ provider_id      │    │
│  │ email_verified   │       │ logo             │       │ password (hash)  │    │
│  │ created_at       │       │ created_at       │       │ access_token     │    │
│  └────────┬─────────┘       └────────┬─────────┘       └──────────────────┘    │
│           │                          │                                          │
│           │         ┌────────────────┴────────────────┐                         │
│           │         │            member               │                         │
│           │         ├─────────────────────────────────┤                         │
│           └─────────┤ id (PK)                         │                         │
│                     │ user_id (FK)                    │                         │
│                     │ organization_id (FK)            │                         │
│                     │ role ('owner'|'admin'|'member') │ ◄── Determines perms    │
│                     │ created_at                      │                         │
│                     └─────────────────────────────────┘                         │
│                                                                                 │
│  ┌──────────────────┐                                                           │
│  │     session      │  (Login sessions)                                         │
│  ├──────────────────┤                                                           │
│  │ id, user_id      │                                                           │
│  │ token, expires_at│                                                           │
│  └──────────────────┘                                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Role Hierarchy

| Role | Description | Slack Work App Permissions |
|------|-------------|---------------------------|
| `owner` | Organization owner | Full access - install, configure, delete |
| `admin` | Organization admin | Full access - install, configure workspace/channels |
| `member` | Regular member | Limited - link account, use agents, set personal defaults |

### How Slack Work App Uses Better Auth

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP: Better Auth ↔ Slack Work App                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Better Auth Tables                    Slack Work App Tables                    │
│  ═══════════════════                   ══════════════════════                   │
│                                                                                 │
│  ┌──────────────┐                      ┌─────────────────────────────────────┐  │
│  │ organization │─────tenant_id───────►│ work_app_slack_workspaces          │  │
│  │              │                      │ work_app_slack_user_mappings       │  │
│  │ id = tenant  │                      │ work_app_slack_channel_agent_configs│ │
│  └──────────────┘                      │ work_app_slack_user_settings       │  │
│                                        └─────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────┐                      ┌─────────────────────────────────────┐  │
│  │    user      │─────inkeep_user_id──►│ work_app_slack_user_mappings       │  │
│  │              │                      │   (links Slack user ↔ Inkeep user) │  │
│  │ id = user    │─installed_by_user_id►│ work_app_slack_workspaces          │  │
│  │              │─configured_by_user──►│ work_app_slack_channel_agent_configs│ │
│  └──────────────┘                      └─────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────┐                                                               │
│  │   member     │ ◄── Checked by requireWorkspaceAdmin() middleware            │
│  │              │     to determine if user can manage workspace settings        │
│  │ role field   │                                                               │
│  └──────────────┘                                                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Permission Check Flow

```
1. Request arrives at /work-apps/slack/workspaces/:teamId/settings
                                    │
                                    ▼
2. Session middleware extracts user from cookie/token
   → Looks up session in 'session' table
   → Gets user_id from session
                                    │
                                    ▼
3. Tenant middleware gets organization context
   → Looks up member in 'member' table
   → Gets role (owner/admin/member)
   → Sets c.set('tenantRole', role)
                                    │
                                    ▼
4. requireWorkspaceAdmin() middleware checks role
   ┌────────────────────────────────────────────┐
   │ if (role === 'owner' || role === 'admin') │
   │   → Allow request                          │
   │ else                                       │
   │   → Return 403 Forbidden                   │
   └────────────────────────────────────────────┘
                                    │
                                    ▼
5. Route handler executes (only if authorized)
```

### Key Foreign Keys

| Slack Table | Column | References | Purpose |
|-------------|--------|------------|---------|
| `work_app_slack_workspaces` | `tenant_id` | `organization.id` | Multi-tenancy |
| `work_app_slack_workspaces` | `installed_by_user_id` | `user.id` | Audit trail |
| `work_app_slack_user_mappings` | `tenant_id` | `organization.id` | Multi-tenancy |
| `work_app_slack_user_mappings` | `inkeep_user_id` | `user.id` | **Core link: Slack ↔ Inkeep** |
| `work_app_slack_channel_agent_configs` | `tenant_id` | `organization.id` | Multi-tenancy |
| `work_app_slack_channel_agent_configs` | `configured_by_user_id` | `user.id` | Audit trail |
| `work_app_slack_user_settings` | `tenant_id` | `organization.id` | Multi-tenancy |
