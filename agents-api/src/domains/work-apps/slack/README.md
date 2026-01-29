# Slack Work App

This module integrates Inkeep Agents with Slack workspaces, enabling users to invoke agents via slash commands and @mentions.

## Architecture

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Slack Events   │──────│  agents-api  │──────│  Nango (Vault)  │
│  /commands      │      │  /work-apps/ │      │  Bot tokens     │
│  /events        │      │  slack/*     │      │  Workspace meta │
└─────────────────┘      └──────────────┘      └─────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            ┌───────▼───────┐       ┌───────▼───────┐
            │   Runtime DB  │       │   Manage DB   │
            │  User links   │       │   Agents      │
            │  Link codes   │       │   Projects    │
            │  Workspaces   │       │               │
            └───────────────┘       └───────────────┘
```

## Key Flows

### 1. Workspace Installation

```
Admin → Dashboard → "Install Slack App"
         │
         ▼
    Slack OAuth flow
         │
         ▼
    Store bot token in Nango
         │
         ▼
    Create workspace record in DB
```

### 2. User Linking (Device Code Flow)

```
Slack User → /inkeep command
         │
         ▼ (user not linked)
    Generate one-time link code (SHA256 hashed in DB)
         │
         ▼
    User visits dashboard with code
         │
         ▼
    POST /link/redeem → creates user mapping
         │
         ▼
    User can now invoke agents
```

### 3. Agent Invocation

```
Linked User → @mention or /inkeep run <agent>
         │
         ▼
    Mint short-lived JWT (5 min, HS256)
         │
         ▼
    POST /run/api/chat with JWT
         │
         ▼
    Response posted to Slack channel/thread
```

## Authentication

### Slack User JWT Contract

```typescript
{
  iss: 'inkeep-auth',
  aud: 'inkeep-api',
  sub: '<inkeepUserId>',
  tokenUse: 'slackUser',
  act: { sub: 'inkeep-work-app-slack' },
  tenantId: '<tenantId>',
  slack: {
    teamId: '<slackTeamId>',
    userId: '<slackUserId>',
    enterpriseId?: '<enterpriseId>'
  },
  exp: <5 minutes from now>
}
```

The JWT is signed with `INKEEP_AGENTS_JWT_SIGNING_SECRET` using HS256.

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/install` | GET | None | Redirect to Slack OAuth |
| `/oauth_redirect` | GET | None | Handle OAuth callback |
| `/events` | POST | Slack signature | Receive Slack events |
| `/commands` | POST | Slack signature | Handle slash commands |
| `/workspaces` | GET | None | List installed workspaces |
| `/workspaces/:id` | DELETE | Session | Uninstall workspace |
| `/link/redeem` | POST | Session | Redeem link code |
| `/linked-users` | GET | None | List linked users |
| `/link-codes/cleanup` | POST | None | Cleanup expired codes |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/inkeep help` | Show available commands |
| `/inkeep link` | Get account linking URL |
| `/inkeep status` | Check link status |
| `/inkeep list` | List available agents |
| `/inkeep run <agent> <question>` | Invoke specific agent |
| `/inkeep <question>` | Invoke default agent |

## @mention Behavior

| Trigger | Behavior |
|---------|----------|
| `@Inkeep` (no text) | Show agent selection buttons |
| `@Inkeep <question>` | Use default agent (if configured) |
| `@Inkeep` in thread | Include thread context |

When clicking an agent button, a modal opens for entering the question with a private/public response toggle.

## Database Tables (Runtime)

- `work_app_slack_workspaces` - Installed workspace records
- `work_app_slack_user_mappings` - Slack↔Inkeep user links
- `work_app_slack_account_link_codes` - One-time link codes

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_SIGNING_SECRET` | Yes | Verify Slack requests |
| `INKEEP_AGENTS_JWT_SIGNING_SECRET` | Yes | Sign user JWTs |
| `NANGO_SECRET_KEY` | Yes | Nango API access |
| `NANGO_SLACK_INTEGRATION_ID` | No | Custom integration ID |

## Testing

```bash
# Run Slack route tests
cd agents-api
pnpm vitest --run src/__tests__/work-apps/slack/

# Run JWT tests
cd packages/agents-core
pnpm vitest --run src/__tests__/utils/slack-user-token.test.ts
```
