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

## Local Development with Socket Mode

Socket Mode lets you receive Slack events over a WebSocket connection — no tunnel (ngrok, Cloudflare Tunnel) needed. Each developer creates their own Slack app with Socket Mode enabled.

### Why one app per developer?

Socket Mode distributes events randomly across connected clients rather than broadcasting to all. If two developers share the same app, each would receive roughly half the events. Use a separate dev app to get all events locally.

### Prerequisites

- A Slack workspace where you can install apps
- Permission to create Slack apps (workspace admin or appropriate permissions)
- The monorepo set up and running (`pnpm install`)

### Quick Setup (recommended)

Run the guided setup script:

```bash
pnpm setup-slack-dev
```

The script will:
1. Generate a random dev identifier (e.g., `frost-ember`) for your app display name
2. Create the Slack app via API using your configuration token
3. Collect your App-Level Token (the only manual step — no API exists for this)
4. Install the app to your workspace via automatic OAuth flow
5. Write all credentials to your `.env` file

First run requires 2 pastes (config refresh token + app-level token). Re-runs require 0 pastes.

### Manual Setup

If you prefer to set things up manually:

1. **Create a dev Slack app**
   - Go to [api.slack.com/apps](https://api.slack.com/apps) and click "Create New App" > "From an app manifest"
   - Use the canonical manifest at `packages/agents-work-apps/src/slack/slack-app-manifest.json` as a starting point
   - Modify it: set `settings.socket_mode_enabled` to `true`, remove all `request_url` and `url` fields, rename the app (e.g., "Inkeep Dev - YourName")

2. **Generate an App-Level Token**
   - In your app settings > "Basic Information" > "App-Level Tokens"
   - Click "Generate Token and Scopes"
   - Name: "socket-mode", Scope: `connections:write`
   - Copy the token (starts with `xapp-`)

3. **Install the app**
   - Go to "Install App" > "Install to Workspace"
   - Copy the "Bot User OAuth Token" (starts with `xoxb-`)

4. **Configure environment variables**
   Add to your `.env` file:
   ```
   SLACK_APP_TOKEN=xapp-your-token-here
   SLACK_BOT_TOKEN=xoxb-your-token-here
   ```

### Verifying It Works

1. Start the dev server: `pnpm dev`
2. Look for the log message: "Slack Socket Mode client started"
3. In your Slack workspace, @mention your dev bot in a channel
4. The event should be received and processed locally

### How It Works

```
Production (HTTP):  Slack -> HTTPS POST -> Hono route -> dispatcher -> handlers
Local Dev (Socket): Slack -> WebSocket  -> adapter    -> dispatcher -> handlers
```

Both transports share the same event dispatcher and handlers. The Socket Mode adapter:
- Receives pre-parsed events over WebSocket (no signature verification needed — the connection itself is authenticated)
- Calls `ack()` immediately (replaces HTTP 200 response)
- Routes events through `dispatchSlackEvent()` — the same function used by the HTTP route
- Creates OTel tracing spans with the same span names and attributes as the HTTP path

### Troubleshooting

**"Scheduling Slack Socket Mode start..." but no "started" message**
- Check that `SLACK_APP_TOKEN` is valid (starts with `xapp-`)
- Ensure `@slack/socket-mode` is installed: `pnpm --filter @inkeep/agents-work-apps add -D @slack/socket-mode`

**"Socket Mode client already running (HMR reload detected)"**
- This is normal. The Socket Mode client uses a `globalThis` singleton to survive Vite HMR reloads without creating duplicate connections.

**Events not arriving**
- Verify your app is installed to the workspace where you're testing
- Check that the bot has been invited to the channel (`/invite @YourDevBot`)
- Ensure `socket_mode_enabled: true` is set in your Slack app settings

**"SLACK_APP_TOKEN is set but @slack/socket-mode is not installed"**
- Run: `pnpm --filter @inkeep/agents-work-apps add -D @slack/socket-mode`

---

## File Structure

```
packages/agents-work-apps/src/slack/
├── README.md                 # This file
├── slack-app-manifest.json   # Slack app configuration template
├── dispatcher.ts             # Shared event dispatcher (used by both HTTP and Socket Mode)
├── socket-mode.ts            # Socket Mode adapter (local dev only)
├── tracer.ts                 # OTel tracing utilities
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
