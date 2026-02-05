# API Design

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## RESTful Resource Hierarchy

```
/work-apps/slack/
├── /install                      # OAuth initiation
├── /oauth_redirect               # OAuth callback
├── /commands                     # Slash command handler
├── /events                       # Event subscriptions
├── /nango-webhook                # Nango connection events
│
├── /users/
│   ├── /status                   # Check connection status
│   ├── /link-status              # Check if Slack user is linked
│   ├── /link/verify-token        # Verify JWT and create link
│   ├── /connect                  # Create Nango session
│   ├── /disconnect               # Remove user link
│   ├── /me/settings              # Personal settings
│   └── /refresh-session          # Refresh session token
│
├── /workspaces/
│   ├── [GET]                     # List all workspaces
│   ├── /:teamId
│   │   ├── [GET]                 # Get workspace details
│   │   ├── [DELETE]              # Uninstall workspace
│   │   ├── /settings             # Workspace default agent
│   │   ├── /health               # Bot health check
│   │   ├── /test-message         # Send test message
│   │   ├── /users                # List linked users
│   │   └── /channels/
│   │       ├── [GET]             # List channels
│   │       ├── /bulk             # Bulk operations
│   │       └── /:channelId/settings  # Channel config
│
├── /agents                       # List available agents
├── /projects                     # List projects
│   └── /:projectId/agents        # List project agents
│
└── /internal/
    ├── /register-workspace       # Manual registration (dev)
    ├── /workspace-info           # Get Slack info
    └── /debug/generate-token     # Generate test JWT (dev)
```

---

## Response Formats

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

---

## User Routes (`/users/...`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/status` | Check if Inkeep user is linked |
| GET | `/users/link-status` | Check if Slack user is linked |
| POST | `/users/connect` | Create Nango OAuth session |
| POST | `/users/disconnect` | Unlink user |
| POST | `/users/link/verify-token` | Verify JWT link token |
| POST | `/users/refresh-session` | Refresh stored session |

---

## Workspace Routes (`/workspaces/...`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workspaces` | List all installed workspaces |
| GET | `/workspaces/:teamId` | Get workspace details |
| GET | `/workspaces/:teamId/settings` | Get workspace settings |
| PUT | `/workspaces/:teamId/settings` | Set workspace default agent |
| DELETE | `/workspaces/:workspaceId` | Uninstall workspace |
| GET | `/workspaces/:teamId/channels` | List channels |
| GET | `/workspaces/:teamId/channels/:id/settings` | Get channel settings |
| PUT | `/workspaces/:teamId/channels/:id/settings` | Set channel agent |
| DELETE | `/workspaces/:teamId/channels/:id/settings` | Remove channel config |
| PUT | `/workspaces/:teamId/channels/bulk` | Bulk set channel agents |
| DELETE | `/workspaces/:teamId/channels/bulk` | Bulk remove configs |
| GET | `/workspaces/:teamId/users` | List linked users |
| GET | `/workspaces/:teamId/health` | Check bot health |
| POST | `/workspaces/:teamId/test-message` | Send test message |

---

## Internal Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register-workspace` | Manual registration (dev) |
| GET | `/workspace-info` | Get info from Slack API |
| POST | `/debug/generate-token` | Generate test JWT (dev) |
