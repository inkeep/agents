---
title: Current API Key System
description: Traces the existing API key model — schema, validation, auth middleware integration, and how keys map to tenant/project/agent.
created: 2026-03-02
last-updated: 2026-03-02
---

## API Key Schema (Runtime DB — PostgreSQL)

**Table:** `api_keys` in `packages/agents-core/src/db/runtime/runtime-schema.ts:134-157`

Key characteristics:
- **Scoped to:** `(tenantId, projectId, agentId)` — each key binds to exactly ONE agent
- **Primary key:** `(tenantId, projectId, id)`
- **Unique index on `publicId`** — enables O(1) lookup during validation
- **Key format:** `sk_<publicId>.<secret>` — publicId is 12 chars alphanumeric+hyphen
- **Hash:** scrypt with 32-byte random salt, 64-byte key length, timing-safe comparison
- **Exposure control:** Full key shown only once at creation. API responses show only `keyPrefix` (first 12 chars).
- **Optional expiration** via `expiresAt`

**Confidence:** CONFIRMED (read from source)

## Auth Middleware Priority Chain

**File:** `agents-api/src/middleware/runAuth.ts:485-514`

```
1. JWT Temp Token      → tryTempJwtAuth()     (playground sessions)
2. Bypass Secret       → tryBypassAuth()      (dev/test)
3. Slack User JWT      → trySlackUserJwtAuth() (Slack work app delegation)
4. Regular API Key     → tryApiKeyAuth()       (database API key — widget/SDK)
5. Team Agent Token    → tryTeamAgentAuth()    (intra-tenant A2A delegation)
→ If all fail: 401
```

The API key auth path:
1. Extract `publicId` from key format
2. O(1) lookup by `publicId` in `api_keys` table
3. scrypt hash comparison (timing-safe)
4. Expiration check
5. Update `lastUsedAt`
6. Return `{ tenantId, projectId, agentId, apiKeyId }`

**Confidence:** CONFIRMED (read from source)

## Execution Context

**File:** `packages/agents-core/src/types/utility.ts:281-313`

API key auth populates `BaseExecutionContext`:
- `apiKey` — original bearer token
- `apiKeyId` — the key record's ID (or "temp-jwt", "bypass", etc.)
- `tenantId`, `projectId`, `agentId` — all from the key record
- `metadata.initiatedBy` — NOT set for API key auth (only for user sessions and Slack)

**Confidence:** CONFIRMED (read from source)

## Manage API Routes for API Keys

**File:** `agents-api/src/domains/manage/routes/apiKeys.ts`

CRUD endpoints at `/manage/tenants/{tenantId}/projects/{projectId}/api-keys/`:
- `POST` (create) — requires `agentId` + `name`, returns full key once
- `GET` (list) — supports optional `agentId` filter
- `GET /:id` — single key metadata
- `PUT /:id` — update name/expiration
- `DELETE /:id` — hard delete

**Confidence:** CONFIRMED (read from source)

## Key Limitations for App Credentials Migration

1. **Each API key binds to exactly one agent.** No multi-agent access.
2. **No type/mode field.** All keys are identical — no concept of "web widget" vs "API" vs "Slack."
3. **No domain restrictions.** No referrer/origin validation per key.
4. **No end-user identity.** Keys identify the customer's project, not the end-user chatting.
5. **No anonymous session support.** Every request uses the same key identity.
6. **Runtime DB only.** Keys are in PostgreSQL, not versioned in Doltgres.

**Confidence:** CONFIRMED (negative search — no such features found in code)
