# System Architecture

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 SLACK                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Slash Cmds   │  │ @mentions    │  │ Interactives │  │ OAuth Events │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────│─────────────────│─────────────────│─────────────────│─────────────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           INKEEP AGENTS API                                     │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                      /work-apps/slack/*                                   │  │
│  │                                                                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │  │
│  │  │   OAuth     │ │   Events    │ │   Users     │ │ Workspaces  │         │  │
│  │  │  /install   │ │ /commands   │ │ /link/*     │ │ /settings   │         │  │
│  │  │ /oauth_redir│ │  /events    │ │ /status     │ │ /channels   │         │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘         │  │
│  │         │               │               │               │                 │  │
│  │         ▼               ▼               ▼               ▼                 │  │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                         Service Layer                               │  │  │
│  │  │  • Command Handlers    • Event Processors    • Token Services      │  │  │
│  │  │  • Nango Integration   • Slack API Client    • Agent Resolution    │  │  │
│  │  └────────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│                                      ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                          /run/api/chat                                    │  │
│  │  • Validates SlackUserToken JWT                                           │  │
│  │  • Executes agent with context                                            │  │
│  │  • Streams response back                                                  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
          │                                                           │
          ▼                                                           ▼
┌─────────────────────────┐                           ┌─────────────────────────┐
│        NANGO            │                           │       POSTGRESQL        │
│  • Bot token storage    │                           │  • User mappings        │
│  • OAuth handling       │                           │  • Workspace configs    │
│  • Connection mgmt      │                           │  • Channel configs      │
└─────────────────────────┘                           └─────────────────────────┘
```

## Request Flow

1. **Slack Event** → Slack sends HTTP POST to our endpoint
2. **Signature Verification** → Validate request is from Slack
3. **User Resolution** → Check if Slack user is linked to Inkeep account
4. **Agent Resolution** → Determine which agent to use:
   - `/inkeep` commands: user personal > channel > workspace
   - `@Inkeep` mentions: channel > workspace
5. **Token Generation** → Create short-lived SlackUserToken JWT
6. **Agent Execution** → Call /run/api/chat with JWT
7. **Response** → Stream or post response back to Slack

---

## Component Breakdown

### Backend Components (`@inkeep/agents-work-apps`)

#### Routes Layer

| Route File | Purpose | Endpoints |
|------------|---------|-----------|
| `oauth.ts` | Slack OAuth installation flow | `/install`, `/oauth_redirect` |
| `events.ts` | Slack events & commands | `/commands`, `/events`, `/nango-webhook` |
| `users.ts` | User linking & settings | `/link/*`, `/status`, `/me/settings` |
| `workspaces.ts` | Workspace management | `/workspaces/*`, `/channels/*` |
| `resources.ts` | Agent/project listing | `/agents`, `/projects` |
| `internal.ts` | Debug & maintenance | `/debug/*`, `/register-workspace` |

#### Service Layer

| Service | Responsibility |
|---------|----------------|
| `commands/index.ts` | Slash command routing and execution |
| `events/index.ts` | Event dispatcher (app_mention, message, etc.) |
| `events/app-mention.ts` | @mention handler with streaming response |
| `events/block-actions.ts` | Interactive component handlers (share buttons, modals) |
| `events/modal-submission.ts` | Modal form submissions |
| `events/streaming.ts` | Agent response streaming to Slack |
| `events/utils.ts` | Error handling, markdown conversion, API helpers |
| `blocks/index.ts` | Slack Block Kit message builders |
| `modals.ts` | Agent selector modal builder |
| `nango.ts` | Nango API client for OAuth tokens and workspace defaults |
| `client.ts` | Slack Web API wrapper |
| `api-client.ts` | Internal API client for manage endpoints |
| `agent-resolution.ts` | Agent priority resolution logic |
| `auth/index.ts` | JWT token generation |
| `security.ts` | Slack signature verification |
| `types.ts` | TypeScript type definitions |
| `workspace-tokens.ts` | Workspace bot token retrieval |

### Frontend Components (`agents-manage-ui`)

| Component | Purpose |
|-----------|---------|
| `/app/link/page.tsx` | JWT-based account linking page |
| `/app/[tenantId]/work-apps/slack/page.tsx` | Slack dashboard page |
| `features/work-apps/slack/components/slack-dashboard.tsx` | Main workspace management UI |
| `features/work-apps/slack/components/workspace-hero.tsx` | Workspace status display |
| `features/work-apps/slack/components/linked-users-section.tsx` | User management table |
| `features/work-apps/slack/components/agent-configuration-card.tsx` | Agent selection UI |
| `features/work-apps/slack/components/notification-banner.tsx` | Toast notifications |
| `features/work-apps/slack/api/slack-api.ts` | Frontend API client |
| `features/work-apps/slack/store/slack-store.ts` | Zustand state management |
| `features/work-apps/slack/context/slack-provider.tsx` | React context provider |
| `features/work-apps/slack/types/index.ts` | TypeScript type definitions |

### Core Package (`@inkeep/agents-core`)

| Component | Purpose |
|-----------|---------|
| `db/runtime/runtime-schema.ts` | Database table definitions (work_app_slack_* tables) |
| `data-access/runtime/workAppSlack.ts` | Data access layer functions |
| `utils/slack-link-token.ts` | JWT link token signing/verification |
| `utils/slack-user-token.ts` | JWT user token signing/verification |

---

## Technology Choices

### Backend Stack

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Hono** | HTTP framework | Fast, TypeScript-native, OpenAPI support |
| **Zod** | Schema validation | Type inference, runtime validation |
| **Drizzle ORM** | Database access | Type-safe, performant, migration support |
| **PostgreSQL** | Primary database | Reliable, feature-rich, JSONB support |
| **jose** | JWT handling | Modern, secure, async-first |
| **Nango** | OAuth management | Secure token storage, refresh handling |

### Frontend Stack

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Next.js 14** | React framework | App Router, Server Components |
| **Zustand** | State management | Simple, performant, TypeScript-native |
| **Tailwind CSS** | Styling | Utility-first, consistent design |
| **Shadcn/ui** | Component library | Accessible, customizable |

### Slack Integration

| Component | Purpose |
|-----------|---------|
| **@slack/web-api** | Official Slack API client |
| **Block Kit** | Rich message formatting |
| **Modals** | Form interactions |
| **Slash Commands** | Primary user interaction |
| **Event Subscriptions** | @mentions and messages |
