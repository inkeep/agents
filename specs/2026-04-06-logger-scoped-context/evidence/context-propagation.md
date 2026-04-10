---
title: Current context propagation patterns in the codebase
sources:
  - agents-api/src/createApp.ts
  - agents-api/src/middleware/runAuth.ts
  - agents-api/src/middleware/tenantAccess.ts
  - agents-api/src/middleware/tracing.ts
  - agents-api/src/middleware/branchScopedDb.ts
  - agents-api/src/domains/run/handlers/executionHandler.ts
  - agents-api/src/domains/run/workflow/steps/agentExecutionSteps.ts
  - packages/agents-core/src/dolt/ref-scope.ts
  - agents-manage-ui/src/lib/logger.ts
---

## Existing ALS usage (3 instances)

1. **ref-scope.ts** — AsyncLocalStorage<RefScopeContext> for nested withRef detection
2. **agents-manage-ui/lib/logger.ts** — AsyncLocalStorage<Map<string,string>> for requestId in logs
3. **OpenTelemetry** — AsyncLocalStorageContextManager for trace context propagation

## Hono middleware chain — context availability

### Run routes (/run/*)
Context set by: runApiKeyAuth → runRefMiddleware → projectConfigMiddleware → executionBaggageMiddleware
Available at middleware end: executionContext (tenantId, projectId, agentId, baseUrl, resolvedRef)

### Manage routes (/manage/tenants/*)
Context set by: manageAuth → tenantAccess → manageRefMiddleware → branchScopedDb
Available at middleware end: tenantId, tenantRole, userId, resolvedRef, db
projectId: from path param c.req.param('projectId'), NOT from middleware

## Insertion points for runWithLogContext

### Run routes
After executionBaggageMiddleware, before app.route('/run', runRoutes)
Reads: c.get('executionContext') → { tenantId, projectId, agentId }

### Manage routes
After branchScopedDbMiddleware, before app.route('/manage', manageRoutes)
Reads: c.get('tenantId'), c.req.param('projectId')

## Execution paths vs ALS feasibility

| Path | ALS works? | Notes |
|---|---|---|
| Classic (in-request) | Yes | Clean async chain from middleware to handlers |
| Durable workflow steps | Within step | Each step reconstructs context via buildAgentForStep |
| Across step boundaries | No (not needed) | Serialization boundary, context already reconstructed |
| Scheduled triggers | Same as durable | Job worker reconstructs context |
| A2A self-calls | Yes | getInProcessFetch re-enters middleware → new ALS scope |

## Current context passing pattern
Universally explicit parameter passing. No DI container, no service locator, no ALS for business context.
Every service function takes tenantId, projectId etc. as named params.
