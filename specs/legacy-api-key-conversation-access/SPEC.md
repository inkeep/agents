# SPEC: Legacy API Key Access for Get Conversation Endpoint

## Problem Statement

A customer is using the deprecated database API key (run-domain API key) and needs to access the manage-domain endpoint `GET /manage/tenants/:tenantId/projects/:projectId/conversations/:conversationId` to retrieve conversation data. Currently, the manage domain explicitly rejects database API keys — only session cookies, bypass secrets, Slack JWT tokens, and internal service tokens are accepted.

This is a **one-off legacy exception** for this specific endpoint only. The caller must already know the `conversationId`, so the security exposure is minimal — they can only retrieve conversations they already know the ID of, within their own tenant/project scope.

## Root Cause

The `manageBearerAuth` middleware in `agents-api/src/middleware/manageAuth.ts` intentionally does not include database API key validation as an auth strategy. This is by design — manage endpoints require session-based auth. However, this specific endpoint needs a legacy exception.

## Scope

- **In scope:** Allow database API keys to authenticate against `GET /manage/tenants/:tenantId/projects/:projectId/conversations/:conversationId` only
- **Out of scope:** Any other manage endpoint, any non-GET method, the list conversations endpoint (`GET .../conversations`), conversation bounds, or conversation media endpoints

## Technical Design

### Auth middleware chain (existing)

```
manageBearerOrSessionAuth() → requireTenantAccess() → [route handler with requireProjectPermission('view')]
```

### Change

In `manageBearerAuth()` (`agents-api/src/middleware/manageAuth.ts`):

1. After all existing auth strategies fail (bypass, session, Slack JWT, internal service), add a final fallback:
   - Check if the request matches `GET /manage/tenants/:tenantId/projects/:projectId/conversations/:conversationId` (must be GET, must have a conversation ID segment — not the list endpoint)
   - If so, validate the bearer token as a database API key using the existing `validateAndGetApiKey()` from `@inkeep/agents-core`
   - If valid, set `userId` to `apikey:{apiKeyId}` and `tenantId` from the API key record
   - Call `next()` — downstream middleware handles tenant isolation and project permission checks

2. The downstream middleware already supports `apikey:` prefixed userIds:
   - `requireTenantAccess()` (line 77): validates API key tenant matches route tenant, grants `OWNER` role
   - `requireProjectPermission()` (line 57): bypasses SpiceDB permission check for `apikey:` users

### Route matching

Use a regex: `/\/manage\/tenants\/[^/]+\/projects\/[^/]+\/conversations\/[^/]+$/`

This matches only the get-by-ID endpoint (has a conversation ID segment) and excludes:
- List endpoint: `/manage/tenants/:tenantId/projects/:projectId/conversations` (no trailing ID)
- Bounds: `.../conversations/:id/bounds`
- Media: `.../conversations/:id/media/:mediaKey`

## Acceptance Criteria

1. A valid database API key can authenticate against `GET /manage/tenants/:tenantId/projects/:projectId/conversations/:conversationId` and receive conversation data
2. The API key's tenant must match the `:tenantId` in the path (enforced by existing `requireTenantAccess`)
3. The same API key is still rejected on all other manage endpoints
4. Non-GET methods (POST, PUT, PATCH, DELETE) on the conversation endpoint are still rejected for API keys
5. The list conversations endpoint (`GET .../conversations` without ID) does not accept API keys
6. Sub-endpoints (bounds, media) do not accept API keys
7. All existing auth methods (session, bypass, Slack JWT, internal service) continue to work unchanged

## Test Cases

1. **Happy path**: Valid API key → GET conversation by ID → 200 with conversation data
2. **Wrong tenant**: Valid API key for tenant A → GET conversation in tenant B → 403
3. **Other manage endpoint**: Valid API key → GET agents list → 401 (rejected)
4. **List endpoint**: Valid API key → GET conversations (list, no ID) → 401 (rejected)
5. **Non-GET method**: Valid API key → POST/PATCH/DELETE on conversation → 401 (rejected)
6. **Invalid API key**: Invalid key → GET conversation by ID → 401 (rejected)
7. **Session auth still works**: Valid session → GET conversation by ID → 200 (unchanged)
8. **Bypass still works**: Bypass secret → any manage endpoint → 200 (unchanged)

## Non-Goals

- Extending API key support to other manage endpoints
- Changing the API key validation logic itself
- Adding new API key types or scopes
