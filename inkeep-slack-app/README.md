# Inkeep Slack App

A multi-workspace Slack app that lets users interact with Inkeep agents directly from Slack. Built with **Next.js**, **Bolt.js**, and **Nango** for secure, scalable OAuth and token management.

Supports slash commands, mentions, message shortcuts, and private DMs across unlimited Slack workspaces.

---

## Features

* **Slash Commands**

  * `/inkeep` to ask questions, manage auth, and configure agents
* **@Mentions**

  * Mention `@Inkeep` in channels to get threaded responses
* **DM Conversations**

  * Private conversations initiated via slash commands
* **Message Shortcuts**

  * Right-click any Slack message → *Ask Inkeep* for context-aware queries
* **Multi-Workspace Support**

  * Single app installation supports unlimited Slack workspaces
* **Secure OAuth**

  * Managed by Nango with automatic token refresh

---


## Architecture Overview

```
Slack → Bolt.js → authorize(teamId)
                  ↓
              Database
                  ↓
               Nango
                  ↓
           Slack Bot Token
```

Each Slack request dynamically resolves the correct bot token based on `teamId`.

---

## OAuth Flow (Nango)

```
User clicks "Add to Slack"
    ↓
POST /api/nango/connect
    ↓
Backend creates Nango Connect Session
    ↓
Redirect to Nango-hosted OAuth
    ↓
User authorizes in Slack
    ↓
Nango webhook → /api/nango/webhook
    ↓
Store workspace + nangoConnectionId
```

### Important Notes

* Nango generates **random connection IDs** during OAuth
* We store the `nango_connection_id` per workspace
* We do **not** derive connection IDs from `teamId`

---

## Project Structure

```
src/
├── app/api/
│   ├── slack/events/        # Slack events webhook
│   ├── nango/connect/       # Create OAuth connect session
│   └── nango/webhook/       # Handle OAuth completion
├── bolt/
│   ├── app.ts               # Bolt app + multi-workspace authorize
│   └── listeners/           # Commands, events, actions, shortcuts
└── lib/
    ├── env.ts               # Zod-validated env config
    ├── nango.ts             # Nango SDK wrapper
    ├── slack-credentials.ts # Token lookup + caching
    └── db.ts                # Database access
```

---

## Slack Commands

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `/inkeep`            | Show help or open ask modal         |
| `/inkeep <question>` | Open modal with question pre-filled |
| `/inkeep login`      | Connect Inkeep account              |
| `/inkeep logout`     | Disconnect account                  |
| `/inkeep status`     | Show auth & channel config          |
| `/inkeep default`    | Set default agent for channel       |

---

## Token Resolution Flow

```
1. Slack event received with teamId
2. Bolt calls authorize(teamId)
3. getSlackBotToken(teamId):
   a. Query slack_workspaces table
   b. Read nango_connection_id
   c. Nango.getConnection(...)
   d. Return access_token
4. Bolt uses token for request
```

---

## Database Schema (Simplified)

```sql
slack_workspaces (
  id,
  team_id,               -- Slack workspace ID
  nango_connection_id,   -- Random ID from Nango
  bot_user_id,
  scopes,
  is_active,
  created_at
)
```

---

## Local Development

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Required environment variables:

* `SLACK_SIGNING_SECRET`
* `SLACK_CLIENT_ID`
* `SLACK_CLIENT_SECRET`
* `NANGO_SECRET_KEY`
* `NANGO_WEBHOOK_VERIFY_SECRET`
* `INKEEP_AGENTS_MANAGE_DATABASE_URL`

---

### 3. Configure Nango

1. Create a Slack integration in the Nango dashboard
2. Set OAuth credentials
3. Configure webhook URL:

   ```
   https://your-domain/api/nango/webhook
   ```
4. Enable webhook signature verification
5. Ensure scopes match `manifest.json`

---

### 4. Create Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Create app **from an app manifest**
3. Paste `manifest.json`
4. Update request & redirect URLs
5. Copy credentials into `.env`

---

### 5. Run Database Migrations

```bash
cd packages/agents-core
pnpm db:generate
pnpm db:migrate
```

---

### 6. Start Development Server

```bash
pnpm dev:tunnel
```

Starts Next.js and an ngrok tunnel for Slack webhooks.

---

## Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `pnpm dev`        | Start Next.js dev server   |
| `pnpm dev:tunnel` | Dev server + ngrok         |
| `pnpm check`      | Typecheck, lint, and tests |
| `pnpm build`      | Production build           |

---

## API Routes

| Route                     | Description                  |
| ------------------------- | ---------------------------- |
| `POST /api/slack/events`  | Slack events webhook         |
| `POST /api/nango/connect` | Create Nango connect session |
| `POST /api/nango/webhook` | OAuth completion webhook     |
| `GET /api/health`         | Health check                 |