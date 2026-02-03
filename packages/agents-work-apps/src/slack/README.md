# Slack Work App

Enables enterprise teams to interact with Inkeep AI agents directly from Slack via slash commands and @mentions.

## Quick Start

1. Start the API server: `pnpm dev` from monorepo root
2. Install the Slack app to a workspace via `/work-apps/slack/install`
3. Use `/inkeep help` in Slack to see available commands

## Documentation

All documentation is organized in the `docs/` folder:

| Folder | Contents |
|--------|----------|
| **[docs/INDEX.md](./docs/INDEX.md)** | Full documentation index |
| [docs/spec/](./docs/spec/) | Technical specs (architecture, auth, database, API) |
| [docs/flows/](./docs/flows/) | Flow diagrams (slash commands, @mentions) |
| [docs/developer/](./docs/developer/) | Developer resources (SQL, testing) |

### Quick Reference

| Document | Description |
|----------|-------------|
| [docs/spec/ARCHITECTURE.md](./docs/spec/ARCHITECTURE.md) | System overview |
| [docs/spec/AUTHENTICATION.md](./docs/spec/AUTHENTICATION.md) | JWT tokens, permissions |
| [docs/flows/SLASH_COMMANDS.md](./docs/flows/SLASH_COMMANDS.md) | `/inkeep` command flows |
| [docs/flows/MENTIONS.md](./docs/flows/MENTIONS.md) | `@Inkeep` mention flows |
| [docs/developer/COMMANDS.md](./docs/developer/COMMANDS.md) | SQL snippets, scripts |

---

## Key Concepts

### Agent Resolution

| Context | Priority |
|---------|----------|
| `/inkeep` commands | User personal > Channel > Workspace |
| `@Inkeep` mentions | Channel > Workspace (admin-controlled) |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/inkeep help` | Show available commands |
| `/inkeep link` | Link Slack account to Inkeep |
| `/inkeep status` | Check account and agent status |
| `/inkeep [question]` | Ask the default agent |
| `/inkeep run "agent" [question]` | Ask a specific agent |
| `/inkeep settings` | View/set personal default agent |

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
│  3. Resolve agent (user > channel > workspace)                              │
│  4. Generate SlackUserToken JWT                                             │
│  5. Call /run/api/chat                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
            │                                             │
            ▼                                             ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│        NANGO            │               │       POSTGRESQL        │
│  Bot token storage      │               │  User mappings          │
└─────────────────────────┘               └─────────────────────────┘
```

---

## File Structure

```
packages/agents-work-apps/src/slack/
├── README.md                 # This file
├── slack-app-manifest.json   # Slack app configuration
├── docs/                     # All documentation
│   ├── INDEX.md              # Documentation index
│   ├── spec/                 # Technical specifications
│   │   ├── ARCHITECTURE.md
│   │   ├── AUTHENTICATION.md
│   │   ├── DATABASE.md
│   │   ├── API.md
│   │   └── DESIGN_DECISIONS.md
│   ├── flows/                # Flow diagrams
│   │   ├── USER_FLOWS.md
│   │   ├── SLASH_COMMANDS.md
│   │   └── MENTIONS.md
│   └── developer/            # Developer resources
│       ├── COMMANDS.md
│       └── TESTING.md
├── routes/                   # API routes
├── services/                 # Business logic
└── middleware/               # Auth middleware
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
