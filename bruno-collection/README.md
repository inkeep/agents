# Inkeep Agents API - Bruno Collection

API testing collection for local development.

## Prerequisites

1. **Bruno** - Download from [usebruno.com](https://www.usebruno.com/)
2. **API Server Running** - Start with `pnpm dev` from the monorepo root
3. **Database Running** - Ensure PostgreSQL/Doltgres is running (via Docker or locally)

## Quick Start

### Step 1: Open the Collection
1. Open Bruno
2. Click "Open Collection" 
3. Select this `bruno-collection` folder
4. Select the **"local"** environment (bottom-left dropdown)

### Step 2: Sign In
1. Open `manage/1-sign-in.bru`
2. Click **Send** - This authenticates and saves your session token automatically
3. You should see a response with `token` and `user` fields

### Step 3: Test the API
Now you can run any request! Try these in order:

```
manage/2-get-session.bru     → Verify your session is active
manage/3-list-projects.bru   → See available projects
manage/4-list-agents.bru     → See agents in the project
```

### Step 4: Test Chat (Run API)
```
manage/8-get-playground-token.bru  → Get a JWT token (auto-saved)
run/2-chat-with-jwt.bru            → Send a chat message!
```

### Step 5: Test Slack Integration
```
slack/0-generate-slack-jwt.bru     → Generate Slack user JWT (auto-saved)
slack/7-workspaces.bru             → List installed workspaces
slack/1-status.bru                 → Check user connection status
run/6-chat-with-slack-jwt.bru      → Chat using Slack auth flow
```

---

## Default Credentials (Local Dev)

```
Email: admin@example.com
Password: adminADMIN!@12
```

## Environment Variables

The `local` environment comes pre-configured with test values:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `baseUrl` | API base URL | `http://localhost:3002` |
| `tenantId` | Tenant ID | `default` |
| `projectId` | Project ID | `test` |
| `agentId` | Agent ID | `test` |
| `userId` | Inkeep user ID | `w19wtLJ3Z1EAO3x812kjmNb7Kwh7FP1i` |
| `slackTeamId` | Slack workspace ID | `T0AA0UWRXJS` |
| `slackEnterpriseId` | Slack enterprise ID | `E0AA0UUL7ML` |
| `slackConnectionId` | Nango connection ID | `E:E0AA0UUL7ML:T:T0AA0UWRXJS` |
| `slackUserId` | Slack user ID | `U0A9WJVPN1H` |
| `slackLinkCode` | Link code from `/inkeep link` | *(empty - get from Slack)* |

### Secret Variables (auto-saved by Bruno)

| Variable | Description | How to Get | Expires |
|----------|-------------|------------|---------|
| `sessionToken` | Session auth token | Run "1. Sign In" in manage/ | 7 days |
| `cookieToken` | Cookie session token | Run "1. Sign In" (auto-extracted) | 7 days |
| `apiKey` | Persistent API key | Run "7. Create API Key" in manage/ | Never |
| `jwtToken` | Playground JWT token | Run "8. Get Playground JWT Token" | 1 hour |
| `slackUserToken` | Slack user JWT | Run "0. Generate Slack JWT" in slack/ | 5 minutes |

**Note:** Variables are auto-saved by Bruno's post-response scripts. Just run the request and the token is available for subsequent requests.

---

## Auth Flows

### 1. Session-Based Auth (Manage API, Slack Dashboard API)

```
1. Run "1. Sign In" → Gets session token
2. Token is auto-saved to `sessionToken` variable
3. All manage API and Slack dashboard calls use this token
```

### 2. API Key Auth (Run API - Production)

```
1. Run "7. Create API Key" → Creates persistent API key
2. Key is auto-saved to `apiKey` variable  
3. Use for production integrations
4. Requires X-Inkeep-Tenant-Id, X-Inkeep-Project-Id, X-Inkeep-Agent-Id headers
```

### 3. JWT Playground Token (Run API - Testing)

```
1. First: Run "1. Sign In" to get session
2. Run "8. Get Playground JWT Token" → Creates temp JWT
3. Token is auto-saved to `jwtToken` variable
4. Use for testing - no extra headers needed (tenant/project/agent baked in)
5. Expires in 1 hour
```

### 4. Slack User JWT (Run API - Slack Integration)

```
1. First: Run "1. Sign In" to get session
2. Run "0. Generate Slack JWT" in slack/ → Creates Slack user JWT
3. Token is auto-saved to `slackUserToken` variable
4. Run "6. Chat (Slack User JWT)" in run/ → Test the Slack auth flow
5. Expires in 5 minutes
```

**Note:** The debug endpoint (`/debug/generate-token`) is only available in development/test environments.

---

## API Endpoints Overview

| Path | Purpose |
|------|---------|
| `/api/auth/*` | Authentication (sign-in, sign-up, session) |
| `/manage/*` | Configuration API (projects, agents, tools) |
| `/run/*` | Execution API (chat completions, A2A) |
| `/work-apps/slack/*` | Slack integration |
| `/health` | Health check (no auth required) |

---

## Folder: manage/ - Configuration API

| # | Request | Auth | Description |
|---|---------|------|-------------|
| 0 | Logout | Session | Clear session |
| 1 | Sign In | None | Get session token ⭐ **Run this first!** |
| 2 | Get Session | Session | Check current session |
| 3 | List Projects | Session | All projects |
| 3b | List Projects (Cookie) | Cookie | Same but with cookie auth |
| 4 | List Agents | Session | Agents in project |
| 5 | Get Agent | Session | Full agent details |
| 6 | List API Keys | Session | Project API keys |
| 7 | Create API Key | Session | New API key |
| 8 | Playground JWT | Session | Temp token for testing ⭐ **For run API** |
| 9 | List Tools | Session | Project tools |
| 10 | List Credentials | Session | Project credentials |
| 11 | List Conversations | Session | Chat history |
| 12 | List Sub-Agents | Session | Agent sub-agents |
| 13 | Delete API Key | Session | Remove API key |
| 14 | MCP Catalog | Session | Available MCP tools |
| 15 | Get Project Full | Session | Complete export |

---

## Folder: run/ - Execution API

| # | Request | Auth | Required Headers | Description |
|---|---------|------|-----------------|-------------|
| 1 | Chat (API Key) | API Key | `X-Inkeep-Tenant-Id`, `X-Inkeep-Project-Id`, `X-Inkeep-Agent-Id` | Chat with persistent key |
| 2 | Chat (JWT) | JWT Token | None | Chat with playground token ⭐ |
| 3 | Chat (Streaming) | API Key | `X-Inkeep-Tenant-Id`, `X-Inkeep-Project-Id`, `X-Inkeep-Agent-Id` | SSE streaming response |
| 4 | Agent Card | None | None | A2A discovery |
| 5 | Health Check | None | None | Service status |
| 6 | Chat (Slack JWT) | Slack User JWT | `X-Inkeep-Project-Id`, `X-Inkeep-Agent-Id` | Slack auth flow ⭐ |

---

## Folder: slack/ - Slack Integration

All Slack endpoints use **Session token** auth and require `Origin: http://localhost:3000` header.

### Debug/Testing

| # | Request | Method | Endpoint | Description |
|---|---------|--------|----------|-------------|
| 0 | Generate Slack JWT | POST | `/debug/generate-token` | Generate Slack user JWT ⭐ **Run first for Slack tests** |

### User Routes (`/users/...`)

| # | Request | Method | Endpoint | Description |
|---|---------|--------|----------|-------------|
| 1 | Status | GET | `/users/status?userId=...` | Check user's Slack connection |
| 4 | Get User Settings | GET | `/users/me/settings?slackUserId=...&slackTeamId=...` | Get user's personal agent |
| 4b | Set User Settings | PUT | `/users/me/settings` | Set user's personal agent |
| 5 | Disconnect | POST | `/users/disconnect` | Unlink user from Slack |
| 11 | Link Status | GET | `/users/link-status?slackUserId=...&slackTeamId=...` | Check if Slack user is linked |
| 13 | Redeem Code | POST | `/users/link/redeem` | Complete linking (legacy codes) |
| 13b | Verify Token | POST | `/users/link/verify-token` | Complete linking (JWT) ⭐ |
| 14 | Connect | POST | `/users/connect` | Create Nango OAuth session |
| 15 | Refresh Session | POST | `/users/refresh-session` | Update stored session token |

### Workspace Routes (`/workspaces/...`)

| # | Request | Method | Endpoint | Description |
|---|---------|--------|----------|-------------|
| 3 | Health Check | GET | `/workspaces/:teamId/health` | Verify bot token and permissions |
| 7 | List Workspaces | GET | `/workspaces` | All installed workspaces ⭐ |
| 8 | Get Settings | GET | `/workspaces/:teamId/settings` | Get default agent config |
| 9 | Set Settings | PUT | `/workspaces/:teamId/settings` | Configure default agent (admin) |
| 10 | Linked Users | GET | `/workspaces/:teamId/users` | List linked users in workspace |
| 12 | Delete Workspace | DELETE | `/workspaces/:workspaceId` | Remove workspace installation (admin) |
| 18 | Test Message | POST | `/workspaces/:teamId/test-message` | Send test message to channel |

### Internal/Debug Routes

| # | Request | Method | Endpoint | Description |
|---|---------|--------|----------|-------------|
| 2 | Workspace Info | GET | `/workspace-info?connectionId=...` | Get workspace details from Slack API |
| 6 | List Agents | GET | `/agents?tenantId=...` | Agents available for Slack |
| 16 | Register Workspace | POST | `/register-workspace` | Manual workspace registration |
| 17 | Cleanup Codes | POST | `/link-codes/cleanup` | Maintenance cleanup |

---

## Quick Reference: API Endpoints

### Slack User Endpoints

```
GET  /work-apps/slack/users/status           → ?userId=...
GET  /work-apps/slack/users/link-status      → ?slackUserId=...&slackTeamId=...
POST /work-apps/slack/users/disconnect       → { slackUserId, slackTeamId, tenantId }
POST /work-apps/slack/users/connect          → { userId, tenantId, sessionToken }
POST /work-apps/slack/users/link/redeem      → { code, userId, userEmail }
POST /work-apps/slack/users/refresh-session  → { userId, sessionToken }
```

### Slack Workspace Endpoints

```
GET    /work-apps/slack/workspaces                        → List all workspaces
GET    /work-apps/slack/workspaces/:teamId                → Get workspace details
GET    /work-apps/slack/workspaces/:teamId/settings       → Get default agent
PUT    /work-apps/slack/workspaces/:teamId/settings       → Set default agent
DELETE /work-apps/slack/workspaces/:workspaceId           → Uninstall workspace
GET    /work-apps/slack/workspaces/:teamId/users          → List linked users
GET    /work-apps/slack/workspaces/:teamId/channels       → List channels
PUT    /work-apps/slack/workspaces/:teamId/channels/:id/settings → Set channel agent
```

### Run API Headers

```
API Key Auth:
  Authorization: Bearer sk_...
  X-Inkeep-Tenant-Id: default
  X-Inkeep-Project-Id: test
  X-Inkeep-Agent-Id: test

JWT Auth (Playground):
  Authorization: Bearer eyJ...
  (no additional headers needed - baked into token)

Slack User JWT Auth:
  Authorization: Bearer eyJ...
  X-Inkeep-Project-Id: test
  X-Inkeep-Agent-Id: test
```

---

## Connection ID Format

Nango connection IDs for Slack workspaces follow this pattern:

- **Non-enterprise:** `T:{teamId}` → `T:T0AA0UWRXJS`
- **Enterprise Grid:** `E:{enterpriseId}:T:{teamId}` → `E:E0AA0UUL7ML:T:T0AA0UWRXJS`

---

## Environments

| Environment | Base URL | Description |
|-------------|----------|-------------|
| `local` | `http://localhost:3002` | Pre-configured with test workspace values |
| `pilot` | `https://pilot.inkeep.com` | Production - get token from browser |

### Updating Variables

You can update environment variables in three ways:

1. **Bruno UI** (recommended):
   - Click the gear icon next to the environment dropdown (bottom-left)
   - Edit values in the modal
   - Changes persist to the `.bru` file

2. **Switch environments**:
   - Use the dropdown to switch between environments
   - Create new `.bru` files for additional test scenarios

3. **Edit file directly**:
   - Open `environments/local.bru` or create new files
   - Useful for bulk changes or version control

---

## Troubleshooting

### "Unauthorized" or 401 errors
- Run `manage/1-sign-in.bru` first to get a session token
- Check that the `sessionToken` variable is set (click gear icon)

### "Missing tenantId" errors  
- Make sure you're using the correct auth method for the endpoint
- For run API with API key: include the `X-Inkeep-*` headers
- For run API with JWT: the token includes tenant/project/agent

### Slack endpoints return 404
- Ensure you have a Slack workspace installed (run `slack/7-workspaces.bru` to check)
- The test values assume workspace `T0AA0UWRXJS` exists

### Token expired
- Session tokens last 7 days - run sign-in again
- JWT tokens last 1 hour - run playground token request again
- Slack JWT tokens last 5 minutes - regenerate before testing

---

## Authentication Strategy

**Slack Runtime → Run API:** All Slack interactions use JWT authentication:
- When a linked user invokes an agent from Slack, the server generates a `SlackUserToken` JWT
- This JWT is used to authenticate with the Run API (`/run/api/chat`)
- No API keys are used for Slack→API calls

**Dashboard → Work-Apps API:** Uses session authentication (cookies/bearer token)

---

## Architecture Documentation

For comprehensive architecture documentation including mermaid diagrams, see:
- [`/agents-api/src/domains/work-apps/slack/README.md`](../agents-api/src/domains/work-apps/slack/README.md)

### Link Code vs JWT Link Flow

The Slack integration supports two methods for linking accounts:

**1. JWT Link Token (Primary - Recommended)**
```
User runs /inkeep link → Gets URL with JWT token → Clicks link → Dashboard verifies token
```
- Uses `POST /users/link/verify-token`
- Tokens are signed JWTs, expire in 1 hour
- No database storage needed for pending codes
- More secure (cryptographically signed)

**2. Link Codes (Legacy)**
```
User runs /inkeep link → Gets 8-char code (ABCD-1234) → Enters in dashboard
```
- Uses `POST /users/link/redeem`
- Codes stored in `work_app_slack_account_link_codes` table
- Requires cleanup (`POST /link-codes/cleanup`)
- Still supported for backwards compatibility

---

## Bruno Best Practices

This collection follows [Bruno documentation](https://docs.usebruno.com/bru-lang/overview) best practices:

### Folder-Level Configuration
Each folder has a `folder.bru` file with shared settings:
- `manage/folder.bru` - Sets `Origin` header for CORS
- `slack/folder.bru` - Sets `Origin` header for CORS  
- `run/folder.bru` - Base configuration

### Tags for Filtering
Requests use `tags` in the `meta` block for filtering collection runs:
```
meta {
  name: 1. Sign In
  type: http
  seq: 1
  tags: [auth, smoke]
}
```

### Query Params Block
Query parameters use `params:query` block instead of URL strings:
```
params:query {
  userId: {{userId}}
  tenantId: {{tenantId}}
}
```

### Path Params Block
Path parameters are documented with `params:path`:
```
params:path {
  teamId: {{slackTeamId}}
}
```

### Tests Block
Key requests include `tests` blocks with assertions:
```
tests {
  test("should return 200", function() {
    expect(res.status).to.equal(200);
  });
}
```

### Post-Response Scripts
Token extraction uses `script:post-response`:
```
script:post-response {
  if (res.body.token) {
    bru.setEnvVar("sessionToken", res.body.token);
  }
}
```

### Secret Variables
Sensitive data uses `vars:secret` in environment files:
```
vars:secret [
  sessionToken,
  apiKey,
  jwtToken
]
```

---

## Running with CLI

```bash
# Install Bruno CLI
npm install -g @usebruno/cli

# Run entire collection
bru run

# Run specific folder
bru run slack/

# Run with specific environment
bru run --env local

# Run only smoke tests
bru run --tag smoke

# Run with JUnit reporter for CI
bru run --reporter junit --output results.xml
```
