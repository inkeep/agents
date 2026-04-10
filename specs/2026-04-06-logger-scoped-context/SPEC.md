# Logger Scoped Context — Spec

**Status:** In Review
**Owner(s):** Andrew
**Last updated:** 2026-04-06
**Baseline commit:** 2ebcf653b
**Links:**
- Evidence: [./evidence/](./evidence/) (spec-local findings)

---

## 1) Problem statement

**Situation:** The codebase has ~2,280 logger calls across ~220 files. The `PinoLogger` class exposes `error/warn/info/debug(data, message)` where `data` is a plain object of context fields. Every call manually constructs this object. In practice, 3-7 fields like `tenantId`, `projectId`, `agentId`, `sessionId`, `conversationId` are known at function/scope entry and repeated identically across every logger call in that scope. The fields `tenantId` and `projectId` alone account for 702 repetitions.

**Complication:** This repetition creates three compounding problems: (1) verbosity — developers must copy-paste context objects across every log line, making the actual log message (the "what happened") hard to spot; (2) inconsistency risk — it's easy to forget a field or misspell one, leading to logs that are missing context in exactly the situation where you need it most (errors); (3) maintenance drag — adding a new contextual field to a logging scope means editing every call site in that scope, which discourages adding useful context.

**Resolution:** Add scoped context to the logger using AsyncLocalStorage to store pino child loggers. Middleware sets request-level context once; nested `runWithLogContext()` calls incrementally add operation-level context. Class members capture the scoped logger at construction time. All downstream log calls automatically inherit accumulated context with negligible per-call overhead (~10ns for ALS proxy resolution; pino pre-serializes child bindings).

## 2) Goals
- G1: Eliminate repetitive context fields from logger call sites (~2,000 field instances across ~1,200 calls; counts are approximate from automated analysis)
- G2: Make it trivial to add new context fields to a logging scope without touching every call site
- G3: Negligible per-log-call performance overhead (~10ns vs current baseline, <0.05% of a pino call) via pino child pre-serialization
- G4: Backward compatible — existing `getLogger(name)` and `logger.info(data, msg)` continue to work unchanged

## 3) Non-goals

- **[NEVER]** NG1: Replace Hono's `c.set()`/`c.get()` context system — logger context is orthogonal to request context
- **[NOT NOW]** NG2: Migrate all 2,278 logger calls in one PR — Revisit if: incremental adoption proves confusing
- **[NOT NOW]** NG3: Structured log level management per scope — Revisit if: need dynamic log levels per tenant/request
- **[NOT UNLESS]** NG4: Custom transport per scope — Only if: multi-tenant log routing becomes a requirement

## 4) Personas / consumers
- P1: **Framework developers** — write route handlers, services, workflow steps. Primary beneficiaries of reduced verbosity.
- P2: **On-call engineers** — read production logs. Benefit from consistent, complete context on every log line.
- P3: **AI coding agents** — generate new code with logger calls. Simpler API reduces likelihood of missing context fields.

## 5) User journeys

### P1: Framework developer adding a new service

**Happy path:**
1. Import `getLogger` from `@inkeep/agents-core`
2. Call `const logger = getLogger('MyService')` — automatically inherits request-level context (tenantId, projectId, agentId) from ALS if in a request scope
3. For operation-specific context, wrap in `runWithLogContext({ triggerId }, async () => { ... })`
4. Log with `logger.info({ perCallField }, 'message')` — ambient fields are included automatically
5. Pass no context to downstream service calls — they get the same ambient context from ALS

**Class member pattern:**
1. In constructor: `this.logger = getLogger('AgentSession').with({ sessionId })`
2. In methods: `this.logger.info({}, 'processing')` — sessionId + all ALS context included
3. For sub-scopes in methods: `const log = this.logger.with({ artifactId })`

**Failure / recovery:**
- If called outside any ALS scope (tests, scripts), `getLogger()` returns the base logger — no crash, just no ambient context
- If ALS store is corrupted (shouldn't happen), same fallback

### P2: On-call engineer reading logs
- Every log line for a request includes tenantId, projectId, agentId without relying on the developer remembering to add them
- Nested scopes add triggerId, invocationId, sessionId etc. — log lines within that scope are fully contextualized
- No change to log output format — same pino JSON, just more consistent field presence

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | `runWithLogContext(bindings, fn)` creates a child pino logger in ALS and runs `fn` in that scope | Child logger includes parent bindings + new bindings; downstream `getLogger()` calls return the child | Core primitive |
| Must | `getLogger(name?)` returns the ALS-scoped logger if available, base logger otherwise | In ALS scope: returns scoped child. Outside: returns base logger with `name` binding | Backward compatible |
| Must | `PinoLogger.with(bindings)` returns a new `PinoLogger` wrapping `pino.child(bindings)` | Returned logger has same API as parent; bindings are pre-serialized | For class members and local scoping |
| Must | Hono middleware sets request-level context for `/run/*` and `/manage/tenants/*` routes | tenantId, projectId, agentId (run) and tenantId, projectId (manage) available in all downstream logs | Middleware insertion in createApp.ts |
| Should | Workflow steps set their own scope at entry | `callLlmStep`, `executeToolStep` etc. wrap body in `runWithLogContext()` | ~5 workflow step functions |
| Should | `AgentSession` and similar classes use `this.logger = getLogger().with({ sessionId })` pattern | Class-level logger inherits ALS context at construction time + adds class-specific fields | ~30 classes |
| Could | Provide a `getLogContext()` function to read current ALS bindings for non-logging use | Returns current accumulated bindings or empty object | Useful for error reporting |

### Non-functional requirements
- **Performance:** Negligible per-log-call overhead (~10ns, <0.05% of baseline pino call cost). Each `.info()/.error()` call does `getStore()` (~5ns) + `WeakMap.get()` (~5ns) for ALS proxy resolution. `pino.child()` (~26us) only at scope creation.
- **Reliability:** Fallback to base logger if ALS store is unavailable. No crash paths.
- **Security/privacy:** No change to log redaction rules (existing `redact` config preserved on child loggers).
- **Operability:** Log output format unchanged — same pino JSON structure, same transports.
- **Cost:** Net reduction in code size (~1,370 lines removed).

## 7) Success metrics & instrumentation
- **Metric 1: Context completeness** — After middleware adoption, 100% of run/manage request logs include tenantId and projectId (vs current inconsistent coverage)
  - Baseline: ~53% of logger calls include tenantId
  - Target: 100% of request-scoped logger calls include tenantId
  - Instrumentation: Spot-check via log queries
- **Metric 2: Code reduction** — Net ~1,370 lines removed, ~2,081 repeated field instances eliminated
  - Baseline: 2,278 logger calls, 1,207 with repeated ambient fields
  - Target: 1,207 calls simplified, 475 data objects removed entirely
- **What we will log/trace:** No new log lines. Existing lines get more consistent context.

## 8) Current state (how it works today)

### Logger architecture
- `PinoLogger` class in `packages/agents-core/src/utils/logger.ts` wraps pino
- `LoggerFactory` singleton caches `PinoLogger` instances by name
- `getLogger(name)` is the public API, re-exported from `agents-api/src/logger.ts`
- No `child()` method. No ALS integration. No scoped context.

### Import chain
- `agents-api` files: `import { getLogger } from '../logger'` → re-exports from `@inkeep/agents-core`
- `agents-core` files: `import { getLogger } from '../utils/logger'` (direct)
- `agents-work-apps` files: import from `@inkeep/agents-core`
- `agents-sdk` files: import from `@inkeep/agents-core`
- `agents-manage-ui`: has its **own** logger in `src/lib/logger.ts` with ALS-based requestId scoping (prior art)

### Context propagation
- Run routes: `executionContext` (tenantId, projectId, agentId) set by `runApiKeyAuth` middleware
- Manage routes: `tenantId` set by `requireTenantAccess` middleware; `projectId` from path params
- Services: explicit parameter passing universally. No DI, no ALS for business context.
- Workflows: payload serialized; steps reconstruct context from scratch via `buildAgentForStep()`

### Existing ALS usage
1. `ref-scope.ts` — `AsyncLocalStorage<RefScopeContext>` for nested `withRef` detection
2. `agents-manage-ui/lib/logger.ts` — `AsyncLocalStorage<Map<string,string>>` for requestId
3. OpenTelemetry — `AsyncLocalStorageContextManager` for trace context

## 9) Proposed solution (vertical slice)

### API surface (in `packages/agents-core/src/utils/logger.ts`)

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Logger as PinoLoggerInstance } from 'pino';

// New: ALS storage for scoped pino logger
const loggerStorage = new AsyncLocalStorage<PinoLoggerInstance>();

// New: create a child scope — core primitive
export function runWithLogContext<T>(bindings: Record<string, unknown>, fn: () => T): T {
  const parent = loggerStorage.getStore() ?? baseInstance;
  const child = parent.child(bindings);
  return loggerStorage.run(child, fn);
}

// Unchanged: getLogger(name) still returns PinoLogger from factory cache
// The magic is in PinoLogger's method resolution, not in getLogger()

class PinoLogger {
  private alsChildCache = new WeakMap<PinoLoggerInstance, PinoLoggerInstance>();

  // New: resolve the active pino instance (ALS child or own instance)
  private resolveInstance(): PinoLoggerInstance {
    const alsInstance = loggerStorage.getStore();
    if (!alsInstance) return this.pinoInstance;

    let cached = this.alsChildCache.get(alsInstance);
    if (!cached) {
      cached = alsInstance.child({ module: this.name });
      this.alsChildCache.set(alsInstance, cached);
    }
    return cached;
  }

  // Modified: delegate to resolved instance
  info(data: any, message: string): void {
    this.resolveInstance().info(data, message);
  }
  warn(data: any, message: string): void {
    this.resolveInstance().warn(data, message);
  }
  error(data: any, message: string): void {
    this.resolveInstance().error(data, message);
  }
  debug(data: any, message: string): void {
    this.resolveInstance().debug(data, message);
  }

  // New: create an explicit child logger (for class members)
  with(bindings: Record<string, unknown>): PinoLogger {
    return new PinoLogger(this.name, {
      fromInstance: this.resolveInstance().child(bindings)
    });
  }
}
```

**Key properties of the proxy pattern:**
- Module-scope `const logger = getLogger('X')` works without changes (~177 files)
- When inside ALS scope, `logger.info({}, 'msg')` automatically includes ALS context
- `module: 'X'` name preserved via cached child creation
- Per-call cost: `getStore()` (~5ns) + `WeakMap.get()` (~5ns) = ~10ns
- WeakMap keys are ALS pino instances; children GC'd when scope ends
- `.with()` captures current ALS context + explicit bindings at call time (snapshot semantics — see constraints below)
- `recreateInstance()` clears the WeakMap cache to ensure transport/option changes propagate

**Constraints:**
- `.with()` uses **snapshot semantics**: it captures the current ALS context at call time and bakes it into a new `PinoLogger`. The returned logger does NOT continue to proxy ALS. This is safe for the current codebase because all target classes (AgentSession, ExecutionHandler, ArtifactService, Compressors) are per-request and do not outlive their construction-time ALS scope. If a future class needs cross-request reuse, it should call `getLogger()` per-request instead of caching a `.with()` result.
- `addTransport()`/`removeTransport()`/`updateOptions()` clear the WeakMap cache so subsequent ALS-scoped calls pick up the new configuration.

### Middleware integration (in `agents-api/src/createApp.ts`)

```typescript
// After executionBaggageMiddleware, before app.route('/run', runRoutes)
app.use('/run/*', async (c, next) => {
  const ctx = c.get('executionContext');
  if (ctx) {
    return runWithLogContext(
      { tenantId: ctx.tenantId, projectId: ctx.projectId, agentId: ctx.agentId },
      () => next()
    );
  }
  return next();
});

// After branchScopedDbMiddleware, before app.route('/manage', manageRoutes)
app.use('/manage/tenants/*', async (c, next) => {
  const tenantId = c.get('tenantId');
  const projectId = c.req.param('projectId');
  return runWithLogContext(
    { tenantId, ...(projectId && { projectId }) },
    () => next()
  );
});
```

### Class member pattern (e.g., AgentSession)

```typescript
class AgentSession {
  private logger: PinoLogger;

  constructor(sessionId: string) {
    this.logger = getLogger('AgentSession').with({ sessionId });
  }

  processArtifact(artifactId: string) {
    const log = this.logger.with({ artifactId });
    log.info({}, 'processing artifact');
  }
}
```

### Workflow step pattern

```typescript
async function callLlmStep({ payload }) {
  return runWithLogContext(
    { tenantId: payload.tenantId, projectId: payload.projectId, agentId: payload.agentId },
    async () => {
      const logger = getLogger('callLlmStep');
      logger.info({}, 'starting LLM call');
    }
  );
}
```

### System design

- **Architecture:** Single `AsyncLocalStorage<PinoLoggerInstance>` in `logger.ts`. Middleware creates the initial scope. Nested `runWithLogContext()` calls create child scopes. Class members capture via `.with()`.
- **Data model:** No schema changes. No new tables. No migrations.
- **API/transport:** No external API changes. Internal logger API additions only.
- **Auth/permissions:** No changes.
- **Observability:** Log output format unchanged. Context fields more consistently present.

### Alternatives considered

- **Option A: Mixin + ALS (read store on every log call)** — `getStore()` + object merge on every `.info()/.error()` call. Rejected: unnecessary per-call overhead vs child pre-serialization.
- **Option B: Explicit logger passing (no ALS)** — Pass scoped logger as function parameter. Rejected by user: too invasive, requires changing every function signature.
- **Option C: Hono context only (no ALS)** — Store child logger in `c.set('logger')`. Rejected: doesn't propagate beyond Hono handlers into services, data-access layer, or workflow steps.
- **Why we chose the proposed solution:** ALS + pino child combines negligible per-call overhead (~10ns) with automatic cross-file propagation. Already proven pattern in the codebase (manage-ui, ref-scope, OTel).

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Use AsyncLocalStorage to store pino child logger instances (not data bags) | Technical | LOCKED | No | Pre-serialized bindings = zero per-call overhead. Data bag approach requires per-call merge. | [als-performance.md](evidence/als-performance.md) | Single ALS instance for logger context |
| D2 | Middleware sets request-level context (tenantId, projectId, agentId) automatically | Technical | LOCKED | No | These fields are available after auth middleware and account for 702 of 2,081 repeated instances | [context-propagation.md](evidence/context-propagation.md) | Two middleware insertions in createApp.ts |
| D3 | Class members use `getLogger().with({ field })` pattern (not ALS nesting) | Technical | DIRECTED | No | Classes own their logger instance; ALS provides the parent context at construction time. Details of which classes to convert are flexible. | Conversation with user | ~30 classes to update |
| D4 | `PinoLogger.with(bindings)` returns a new `PinoLogger` (immutable, not mutable addScope) | Technical | LOCKED | No | Immutable child creation aligns with pino's model and avoids spooky action at a distance | Pino API design | Consistent with pino.child() semantics |
| D5 | Backward compatible: existing `getLogger(name)` and `logger.info(data, msg)` unchanged | Cross-cutting | LOCKED | No | Allows incremental adoption; no big-bang migration required | User direction | Existing code works without changes |
| D6 | `runWithLogContext(bindings, fn)` is the scope creation primitive | Technical | LOCKED | No | Mirrors ALS.run() pattern, already used in ref-scope.ts | [context-propagation.md](evidence/context-propagation.md) | Nested calls compose (child inherits parent bindings) |
| D7 | Workflow steps set their own ALS scope at entry | Technical | DIRECTED | No | Workflow serialization boundary means ALS can't propagate across steps; each step reconstructs. Direction set, implementation details flexible. | [context-propagation.md](evidence/context-propagation.md) | ~5 step functions to wrap |
| D8 | Module-scope loggers use ALS proxy pattern with WeakMap-cached children | Technical | LOCKED | No | ~177 files use `const logger = getLogger('X')` at module scope. Proxy resolves ALS instance at call time, caches child with module name. ~10ns per call. Zero changes needed at call sites. | Benchmarked: WeakMap.get ~5ns, getStore ~5ns | All existing module-scope loggers automatically get ALS context |
| D9 | hono-pino and ALS logger are independent, no middleware ordering concern | Technical | LOCKED | No | hono-pino handles HTTP req/res logging via Hono context. ALS logger handles application logging. Different stores, different concerns. | Verified from hono-pino source + createApp.ts | ALS middleware slots in after hono-pino without conflict |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Should `getLogger()` name parameter become optional when ALS provides context? | Technical | P0 | No | Name serves module identification (separate from context fields). Keep required — ~177 call sites already pass it. | **Resolved: keep required** |
| Q2 | How should hono-pino middleware interact with the new ALS logger? | Technical | P0 | Was blocking | Investigated: hono-pino creates its own child for HTTP req/res logging, stored in Hono context (`c.var.logger`). Does NOT use ALS. Our ALS middleware runs after hono-pino. Independent concerns, no conflict. | **Resolved: no conflict** |
| Q3 | Should `agents-manage-ui`'s existing ALS logger be migrated to use the same pattern? | Cross-cutting | P2 | No | Separate package with its own logger. Could converge later. | Deferred |
| Q4 | How to handle the `evaluationClient.ts` pattern (constructor params used in 126 calls)? | Technical | P0 | No | Constructor does `this.logger = getLogger('EvalClient').with({ tenantId, projectId })`. When constructed inside ALS scope (most cases), inherits ambient context automatically via the proxy resolution. When constructed outside ALS (tests), gets explicit fields only. Both work correctly. | **Resolved: class member pattern** |
| Q5 | Should `runWithLogContext` be exported from `@inkeep/agents-core` public API? | Cross-cutting | P0 | No | Must be exported. Used by agents-api middleware, workflow steps, and potentially SDK/work-apps packages. | **Resolved: export from @inkeep/agents-core** |
| Q6 | What happens when `getLogger()` is called at module scope (top-level const)? | Technical | P0 | Was blocking | **Resolved: ALS proxy pattern.** ~177 files use module-scope `const logger = getLogger('X')`. PinoLogger methods resolve the underlying pino instance at call time: `loggerStorage.getStore() ?? this.pinoInstance`. When ALS is active, creates a child of the ALS instance with `{ module: this.name }`, cached in a WeakMap keyed by the ALS instance. Cost: `getStore()` (~5ns) + `WeakMap.get()` (~5ns) = **~10ns per log call**. WeakMap ensures children are GC'd when ALS scope ends. Zero code changes needed at ~177 call sites. | **Resolved: proxy + WeakMap cache** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | pino.child() pre-serializes bindings and adds zero per-call overhead | HIGH | Verified from pino source code (chindings string concatenation) | N/A — verified | Verified |
| A2 | ALS getStore() is ~5ns on Node.js v22+ | HIGH | Benchmarked externally; matches OTel team's measurements | Before finalization | Active |
| A3 | Adding 1 more ALS instance (total 4 with OTel + ref-scope + this) has negligible impact | HIGH | Linear scaling, ~12ns for 11 instances per benchmarks | Before finalization | Active |
| A4 | hono-pino middleware in createApp.ts won't conflict with our ALS scope | HIGH | Verified: hono-pino uses Hono context (c.var.logger), not ALS. Independent concerns. See Q2. | N/A — verified | Verified |
| A5 | WeakMap.get() is ~5ns per call for caching ALS child loggers | HIGH | Benchmarked locally: 4.5ns with 1 key, 5.9ns with 1000 keys | N/A — verified | Verified |

## 13) In Scope (implement now)

### Core logger changes
- **Goal:** Add scoped context to `PinoLogger` via ALS + `pino.child()`
- **Non-goals:** Don't change log output format, transports, or levels
- **Requirements:** F1-F4 from §6 (runWithLogContext, getLogger ALS, PinoLogger.with, middleware)
- **Proposed solution:** §9
- **Owner:** Andrew
- **Next actions:**
  1. Implement `runWithLogContext`, `getLogger` ALS integration, `PinoLogger.with()` in `logger.ts`
  2. Add middleware to `createApp.ts` for run + manage routes
  3. Add unit tests for scoping, nesting, fallback behavior
- **Risks:** Child logger per-call overhead (acceptable per benchmarks), `.with()` snapshot semantics on future long-lived classes
- **Instrumented:** Existing log output — verify context fields present after middleware adoption

### Adoption in high-impact files (Should)
- **Goal:** Convert the top ~10 files by impact to use scoped context
- **Files:** TriggerService, scheduledTriggers, AgentSession, executionHandler, github routes, agentExecutionSteps, evaluationClient
- **Approach:** Class member `.with()` pattern + `runWithLogContext()` at function entry
- **Owner:** Andrew
- **Next actions:** Convert files, verify log output, measure line reduction

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Backward compatibility | Existing `getLogger(name)` + `logger.info(data, msg)` unchanged | Existing application code works without modification |
| Test infrastructure | Logger mocks in test setup files need `.with()` added to mock shape | Update `agents-api/src/__tests__/setup.ts` and `packages/agents-work-apps/src/__tests__/setup.ts` mock objects |
| Incremental adoption | New ALS context is additive — old-style manual fields still work | Mixed old/new calls in same file produce correct output |
| Log output format | Unchanged pino JSON structure | Compare log samples before/after |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Child logger per-call cost (~23us vs ~11.5us parent baseline in pino benchmarks) | High | Low | In practice, current calls already serialize data objects per-call. Moving fields to pre-serialized chindings offsets most of the delta. Monitor p99 latency in staging. | Andrew |
| WeakMap cache growth under high concurrency | Low | Low | Keys are ALS pino instances (per-request scope), GC'd when scope ends. No accumulation. | Andrew |
| ALS memory leak via timer references | Low | Low | ALS store is a pino logger instance (lightweight). No large objects. Monitor in staging. | Andrew |
| `.with()` snapshot semantics on long-lived objects | Low | Medium | All target classes verified per-request. Documented as constraint. Future classes must re-derive if they outlive their scope. | Andrew |
| Large migration scope (~220 files for full adoption) | Medium | Medium | Phase: core changes first (logger.ts + middleware + test mocks), then convert files incrementally in follow-up PRs | Andrew |

## 15) Future Work

### Explored
- **Full codebase migration (all ~220 files)**
  - What we learned: 1,207 of 2,278 calls benefit. Net ~1,370 lines saved. ~270 `runWithLogContext` wrappers needed.
  - Recommended approach: Incremental — convert top-10 files first, then sweep remaining files in batches
  - Why not in scope now: Core + top files is sufficient to prove the pattern. Full migration is mechanical but large.
  - Triggers to revisit: After core is merged and pattern is validated

- **Converge agents-manage-ui logger**
  - What we learned: manage-ui already has its own ALS logger (requestId scoping). Could share the same pattern.
  - Recommended approach: Refactor manage-ui to use `@inkeep/agents-core` logger with ALS
  - Why not in scope now: Separate package, different deployment, lower impact
  - Triggers to revisit: If manage-ui logger needs additional context fields

### Identified
- **`getLogContext()` utility for non-logging use**
  - What we know: Error reporting, tracing, and other systems could benefit from reading the current log context
  - Why it matters: Consistency between log context and error context (e.g., Sentry tags)
  - What investigation is needed: Identify all consumers beyond logging

### Noted
- **Dynamic log levels per scope** — Could enable per-tenant debug logging without redeploying. Low priority until needed.
- **Structured error serialization in logger** — The `error instanceof Error ? error.message : 'Unknown error'` pattern repeats ~50 times. Could be a logger utility.

## 16) Agent constraints

- **SCOPE:** `packages/agents-core/src/utils/logger.ts`, `agents-api/src/createApp.ts`, `agents-api/src/logger.ts`, top-10 consumer files listed in §13
- **EXCLUDE:** `agents-manage-ui/src/lib/logger.ts` (separate logger, out of scope), log transports, log format/levels, `pino-pretty` configuration, Hono context system (`c.set`/`c.get`)
- **STOP_IF:** `recreateInstance()` interaction causes unexpected behavior in production (D8 constraint), a target class is discovered to be reused across requests (`.with()` snapshot constraint)
- **ASK_FIRST:** Changes to `PinoLogger` constructor signature, changes to `LoggerFactory` caching semantics, any new npm dependency
