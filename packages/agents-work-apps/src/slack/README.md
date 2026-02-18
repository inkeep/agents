# Slack Work App

Enables enterprise teams to interact with Inkeep AI agents directly from Slack via slash commands and @mentions.

## Quick Start

1. Start the API server: `pnpm dev` from monorepo root
2. Install the Slack app to a workspace via `/work-apps/slack/install`
3. Use `/inkeep help` in Slack to see available commands

## Key Concepts

### Agent Resolution

| Context | Priority |
|---------|----------|
| `/inkeep` commands | Channel default > Workspace default |
| `@Inkeep` mentions | Channel default > Workspace default |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/inkeep` | Open agent picker modal |
| `/inkeep help` | Show available commands |
| `/inkeep link` | Link Slack account to Inkeep |
| `/inkeep status` | Check account and agent status |
| `/inkeep [message]` | Send a message to the default agent |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SLACK WORKSPACE                                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  /inkeep cmd    │    │  @Inkeep        │    │  #channel       │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
└───────────│──────────────────────│──────────────────────│───────────────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INKEEP AGENTS API (/work-apps/slack/*)                   │
│  1. Verify Slack signature                                                  │
│  2. Check user is linked                                                    │
│  3. Resolve agent (channel default > workspace default)                     │
│  4. Generate SlackUserToken JWT                                             │
│  5. Call /run/api/chat                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
            │                                             │
            ▼                                             ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│        NANGO            │               │       POSTGRESQL        │
│  Bot token storage      │               │  User mappings          │
│  OAuth management       │               │  Channel configs        │
└─────────────────────────┘               └─────────────────────────┘
```

---

## File Structure

```
packages/agents-work-apps/src/slack/
├── README.md                 # This file
├── slack-app-manifest.json   # Slack app configuration template
├── i18n/                     # Centralized Slack-facing UI strings
├── middleware/               # Auth middleware (permissions)
├── routes/                   # API routes (oauth, workspaces, users, events)
├── services/                 # Business logic (commands, streaming, modals, nango)
└── types.ts                  # Shared type definitions
```

---

## Common Issues

### "User not linked"
Run `/inkeep link` and click the link to complete the linking flow.

### "No agent configured"
Admin needs to set a workspace or channel default agent via the dashboard.

### "Bot token invalid"
Check workspace health via `GET /workspaces/:teamId/health`. May need to reinstall.

### "Link token expired"
JWT link tokens expire after 10 minutes. Run `/inkeep link` again.
