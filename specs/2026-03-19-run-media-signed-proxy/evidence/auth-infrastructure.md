---
title: Auth Infrastructure & Signing Secrets
description: Available secrets, auth models, and crypto patterns in agents-api relevant to signed media URLs.
created: 2026-03-19
last-updated: 2026-03-19
---

## 1. Available Secrets

**Source:** `agents-api/src/env.ts`
**Confidence:** CONFIRMED

| Secret | Purpose | Min length | Required? |
|---|---|---|---|
| `INKEEP_ANON_JWT_SECRET` | Signs anonymous session JWTs (HS256) | 32 chars | Required in production, random fallback in dev/test |
| `GITHUB_STATE_SIGNING_SECRET` | Signs GitHub OAuth state | 32 chars | Optional |
| `GITHUB_WEBHOOK_SECRET` | Validates GitHub webhook payloads | — | Optional |

`getAnonJwtSecret()` at `agents-api/src/domains/run/routes/auth.ts:22-32` wraps the env var with a dev fallback (random UUID).

## 2. Existing HMAC Usage

**Source:** `agents-api/src/__tests__/run/routes/webhooks.test.ts:566`
**Confidence:** CONFIRMED

The codebase uses `createHmac('sha256', secret).update(payload).digest('hex')` for webhook signature verification. No shared HMAC signing utility exists — each callsite imports `createHmac` directly from `node:crypto`.

## 3. Auth Models by Domain

**Source:** `agents-api/src/middleware/runAuth.ts`, route files
**Confidence:** CONFIRMED

| Domain | Auth middleware | Strategies |
|---|---|---|
| `/run` | `inheritedRunApiKeyAuth()` | 1) Anonymous JWT (via `INKEEP_ANON_JWT_SECRET`), 2) Bypass secret (dev), 3) Database API key, 4) Team agent token |
| `/manage` | `requireProjectPermission('view'\|'edit')` | Tenant session + RBAC |

The `/run` domain also has `noAuth()` routes: webhooks, PoW challenge, anonymous session creation.

## 4. Route Registration Pattern

**Source:** `agents-api/src/domains/run/index.ts:12-19`
**Confidence:** CONFIRMED

```typescript
const app = new OpenAPIHono<{ Variables: AppVariables }>();
app.route('/v1/chat', chatRoutes);
app.route('/v1/conversations', conversationRoutes);
app.route('/api', chatDataRoutes);
app.route('/v1/mcp', mcpRoutes);
app.route('/agents', agentRoutes);
app.route('/auth', authRoutes);
app.route('/webhooks', webhookRoutes);
```

New routes can be added as a new file in `agents-api/src/domains/run/routes/` and registered in `index.ts`.

## 5. Existing Media Proxy (Manage Domain)

**Source:** `agents-api/src/domains/manage/routes/conversations.ts:256-340`
**Confidence:** CONFIRMED

- Route: `GET /manage/tenants/:tenantId/projects/:projectId/conversations/:id/media/:mediaKey`
- Permission: `requireProjectPermission('view')`
- Validates: path traversal, null bytes, `..` segments
- Reconstructs storage key: `buildMediaStorageKeyPrefix({tenantId, projectId, conversationId}) + '/' + mediaKey`
- Downloads from blob storage, returns with `Content-Type` + `Cache-Control: private, max-age=31536000, immutable`

## 6. `noAuth()` Pattern

**Source:** Webhook routes, auth routes
**Confidence:** CONFIRMED

`noAuth()` marks a route as intentionally unauthenticated in the OpenAPI spec. The route handler is responsible for its own auth (e.g., webhook signature verification). This is the right pattern for signed-URL media proxy — the URL signature IS the auth.
