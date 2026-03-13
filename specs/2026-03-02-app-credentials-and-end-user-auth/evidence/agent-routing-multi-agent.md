---
title: Agent Routing and Multi-Agent Access Patterns
description: How agentId flows through auth → execution today, what blocks multi-agent access, and how the allowlist model would work.
created: 2026-03-02
last-updated: 2026-03-02
---

## Current: API Key Agent Binding is Strict

In `buildExecutionContext()` (`agents-api/src/middleware/runAuth.ts:97-136`):

For regular API keys, if `x-inkeep-agent-id` header differs from the key's `agentId`:
- **Warning logged** ("API key agent scope mismatch")
- **Header ignored** — key's bound agent wins

Exceptions (allowed to override via header):
- `temp-jwt` (playground sessions)
- `bypass` (dev mode)
- `slack-user-token` (Slack work app)
- `team-agent-token` (A2A delegation)
- `test-key` (tests)

**Confidence:** CONFIRMED (read from source, lines 104-123)

## Chat Route: agentId Comes Entirely from Execution Context

`agents-api/src/domains/run/routes/chat.ts:184-223`:
- `agentId` extracted from `executionContext` (set by auth middleware)
- No `agentId` field in the request body schema
- `x-target-agent-id` header exists but is for telemetry only, doesn't affect routing

**Confidence:** CONFIRMED (read from source)

## Slack Multi-Agent Pattern (Reference Implementation)

`packages/agents-work-apps/src/slack/services/agent-resolution.ts`:

```
resolveEffectiveAgent():
  1. Check channel config (workAppSlackChannelAgentConfigs)
  2. Fall back to workspace default (workAppSlackWorkspaces.defaultAgentId)
  3. Return null if nothing configured
```

Slack then calls `/run/api/chat` with the resolved agentId in `x-inkeep-agent-id` header. This works because Slack uses JWT tokens (exempt from the strict binding).

**Confidence:** CONFIRMED (read from source)

## What Multi-Agent App Credentials Need

### Auth Middleware Changes

For an app credential with `allowedAgentIds: ['agent-1', 'agent-2', 'agent-3']`:

1. Client sends request with app credential token + `agentId` (header or body)
2. Auth middleware validates token → loads app config
3. If `agentId` specified and is in `allowedAgentIds` → allow
4. If `agentId` specified but NOT in `allowedAgentIds` → 403
5. If `agentId` not specified → use default (first in list, or configured default)

### Where Should Client Specify agentId?

Options:
- **Header** (`x-inkeep-agent-id`): Already exists, already used by Slack. Consistent.
- **Request body** (`agentId` field): More discoverable for API consumers. But this header already exists.
- **URL path** (`/run/api/agents/{agentId}/chat`): RESTful but would require route restructuring.

**Recommendation:** Use the existing `x-inkeep-agent-id` header for backward compatibility with Slack pattern. Optionally also accept in request body for API convenience.

### Agent Access Storage

Options for storing allowed agents:
1. **JSONB array on app credential** (`allowedAgentIds: ['a', 'b', 'c']`):
   - Pro: Simple, single table, matches tools' JSONB config pattern
   - Con: No FK enforcement (agents are in manage DB, app credentials in runtime DB — cross-DB FK impossible anyway)
   - Con: Querying "which apps can access agent X?" requires JSON contains query

2. **Join table** (`app_credential_agents`):
   - Pro: Queryable in both directions, indexed
   - Con: More tables, more joins, more migration
   - Con: Still no FK to manage DB

3. **Part of JSONB config** (inside the type-specific config):
   - Pro: No schema change, everything in config
   - Con: Harder to query across app types, mixed with type-specific fields

**Recommendation:** JSONB array in a shared column (not inside type-specific config). `allowedAgentIds` is a common concern across all app types, so it belongs at the base level. A GIN index on the JSONB column enables efficient reverse lookups.

**Confidence:** INFERRED (design recommendation based on codebase patterns)

## Backward Compatibility

Existing API keys have `agentId` (single, required). Migration to app credentials:
- Each existing API key becomes an app credential of type `api` with `allowedAgentIds: [originalAgentId]`
- The original `agentId` semantics are preserved — only one agent accessible
- The strict enforcement in `buildExecutionContext()` is relaxed for app credentials with multi-agent access

**Confidence:** INFERRED
