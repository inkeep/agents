# Zendesk Search MCP Server

## Problem Statement

Inkeep's TSEs (Technical Support Engineers) need to search and retrieve Zendesk tickets while working in Cursor or Claude Code. Currently they context-switch between their IDE/terminal and the Zendesk web UI to find relevant tickets, read conversations, and understand customer issues. This breaks flow and slows down support-adjacent engineering work.

## Goals

Build a standalone MCP (Model Context Protocol) server that TSEs can install locally and configure in Cursor/Claude Code. The server exposes Zendesk's Search API and ticket retrieval as MCP tools, letting the LLM translate natural language queries into structured Zendesk API calls.

## Non-Goals

- Semantic/vector search over ticket content (Zendesk's native search + LLM is sufficient)
- Write operations (creating/updating tickets) - read-only for v1
- Hosted deployment - this is a local stdio MCP server
- Integration with the Inkeep Agent Builder platform (independent package)
- Zendesk webhooks or real-time ticket streaming

## Target Users

- TSEs at Inkeep who use Cursor or Claude Code daily
- Potentially any developer who wants Zendesk search in their AI-powered editor

## Decisions

- **Package name**: `@inkeep/zendesk-mcp` - short, clear, matches the `@inkeep/agents-mcp` pattern
- **Read-only v1**: No write operations. TSEs need search/read, not ticket management from their IDE.
- **Zendesk plan**: Assume Professional+ (Search API available on all paid plans)

## Requirements

### Functional Requirements

1. **Search tickets** - Full-text search using Zendesk's query syntax with optional structured filters
2. **Get ticket details** - Retrieve a single ticket by ID with full metadata
3. **Get ticket comments/conversation** - Read the full conversation thread on a ticket
4. **List recent tickets** - Browse recent tickets with filtering (status, assignee, priority)
5. **Search users** - Find Zendesk users by name/email (useful for "show me tickets from customer X")

### Non-Functional Requirements

1. **stdio transport** - Standard MCP stdio transport for local IDE integration
2. **Zero-config auth** - Environment variables for Zendesk credentials
3. **npx-runnable** - `npx @inkeep/zendesk-mcp` should work out of the box
4. **Lightweight** - Minimal dependencies (`@modelcontextprotocol/sdk`, `zod`), fast startup
5. **Rich tool descriptions** - Detailed parameter descriptions and examples so the LLM translates natural language effectively
6. **All tools read-only** - Every tool annotated with `readOnlyHint: true`

## Technical Design

### Package Location

New package: `packages/zendesk-mcp/` in the monorepo

### Transport

stdio (standard for Cursor/Claude Code MCP servers). Logging goes to stderr only.

### Authentication

Zendesk API token auth via environment variables:
- `ZENDESK_SUBDOMAIN` - The Zendesk subdomain (e.g., "inkeep" for inkeep.zendesk.com)
- `ZENDESK_EMAIL` - Email address associated with the API token
- `ZENDESK_API_TOKEN` - Zendesk API token

Auth header format: `Authorization: Basic base64({email}/token:{api_token})`

Validated at startup. Missing vars produce a clear error message and exit(1).

### Zendesk API Details (verified from docs)

**Search API**: `GET /api/v2/search.json?query={query}`
- Query syntax supports operators: `:` (equals), `<` `>` `<=` `>=` (comparison), `""` (phrase), `-` (negation), `*` (wildcard)
- Ticket field keywords: `status`, `priority`, `ticket_type`, `assignee`, `requester`, `submitter`, `group`, `organization`, `tags`, `subject`, `description`, `comment`, `created`, `updated`, `solved`, `due_date`, `via`, `brand`, `form`, `custom_field_{id}`
- Type filter: `type:ticket` (also `type:user`, `type:organization`)
- Date ranges: `created>2024-01-01 created<2024-02-01` or relative `created>4hours`
- Sorting: `order_by:created_at sort:desc` appended to query
- Max 1,000 results. Offset pagination with `page` and `per_page` (max 100).

**Tickets API**: `GET /api/v2/tickets/{id}.json`
- Returns full ticket object with subject, description, status, priority, type, tags, assignee_id, requester_id, etc.

**Comments API**: `GET /api/v2/tickets/{id}/comments.json`
- Cursor pagination: `page[size]` (max 100), `page[after]`
- Response has `links.next`, `meta.has_more`
- Sort: `sort_order=asc|desc` (default asc)
- Comments include `body`, `html_body`, `plain_body`, `author_id`, `public` (public vs internal note), `created_at`, `attachments`

**Users Search API**: `GET /api/v2/users/search.json?query={query}`
- Searches by name, email, external_id
- Returns user objects with `id`, `name`, `email`, `role`, `organization_id`, `active`, `tags`

**Rate Limits**: 200-2500 req/min by plan. 429 response includes `Retry-After` header.

### MCP Tools

All tools use `zendesk_` prefix per MCP naming convention.

#### `zendesk_search_tickets`
Search Zendesk tickets using full-text search with optional structured filters. The tool builds a Zendesk search query from the parameters - the `query` field can contain raw Zendesk query syntax or natural language that the LLM translates.

**Input**:
- `query` (string, required) - Search query. Can include Zendesk operators like `status:open assignee:me created>2days`
- `status` (enum, optional) - Filter: new, open, pending, hold, solved, closed
- `priority` (enum, optional) - Filter: low, normal, high, urgent
- `assignee` (string, optional) - Filter by assignee name or email
- `requester` (string, optional) - Filter by requester name or email
- `tags` (string, optional) - Filter by tag
- `created_after` (string, optional) - ISO date or relative (e.g., "2024-01-01" or "7days")
- `created_before` (string, optional) - ISO date or relative
- `sort_by` (enum, optional) - created_at, updated_at, priority, status, ticket_type (default: relevance)
- `sort_order` (enum, optional) - asc, desc (default: desc)
- `page` (number, optional) - Page number (default: 1)
- `per_page` (number, optional) - Results per page, 1-100 (default: 25)

**Behavior**: Builds query string by appending structured filter params (e.g., `query + " status:open priority:high type:ticket"`). Always includes `type:ticket`.

#### `zendesk_get_ticket`
Get full details of a specific ticket by ID.

**Input**:
- `ticket_id` (number, required) - Ticket ID

**Output**: Ticket subject, description, status, priority, type, tags, assignee, requester, created/updated dates, URL.

#### `zendesk_get_ticket_comments`
Get the conversation thread on a ticket - all public and internal comments.

**Input**:
- `ticket_id` (number, required) - Ticket ID
- `page_size` (number, optional) - Comments per page, 1-100 (default: 50)
- `cursor` (string, optional) - Cursor for next page (from previous response)

**Output**: List of comments with author, body, public/internal flag, created date. Includes `has_more` and `next_cursor` for pagination.

#### `zendesk_list_tickets`
List recent tickets with optional filters. Uses the tickets list endpoint (not search).

**Input**:
- `sort_by` (enum, optional) - created_at, updated_at, priority, status (default: updated_at)
- `sort_order` (enum, optional) - asc, desc (default: desc)
- `page_size` (number, optional) - Results per page, 1-100 (default: 25)
- `cursor` (string, optional) - Cursor for next page

**Output**: List of tickets with basic metadata. Includes `has_more` and `next_cursor`.

#### `zendesk_search_users`
Search for Zendesk users by name or email.

**Input**:
- `query` (string, required) - Search by name, email, or external ID

**Output**: List of matching users with id, name, email, role, organization, active status.

### Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK (stdio transport, tool registration)
- `zod` - Schema validation for tool inputs

No other runtime dependencies. Use native `fetch` for HTTP requests (Node 18+).

### Package Structure

```
packages/zendesk-mcp/
  src/
    index.ts              # Entry point: env validation, server setup, tool registration, stdio connect
    tools/
      search-tickets.ts   # zendesk_search_tickets
      get-ticket.ts       # zendesk_get_ticket
      get-comments.ts     # zendesk_get_ticket_comments
      list-tickets.ts     # zendesk_list_tickets
      search-users.ts     # zendesk_search_users
    lib/
      zendesk-client.ts   # Shared HTTP client: auth, base URL, error handling, rate limit handling
      types.ts            # TypeScript interfaces for Zendesk API responses
      format.ts           # Response formatting helpers (markdown output)
  package.json
  tsconfig.json
  README.md
```

### Build & Distribution

- TypeScript compiled to `dist/` with `tsc`
- Entry point: `dist/index.js` with shebang (`#!/usr/bin/env node`)
- `bin` field in package.json: `{ "zendesk-mcp": "dist/index.js" }`
- Published as `@inkeep/zendesk-mcp` to npm
- Runnable via `npx @inkeep/zendesk-mcp`

### Cursor/Claude Code Configuration

```json
{
  "mcpServers": {
    "zendesk": {
      "command": "npx",
      "args": ["@inkeep/zendesk-mcp"],
      "env": {
        "ZENDESK_SUBDOMAIN": "your-subdomain",
        "ZENDESK_EMAIL": "your-email@example.com",
        "ZENDESK_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Acceptance Criteria

1. Running `npx @inkeep/zendesk-mcp` starts a stdio MCP server that responds to the MCP initialize handshake
2. With valid Zendesk credentials configured, an LLM can:
   - "Find tickets about SSO issues from last week" -> zendesk_search_tickets with query and date filter
   - "Show me ticket #12345" -> zendesk_get_ticket
   - "What's the conversation on ticket 12345?" -> zendesk_get_ticket_comments
   - "List open high-priority tickets" -> zendesk_search_tickets with status and priority filters
   - "Find the user john@example.com" -> zendesk_search_users
3. Missing credentials at startup produce a clear error message naming which env vars are missing
4. Invalid credentials (401 from Zendesk) produce a clear "authentication failed" message
5. Rate limit (429) responses include the retry-after value from Zendesk
6. Server starts in <2 seconds
7. README documents: installation, env var setup, Cursor/Claude config, available tools with examples

## Test Cases

1. **Server startup** - Server initializes and lists 5 tools via MCP tools/list
2. **Auth validation** - Missing `ZENDESK_SUBDOMAIN` produces error naming the missing var
3. **Search query building** - `search_tickets({query: "SSO", status: "open", created_after: "7days"})` constructs `SSO status:open created>7days type:ticket`
4. **Search pagination** - page and per_page params forwarded correctly to Zendesk API
5. **Get ticket** - Ticket ID 12345 maps to `GET /api/v2/tickets/12345.json`
6. **Get comments - pagination** - Cursor pagination params forwarded, `has_more` and `next_cursor` returned
7. **Get comments - sort** - Default sort is ascending (chronological)
8. **List tickets** - Cursor pagination params forwarded correctly
9. **Search users** - Query forwarded to `/api/v2/users/search.json?query={query}`
10. **Error: 401** - Zendesk 401 returns "Authentication failed. Check ZENDESK_EMAIL and ZENDESK_API_TOKEN."
11. **Error: 404** - Zendesk 404 for ticket returns "Ticket #12345 not found."
12. **Error: 429** - Zendesk 429 returns "Rate limited. Retry after {n} seconds." with value from Retry-After header
13. **Error: network** - Connection failure returns "Could not connect to Zendesk. Check ZENDESK_SUBDOMAIN."
