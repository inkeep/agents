# @inkeep/zendesk-mcp

MCP server for searching and reading Zendesk tickets from Cursor, Claude Code, or any MCP-compatible client.

## Setup

### 1. Get Zendesk API credentials

You need three things from your Zendesk account:

- **Subdomain** - Your Zendesk subdomain (e.g., `mycompany` for `mycompany.zendesk.com`)
- **Email** - The email address of the user associated with the API token
- **API Token** - Generate one in Zendesk Admin Center > Apps and Integrations > APIs > Zendesk API

### 2. Configure your MCP client

#### Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "zendesk": {
      "command": "npx",
      "args": ["@inkeep/zendesk-mcp"],
      "env": {
        "ZENDESK_SUBDOMAIN": "your-subdomain",
        "ZENDESK_EMAIL": "you@example.com",
        "ZENDESK_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

#### Cursor

Add to your Cursor MCP settings (Settings > MCP Servers):

```json
{
  "zendesk": {
    "command": "npx",
    "args": ["@inkeep/zendesk-mcp"],
    "env": {
      "ZENDESK_SUBDOMAIN": "your-subdomain",
      "ZENDESK_EMAIL": "you@example.com",
      "ZENDESK_API_TOKEN": "your-api-token"
    }
  }
}
```

## Available Tools

### zendesk_search_tickets

Search tickets with natural language or Zendesk query syntax.

**Examples you can ask your LLM:**
- "Find tickets about SSO issues from last week"
- "Show me open high-priority tickets assigned to me"
- "Search for billing tickets tagged as urgent"

**Supports structured filters:** status, priority, assignee, requester, tags, date ranges.

### zendesk_get_ticket

Get full details of a specific ticket by ID.

- "Show me ticket #12345"
- "What's the status of ticket 67890?"

### zendesk_get_ticket_comments

Read the full conversation thread on a ticket.

- "What's the conversation on ticket 12345?"
- "Show me all comments on ticket 67890"

### zendesk_list_tickets

Browse recent tickets sorted by update time.

- "Show me the latest tickets"
- "List the most recently updated tickets"

### zendesk_search_users

Find Zendesk users by name or email.

- "Find the user john@example.com"
- "Search for users named Jane Smith"

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZENDESK_SUBDOMAIN` | Yes | Your Zendesk subdomain (e.g., `mycompany`) |
| `ZENDESK_EMAIL` | Yes | Email associated with the API token |
| `ZENDESK_API_TOKEN` | Yes | Zendesk API token |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
ZENDESK_SUBDOMAIN=xxx ZENDESK_EMAIL=xxx ZENDESK_API_TOKEN=xxx node dist/index.js
```

## How it works

This is a read-only MCP server that exposes Zendesk's Search API, Tickets API, Comments API, and Users API as MCP tools. When you ask your LLM a question about Zendesk tickets, it translates your natural language into the appropriate tool call with structured parameters. The Zendesk search query syntax supports operators like `status:open`, `priority:high`, `created>7days`, `assignee:name`, and more.

The server uses stdio transport (standard for local MCP servers) and authenticates with Zendesk via API token.
