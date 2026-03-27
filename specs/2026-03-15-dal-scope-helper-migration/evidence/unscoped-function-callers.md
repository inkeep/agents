---
title: Unscoped Runtime DAL Function Caller Analysis
description: Traces all callers of 7 unscoped runtime DAL functions to determine blast radius of adding scope parameters. Critical finding — apiKey auth functions CANNOT be scoped.
created: 2026-03-15
last-updated: 2026-03-15
---

## Functions Analyzed

### Tier 1: Auth/Discovery Functions (CANNOT scope)

#### `getApiKeyByPublicId` (apiKeys.ts)
- **Caller:** `validateAndGetApiKey()` in same file (line 256)
- **Has scopes?** NO — this is the O(1) lookup that DISCOVERS tenantId/projectId from a publicId
- **Verdict:** CANNOT SCOPE — would create circular dependency (need tenantId to look up the key that provides tenantId)

#### `validateAndGetApiKey` (apiKeys.ts)
- **Caller:** `tryApiKeyAuth()` in `agents-api/src/middleware/runAuth.ts:242`
- **Has scopes?** NO — auth middleware has only the raw API key string
- **Verdict:** CANNOT SCOPE — this IS the auth entry point that transforms a key string into authenticated context

#### `updateApiKeyLastUsed` (apiKeys.ts)
- **Caller:** `validateAndGetApiKey()` in same file (line 271)
- **Has scopes?** PARTIAL — the full `ApiKeySelect` record (containing tenantId/projectId) IS available at the call site
- **Verdict:** CAN scope with minor refactor — pass scopes extracted from the apiKey record

### Tier 2: Consumption Functions (Safe to scope)

#### `getTask` (tasks.ts)
- **Callers:**
  - `ExecutionHandler.execute()` in `agents-api/src/domains/run/handlers/executionHandler.ts:208` — has `executionContext.tenantId/projectId`
  - `ArtifactService.getContextArtifacts()` in `agents-api/src/domains/run/artifacts/ArtifactService.ts:143` — has `this.context.executionContext`
- **Verdict:** Safe. Both callers have full scope context.

#### `updateTask` (tasks.ts)
- **Callers (6 sites, all in executionHandler.ts and a2a/handlers.ts):**
  - `executionHandler.ts:369` (error path) — has `executionContext`
  - `executionHandler.ts:537` (completion) — has `executionContext`
  - `executionHandler.ts:637` (error path 2) — has `executionContext`
  - `executionHandler.ts:700` (max transfers) — has `executionContext`
  - `executionHandler.ts:748` (exception) — has `executionContext`
  - `a2a/handlers.ts:286` — has `agent.tenantId/projectId` from `RegisteredAgent`
- **Verdict:** Safe. All callers have scope context.

#### `listTaskIdsByContextId` (tasks.ts)
- **Caller:** `ArtifactService.getContextArtifacts()` at line 138 — has `this.context.executionContext`
- **Verdict:** Safe. Single caller has full scope context.

#### `getCacheEntry` (contextCache.ts)
- **Caller:** `ContextCache.get()` in `agents-api/src/domains/run/context/contextCache.ts:63` — has `this.executionContext`
- **Verdict:** Safe. Caller already has execution context with tenantId/projectId.

## Confidence: CONFIRMED (traced from source code)
