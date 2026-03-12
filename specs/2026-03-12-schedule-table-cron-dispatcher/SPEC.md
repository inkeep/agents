# Schedule Table + Cron Dispatcher — Spec

**Status:** Draft
**Owner(s):** —
**Last updated:** 2026-03-12
**Links:**

- Research: [reports/vercel-workflow-deployment-pinning/](../../reports/vercel-workflow-deployment-pinning/REPORT.md)
- Research: [reports/workflow-scheduling-alternatives/](../../reports/workflow-scheduling-alternatives/REPORT.md)
- Evidence: [./evidence/](./evidence/)

---

## 1) Problem Statement

- **Who is affected:** Any user with scheduled triggers (cron or one-time). All deployment modes (Vercel Cloud + self-hosted).
- **What pain:** Vercel Workflow's deployment pinning traps scheduled trigger execution on stale deployments. When new code is deployed, existing daisy-chain workflows continue running old code indefinitely. Bugs fixed in new deploys never take effect for running triggers. This was discovered when PR 2651's fix didn't take effect for scheduled triggers.
- **Why now:** Active bug impacting production scheduled triggers. The architecture amplifies the problem — every `startNextIterationStep()` call re-pins to the old deployment.
- **Current workaround:** Manually restarting all triggers after each deploy. No automated mechanism exists.

## 2) Goals

- **G1:** Scheduled triggers always execute on the latest deployed code, on every deployment (Vercel Cloud) and on server restart (self-hosted).
- **G2:** Zero deploy-time restart overhead — no O(triggers) restart cost per deployment.
- **G3:** ACID-safe dispatch — no double-fires, no missed fires, even under concurrent ticks or multi-instance execution.
- **G4:** Works for both Vercel Cloud and self-hosted (`@workflow/world-postgres` / local).
- **G5:** First execution attempt starts within 1 minute of the scheduled time.

## 3) Non-Goals

- **NG1:** Sub-minute scheduling resolution. 1-minute minimum (Vercel Cron constraint) is acceptable.
- **NG2:** Replacing Vercel Workflows entirely (e.g., with Inngest). This spec uses one-shot Vercel Workflows for durable execution.
- **NG3:** UI changes beyond what's needed for the new data (schedule table is invisible to end users — trigger CRUD stays the same).
- **NG4:** Changing the manage DB schema for `scheduled_triggers`. The source of truth for trigger config stays in DoltgreSQL.
- **NG5:** Per-trigger concurrency limits. Concurrent invocations for the same trigger are allowed. Serialized execution is future work.

## 4) Personas / Consumers

- **P1: Builder** — creates/edits scheduled triggers in the manage UI. No visible change to their workflow. Triggers execute reliably on latest code.
- **P2: Platform operator** — deploys the API. No manual trigger restart after deploy. Scheduling runs automatically.
- **P3: Self-hosted deployer** — runs `@workflow/world-postgres`. Scheduler runs via scheduler workflow or `setInterval`.

## 5) User Journeys

### Happy path (Builder — cron trigger)

1. Builder creates a cron trigger (e.g., `*/5 * * `* *)
2. Trigger syncs to schedule table in runtime Postgres with `next_run_at` computed
3. Every minute, scheduler (Vercel Cron or scheduler workflow) invokes the dispatcher
4. Dispatcher finds trigger due → claims → advances `next_run_at` to next occurrence → starts one-shot workflow → releases claim
5. One-shot workflow executes agent with latest code → marks completed
6. Deploy happens — next tick dispatches on the latest deployment. Zero intervention.

### Happy path (Builder — one-time trigger)

1. Builder creates a one-time trigger with `run_at = 2026-03-15T09:00Z`
2. Trigger syncs to schedule table with `next_run_at = run_at`
3. At 09:00, dispatcher finds trigger due → dispatches one-shot workflow
4. One-shot workflow executes → marks completed → schedule row disabled (no next occurrence)

### Failure / recovery

1. **Transient execution failure:** One-shot workflow retries per `maxRetries` config. If all attempts fail, marks invocation failed. `next_run_at` was already advanced by the dispatcher, so the next occurrence dispatches on schedule regardless.
2. **Concurrent dispatchers:** ACID claim (UPDATE WHERE claimed_at IS NULL) ensures exactly one instance dispatches each occurrence.
3. **Dispatcher crashes after claim, before start:** Stale claim recovery (configurable timeout, default 5 min) resets the claim and rolls back `next_run_at`. Next tick re-dispatches.
4. **Workflow start fails:** Dispatcher rolls back `next_run_at` and releases claim. Next tick retries.
5. **Retries overlap with next occurrence:** Allowed. Each invocation is independent (different `scheduledFor`, different idempotency key, different conversation).

### Deploy path (Platform operator — Vercel)

1. New production deploy goes live
2. Vercel Cron fires at next minute mark → hits dispatcher on **latest deployment** (Vercel guarantee)
3. All one-shot workflows started from this point run latest code
4. No restart endpoint, no migration job, no GitHub Actions step

### Deploy path (Self-hosted)

1. New version deployed, server restarts
2. Scheduler workflow recovers via orphan recovery (postgres world) or restarts (local world)
3. Next tick dispatches on latest code. No pinning.

## 6) Scheduling Guarantees

### Timing

**Guarantee:** The first execution attempt for a scheduled trigger starts within 1 minute of its `scheduledFor` time.

- Cron expressions have minute resolution — triggers are always due at exact minute boundaries (:00:00, :01:00, etc.).
- The dispatcher also ticks every minute at minute boundaries.
- **Normal case:** Trigger due at :05:00, dispatcher tick fires at :05:00 → latency is processing time only (~seconds).
- **Degraded case:** Dispatcher tick misses or is delayed → next tick at :06:00 catches it → ~60s latency.
- Average latency is **seconds**, not tens of seconds. The 1-minute guarantee is a worst-case bound.

### Retries

**Guarantee:** Retries are a continuation of the same invocation and are NOT bound by the 1-minute guarantee.

- Trigger config: `maxRetries` (default 1), `retryDelaySeconds` (default 60), `timeoutSeconds` (default 780)
- A single invocation with retries can take up to `(maxRetries + 1) × timeoutSeconds + maxRetries × retryDelaySeconds` — potentially 26+ minutes at defaults
- Retries DO NOT block the next scheduled occurrence (see Overlap section)

### Overlap

**Guarantee:** Each scheduled occurrence dispatches independently. Concurrent invocations for the same trigger are allowed.

Example: trigger `*/5 * * `* *, execution with retries takes 8 minutes:

```
:00 → dispatched, starts executing
:05 → dispatched (independently), starts executing while :00 is still retrying
:10 → dispatched, :00 may have finished, :05 still running
```

Each invocation has its own invocation record, idempotency key, and conversation. No shared state between concurrent invocations.

**Future work:** Add optional `maxConcurrency` field to trigger config for triggers that need serialized execution.

### Idempotency

**Guarantee:** Each `(scheduledTriggerId, scheduledFor)` pair produces at most one invocation, enforced by the `idempotency_key` unique index on `scheduled_trigger_invocations`.

Even if the dispatcher fires twice for the same occurrence (e.g., race condition), the second workflow's `createInvocationIdempotentStep` returns the existing invocation and skips execution.

## 7) Requirements

### Functional Requirements


| Priority | Requirement                                                              | Acceptance Criteria                                                                                                                                                           | Notes                                                     |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Must     | Schedule table in runtime Postgres denormalizes trigger schedules        | Table contains `(tenant_id, project_id, agent_id, scheduled_trigger_id, cron_expression, cron_timezone, next_run_at, enabled)`. Queryable without DoltgreSQL branch checkout. | Denormalized copy — DoltgreSQL remains source of truth    |
| Must     | Sync mechanism keeps schedule table in sync with manage DB               | CRUD operations on `scheduled_triggers` write-through to schedule table. Bulk resync available for recovery.                                                                  | Must handle branch-scoped DoltgreSQL reads                |
| Must     | Cron dispatcher finds due triggers and dispatches one-shot workflows     | Dispatcher queries `next_run_at <= now AND enabled AND NOT claimed`, claims, advances `next_run_at`, starts workflow, releases claim                                          | Short claim — held for milliseconds, not during execution |
| Must     | ACID claim prevents double-dispatch                                      | `UPDATE ... SET claimed_at = now WHERE claimed_at IS NULL AND scheduled_trigger_id = ?` returns affected rows. Only proceed if row was claimed.                               | graphile-worker pattern                                   |
| Must     | Short claim lifecycle: claim → advance → start → release                 | Claim is held only during the dispatch operation (~ms). `next_run_at` is advanced before workflow starts. If `start()` fails, roll back `next_run_at` and release claim.      | Prevents blocking next occurrence                         |
| Must     | One-shot workflow executes trigger and completes (no daisy-chain)        | Reuse existing `executeScheduledTriggerStep` + retry logic. No `startNextIterationStep`. Workflow returns on completion.                                                      |                                                           |
| Must     | Stale claim recovery                                                     | If `claimed_at` is older than `claim_timeout` (default 5 min), reset claim and roll back `next_run_at` so trigger can be re-dispatched                                        | Handles dispatcher crash                                  |
| Must     | Two scheduler options: Vercel Cron and Scheduler Workflow                | Vercel: `crons` entry in `vercel.json`. Non-Vercel: a workflow that sleeps 60s then calls the dispatcher in a loop.                                                           | See §9 Scheduler Options                                  |
| Must     | Works on self-hosted (Postgres world)                                    | Same schedule table + same dispatcher logic. Scheduler is the scheduler workflow (durable sleep loop).                                                                        |                                                           |
| Should   | One-time (`run_at`) triggers work through the same dispatcher            | Schedule table includes one-time triggers with `next_run_at = run_at`. After execution, row marked `enabled = false`.                                                         |                                                           |
| Should   | First execution attempt within 1 minute of `scheduledFor`                | See §6 Scheduling Guarantees                                                                                                                                                  |                                                           |
| Could    | Observability: log trigger dispatch, claim, execution start/end, advance | Structured logs with `scheduledTriggerId`, `nextRunAt`, `claimedBy`, `dispatchLatencyMs`                                                                                      |                                                           |


### Non-Functional Requirements

- **Performance:** Dispatcher handles up to 5000 due triggers per tick with 20-parallel dispatch (~30s). Configurable via `CRON_DISPATCH_LIMIT` and `CRON_DISPATCH_CONCURRENCY`.
- **Reliability:** No missed fires under normal operation. Stale claims recovered within `claim_timeout` (5 min). Concurrent invocations allowed — next occurrence never blocked by current execution.
- **Security:** Vercel Cron endpoint verifies `CRON_SECRET` header. Scheduler workflow is in-process (no auth needed).
- **Cost:** Single Postgres query per tick for the "what's due" scan. One workflow start per due trigger.

## 8) Success Metrics & Instrumentation

- **Metric 1: Triggers running on stale code**
  - Baseline: All cron triggers run on stale code after deploy
  - Target: Zero triggers on stale code
  - Instrumentation: Compare `VERCEL_DEPLOYMENT_ID` at execution time vs current production deployment
- **Metric 2: Deploy-time overhead**
  - Baseline: O(triggers) restart cost
  - Target: O(1) — just the cron tick
  - Instrumentation: No restart endpoint needed
- **Metric 3: Dispatch latency**
  - Baseline: N/A
  - Target: < 60 seconds from `scheduledFor` to first execution attempt
  - Instrumentation: `scheduledFor - invocation.startedAt`
- **Metric 4: Double-fire rate**
  - Baseline: N/A
  - Target: Zero double-fires
  - Instrumentation: Idempotency key uniqueness violations (should be zero)

## 9) Current State (How It Works Today)

See [evidence/current-system-trace.md](evidence/current-system-trace.md) for the full trace.

**Summary:**

- Scheduled triggers use a **daisy-chain workflow pattern**: sleep → execute → `start()` next iteration
- `start()` from within a Vercel Workflow pins the child to the same deployment as the parent
- Result: triggers run on stale code forever after a new deploy
- The `scheduledWorkflows` table in manage DB tracks the current workflow run ID per trigger (used for supersession/adoption)
- One-time triggers use the same workflow but skip the chain step
- Self-hosted (Postgres world) does NOT have this problem — long-lived workers always run latest code
- `maxDuration: 800` (13+ minutes) for Vercel functions. Trigger default `timeoutSeconds: 780` (13 min).

**Key constraint:** Trigger config lives in DoltgreSQL (branch-scoped per project). Runtime invocations live in Postgres (global). Cross-project queries on DoltgreSQL require iterating all projects and resolving branch refs.

## 10) Proposed Solution (Vertical Slice)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ SCHEDULER (one of two options)                              │
│                                                             │
│  Option A: Vercel Cron (prod)                               │
│    vercel.json: crons: [{ path, schedule: "* * * * *" }]    │
│    → always hits latest production deployment               │
│                                                             │
│  Option B: Scheduler Workflow (self-hosted / local)         │
│    while(true) { sleep(60s); dispatchDueTriggers(); }       │
│    → no deployment pinning on postgres/local world          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ DISPATCHER (shared logic, same code for both options)       │
│                                                             │
│  1. SELECT * FROM trigger_schedules                         │
│     WHERE next_run_at <= now AND enabled                    │
│     AND (claimed_at IS NULL OR claimed_at < stale_timeout)  │
│                                                             │
│  2. For each due trigger (short claim lifecycle):           │
│     a. CLAIM:   UPDATE SET claimed_at = now                 │
│                 WHERE claimed_at IS NULL (ACID dedup)       │
│     b. ADVANCE: UPDATE SET next_run_at = <next occurrence>  │
│     c. START:   start(oneShotTriggerWorkflow, [payload])    │
│     d. RELEASE: UPDATE SET claimed_at = NULL                │
│     (if START fails → ROLLBACK next_run_at + RELEASE)       │
│                                                             │
│  Total claim held: ~milliseconds per trigger                │
└──────────────────────┬──────────────────────────────────────┘
                       │  (one workflow per due trigger)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ ONE-SHOT TRIGGER WORKFLOW                                   │
│  (independent per invocation, no chain)                     │
│                                                             │
│  checkTriggerEnabledStep()                                  │
│  createInvocationIdempotentStep()                           │
│  markRunningStep()                                          │
│  executeScheduledTriggerStep() (with retry loop)            │
│  markCompletedStep() or markFailedStep()                    │
│  DONE — no chain, no claim release needed                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Model

#### Why a new table in runtime Postgres (not DoltgreSQL)?

The `scheduled_triggers` table in DoltgreSQL cannot serve as the dispatcher's query source for four reasons:

1. **Branch isolation prevents cross-project queries.** DoltgreSQL is branch-scoped per project. There is no single query to find "all due triggers across all tenants and projects." The dispatcher would have to: list all projects → resolve each branch ref → open a branch-scoped connection per project → query triggers per agent per branch → merge results. That's O(projects × agents) roundtrips every 60 seconds. The pattern exists in `triggerCleanup.ts` for rare cleanup — it's not viable for a per-minute dispatcher.
2. **No `next_run_at` column.** The manage table has `cron_expression` and `run_at`, but no pre-computed "when is this next due?" The dispatcher would have to parse every cron expression on every tick to check if it's due. The schedule table pre-computes `next_run_at` so the dispatch query is a simple range scan.
3. **Versioned writes for runtime state.** DoltgreSQL creates versioned commits on every write. The short claim pattern (claim → advance → release, potentially thousands of cycles per minute) would flood the version history with transient scheduling state. Claims and `next_run_at` are runtime state, not configuration.
4. **Performance mismatch.** DoltgreSQL is optimized for branch-based version control of configuration, not for high-frequency transactional queries with atomic claim/release cycles.

The schedule table in runtime Postgres is a denormalized copy of the scheduling-relevant fields, kept in sync via write-through from the manage API. DoltgreSQL remains the source of truth for trigger configuration.

#### New table: `trigger_schedules` (runtime Postgres)

```sql
CREATE TABLE trigger_schedules (
  tenant_id              VARCHAR(256) NOT NULL,
  project_id             VARCHAR(256) NOT NULL,
  agent_id               VARCHAR(256) NOT NULL,
  scheduled_trigger_id   VARCHAR(256) NOT NULL,

  -- Denormalized from manage DB
  cron_expression        VARCHAR(256),
  cron_timezone          VARCHAR(64) DEFAULT 'UTC',
  run_at                 TIMESTAMPTZ,
  enabled                BOOLEAN NOT NULL DEFAULT true,

  -- Schedule state (owned by runtime)
  next_run_at            TIMESTAMPTZ,
  last_dispatched_at     TIMESTAMPTZ,

  -- Claim lock (ACID dedup — held for milliseconds only)
  claimed_at             TIMESTAMPTZ,
  claimed_by             VARCHAR(256),

  -- Metadata
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, scheduled_trigger_id)
);

CREATE INDEX trigger_schedules_dispatch_idx
  ON trigger_schedules (next_run_at)
  WHERE enabled = true AND claimed_at IS NULL;

CREATE INDEX trigger_schedules_stale_claim_idx
  ON trigger_schedules (claimed_at)
  WHERE claimed_at IS NOT NULL;
```

**Design rationale:**

- **PK is `(tenant_id, scheduled_trigger_id)`** — trigger IDs are globally unique within a tenant.
- `**project_id` and `agent_id` are stored** for the one-shot workflow payload.
- `**cron_expression` + `cron_timezone` + `run_at` are denormalized** so the dispatcher can compute `next_run_at` without reading DoltgreSQL.
- `**next_run_at`** is pre-computed. Advanced by the dispatcher BEFORE starting the workflow (short claim pattern).
- `**claimed_at` + `claimed_by`** implement the ACID dedup pattern. Held for milliseconds during the claim→advance→start→release cycle. `claimed_by` is `VERCEL_DEPLOYMENT_ID` or `hostname:pid`.
- `**last_dispatched_at**` tracks when the trigger was last dispatched (for observability, not dedup).
- **Partial index** on `(next_run_at) WHERE enabled AND claimed_at IS NULL` makes the "what's due?" query fast.

#### Sync Mechanism (Write-Through)

When `ScheduledTriggerService.onTriggerCreated/Updated/Deleted` fires:

```typescript
// On create/update:
await upsertTriggerSchedule(runDbClient)({
  tenantId, projectId, agentId,
  scheduledTriggerId: trigger.id,
  cronExpression: trigger.cronExpression,
  cronTimezone: trigger.cronTimezone,
  runAt: trigger.runAt,
  enabled: trigger.enabled,
  nextRunAt: computeNextRunAt(trigger),
});

// On delete:
await deleteTriggerSchedule(runDbClient)({
  tenantId, scheduledTriggerId: trigger.id,
});

// On disable:
await updateTriggerScheduleEnabled(runDbClient)({
  tenantId, scheduledTriggerId: trigger.id,
  enabled: false,
  claimedAt: null,
});
```

#### Bulk Resync (Recovery / Migration)

For migration from the current system and for periodic consistency checks:

```typescript
async function resyncAllTriggerSchedules() {
  const tenants = await listAllTenants(runDbClient);
  for (const tenantId of tenants) {
    const projects = await listProjectsMetadata(runDbClient)({ tenantId });
    const refs = await resolveProjectMainRefs(manageDb)(tenantId, projects.map(p => p.id));
    for (const { projectId, ref } of refs) {
      await withRef(manageDbPool, ref, async (db) => {
        const agents = await listAgents(db)({ tenantId, projectId });
        for (const agent of agents) {
          const triggers = await listScheduledTriggers(db)({
            scopes: { tenantId, projectId, agentId: agent.id }
          });
          for (const trigger of triggers) {
            if (trigger.enabled) {
              await upsertTriggerSchedule(runDbClient)({ ... });
            }
          }
        }
      });
    }
  }
}
```

### Scheduler Options

#### Option A: Vercel Cron (Vercel production)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/run/cron/dispatch-triggers",
      "schedule": "* * * * *"
    }
  ]
}
```

- Vercel Cron always hits the **latest production deployment** (platform guarantee)
- Sends `Authorization: Bearer <CRON_SECRET>` header for verification
- One-shot workflows started by the dispatcher also run on the latest deployment

**Why Vercel Cron for Vercel:** A scheduler workflow on Vercel would be deployment-pinned — the workflows it starts would inherit the old deployment. Vercel Cron is the only mechanism that guarantees latest-deployment execution.

#### Option B: Scheduler Workflow (self-hosted / local)

```typescript
// agents-api/src/domains/run/workflow/functions/schedulerWorkflow.ts

async function _schedulerWorkflow() {
  'use workflow';

  while (true) {
    await sleep(60_000);
    await dispatchDueTriggersStep();
  }
}

async function dispatchDueTriggersStep() {
  'use step';
  await dispatchDueTriggers();
}
```

- On postgres world: workflow is durable. If server restarts, orphan recovery re-enqueues it. No deployment pinning.
- On local world: workflow is in-memory. Restarts automatically on server start.
- On Vercel world: **NOT used** — deployment pinning would propagate to started workflows. Use Vercel Cron instead.

**Startup logic:**

```typescript
// agents-api/src/index.ts
const targetWorld = process.env.WORKFLOW_TARGET_WORLD || 'local';

if (targetWorld !== 'vercel') {
  // Start the scheduler workflow (idempotent — checks if already running)
  await startSchedulerWorkflowIfNotRunning();
}
```

#### World → Scheduler mapping


| World                      | Scheduler          | Why                                              |
| -------------------------- | ------------------ | ------------------------------------------------ |
| `vercel`                   | Vercel Cron        | Only mechanism that guarantees latest deployment |
| `@workflow/world-postgres` | Scheduler Workflow | Durable, recoverable, no deployment pinning      |
| `local`                    | Scheduler Workflow | In-memory, restarts with server                  |


### Cron Dispatcher (Shared Logic)

The same `dispatchDueTriggers()` function is called by both scheduler options:

```typescript
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEADLINE_BUFFER_MS = 10_000;       // stop 10s before function timeout

async function dispatchDueTriggers(params?: {
  maxDurationMs?: number;
}): Promise<{ dispatched: number; skipped: number; carryOver: number }> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const instanceId = process.env.VERCEL_DEPLOYMENT_ID || `${os.hostname()}:${process.pid}`;
  const deadline = params?.maxDurationMs
    ? Date.now() + params.maxDurationMs - DEADLINE_BUFFER_MS
    : Date.now() + 50_000; // default 50s budget
  const PARALLEL_CONCURRENCY = Number(process.env.CRON_DISPATCH_CONCURRENCY) || 20;

  // 1. Find all due triggers (unclaimed or stale-claimed)
  const dueTriggers = await findDueTriggerSchedules(runDbClient)({
    asOf: now.toISOString(),
    staleClaimThreshold: staleThreshold.toISOString(),
  });

  let dispatched = 0;
  let skipped = 0;

  // 2. Process in parallel batches until deadline
  for (let i = 0; i < dueTriggers.length; i += PARALLEL_CONCURRENCY) {
    if (Date.now() > deadline) {
      const carryOver = dueTriggers.length - i;
      logger.warn({ carryOver, dispatched }, 'Deadline reached, carrying over to next tick');
      return { dispatched, skipped, carryOver };
    }

    const batch = dueTriggers.slice(i, i + PARALLEL_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((schedule) => dispatchSingleTrigger(schedule, instanceId))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'dispatched') dispatched++;
        else skipped++;
      } else {
        skipped++;
      }
    }
  }

  return { dispatched, skipped, carryOver: 0 };
}

async function dispatchSingleTrigger(
  schedule: TriggerScheduleRow,
  instanceId: string,
): Promise<'dispatched' | 'skipped'> {
  // a. CLAIM (ACID — only one instance wins)
  const claimed = await claimTriggerSchedule(runDbClient)({
    tenantId: schedule.tenantId,
    scheduledTriggerId: schedule.scheduledTriggerId,
    claimedBy: instanceId,
    expectedClaimedAt: schedule.claimedAt, // null for fresh, old ts for stale
  });
  if (!claimed) return 'skipped';

  // b. ADVANCE next_run_at (before starting workflow)
  const nextRunAt = computeNextRunAt({
    cronExpression: schedule.cronExpression,
    cronTimezone: schedule.cronTimezone,
    runAt: schedule.runAt,
    lastScheduledFor: schedule.nextRunAt,
  });

  const isOneTime = !schedule.cronExpression;
  await advanceTriggerSchedule(runDbClient)({
    tenantId: schedule.tenantId,
    scheduledTriggerId: schedule.scheduledTriggerId,
    nextRunAt: isOneTime ? null : nextRunAt,
    lastDispatchedAt: new Date().toISOString(),
    enabled: isOneTime ? false : schedule.enabled, // disable one-time after dispatch
  });

  // c. START one-shot workflow
  try {
    await start(oneShotTriggerWorkflow, [{
      tenantId: schedule.tenantId,
      projectId: schedule.projectId,
      agentId: schedule.agentId,
      scheduledTriggerId: schedule.scheduledTriggerId,
      scheduledFor: schedule.nextRunAt, // the time this occurrence was due
    }]);
  } catch (err) {
    // ROLLBACK: restore next_run_at and release claim
    await rollbackTriggerSchedule(runDbClient)({
      tenantId: schedule.tenantId,
      scheduledTriggerId: schedule.scheduledTriggerId,
      nextRunAt: schedule.nextRunAt, // restore original
      enabled: isOneTime ? true : schedule.enabled,
    });
    logger.error({ scheduledTriggerId: schedule.scheduledTriggerId, err }, 'Workflow start failed, rolled back');
    return 'skipped';
  }

  // d. RELEASE claim
  await releaseTriggerScheduleClaim(runDbClient)({
    tenantId: schedule.tenantId,
    scheduledTriggerId: schedule.scheduledTriggerId,
  });

  return 'dispatched';
}
```

### One-Shot Workflow

```typescript
async function _oneShotTriggerWorkflow(payload: OneShotTriggerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId, scheduledFor } = payload;

  // Check trigger still enabled (reads from manage DB)
  const enabledCheck = await checkTriggerEnabledStep({
    tenantId, projectId, agentId, scheduledTriggerId,
    runnerId: getWorkflowMetadata().workflowRunId,
  });
  if (!enabledCheck.shouldContinue || !enabledCheck.trigger) {
    return { status: 'stopped', reason: enabledCheck.reason };
  }

  const trigger = enabledCheck.trigger;

  // Create invocation (idempotent — keyed on triggerId + scheduledFor)
  const idempotencyKey = `sched_${scheduledTriggerId}_${scheduledFor}`;
  const { invocation, alreadyExists } = await createInvocationIdempotentStep({
    tenantId, projectId, agentId, scheduledTriggerId,
    scheduledFor, payload: trigger.payload ?? null, idemptencyKey,
  });

  if (alreadyExists && invocation.status !== 'pending') {
    return { status: 'already_executed', invocationId: invocation.id };
  }

  // Execute with retries (reuse existing logic)
  let lastError: string | null = null;
  let attemptNumber = invocation.attemptNumber;
  const maxAttempts = trigger.maxRetries + 1;

  while (attemptNumber <= maxAttempts) {
    const cancelCheck = await checkInvocationCancelledStep({
      tenantId, projectId, agentId, scheduledTriggerId,
      invocationId: invocation.id,
    });
    if (cancelCheck.cancelled) {
      return { status: 'cancelled', invocationId: invocation.id };
    }

    await markRunningStep({
      tenantId, projectId, agentId, scheduledTriggerId,
      invocationId: invocation.id,
    });

    const result = await executeScheduledTriggerStep({
      tenantId, projectId, agentId, scheduledTriggerId,
      invocationId: invocation.id,
      messageTemplate: trigger.messageTemplate,
      payload: trigger.payload ?? null,
      timeoutSeconds: trigger.timeoutSeconds,
      runAsUserId: trigger.runAsUserId,
      cronTimezone: trigger.cronTimezone,
    });

    if (result.conversationId) {
      await addConversationIdStep({
        tenantId, projectId, agentId, scheduledTriggerId,
        invocationId: invocation.id,
        conversationId: result.conversationId,
      });
    }

    if (result.success) {
      await markCompletedStep({
        tenantId, projectId, agentId, scheduledTriggerId,
        invocationId: invocation.id,
      });
      return { status: 'completed', invocationId: invocation.id };
    }

    lastError = result.error || 'Unknown error';
    if (attemptNumber < maxAttempts) {
      await incrementAttemptStep({
        tenantId, projectId, agentId, scheduledTriggerId,
        invocationId: invocation.id,
        currentAttempt: attemptNumber,
      });
      attemptNumber++;
      const jitter = Math.random() * 0.3;
      await sleep(trigger.retryDelaySeconds * 1000 * (1 + jitter));
    } else {
      break;
    }
  }

  if (lastError) {
    await markFailedStep({
      tenantId, projectId, agentId, scheduledTriggerId,
      invocationId: invocation.id,
    });
  }

  return { status: 'failed', invocationId: invocation.id };
}
```

**Key difference from current workflow:** No `startNextIterationStep()`. No `clearClaimAndAdvanceStep()`. The dispatcher handles all scheduling state; the workflow is pure execution.

### Migration Path

1. **Add `trigger_schedules` table** (schema migration)
2. **Add sync write-through** in `ScheduledTriggerService` (alongside existing workflow start/stop)
3. **Run bulk resync** to populate schedule table from current triggers
4. **Deploy cron dispatcher** endpoint + `vercel.json` crons entry + scheduler workflow for non-Vercel
5. **Feature flag:** `SCHEDULED_TRIGGER_DISPATCHER=cron` (new) vs `SCHEDULED_TRIGGER_DISPATCHER=workflow` (current)
6. **Stop starting daisy-chain workflows** — when flag is `cron`, `onTriggerCreated` only writes to schedule table, doesn't call `start()`
7. **Let existing daisy-chain workflows drain** — they'll stop naturally when `checkTriggerEnabledStep` sees `workflowRunId` cleared
8. **Remove daisy-chain code** after all existing workflows have stopped

### What Changes From Current System


| Concern                                       | Current                                    | Proposed                                                        |
| --------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Who decides "when"                            | Workflow itself (sleep + chain)            | Schedule table + dispatcher                                     |
| Execution model                               | Long-lived daisy-chain workflow            | One-shot workflow per occurrence                                |
| Deployment pinning                            | Yes (inherits from parent)                 | No (Vercel Cron hits latest; postgres world has no pinning)     |
| Deploy-time cost                              | O(triggers) restart                        | O(1) cron tick                                                  |
| Double-fire prevention                        | N/A (single chain)                         | ACID claim (ms-duration) + idempotency key                      |
| Next occurrence blocked by current execution? | Yes (chain waits for completion)           | No (dispatcher advances `next_run_at` before starting workflow) |
| Self-hosted scheduler                         | Accidental (no pinning, daisy-chain works) | Explicit (scheduler workflow with durable sleep)                |
| `scheduledWorkflows` table                    | Tracks current run ID                      | No longer needed                                                |


### What Stays The Same

- `scheduled_triggers` table in manage DB (source of truth for trigger config)
- `scheduled_trigger_invocations` table in runtime DB (execution records)
- All existing step functions (`executeScheduledTriggerStep`, `checkTriggerEnabledStep`, etc.)
- Trigger CRUD API and manage UI
- `TriggerService.executeAgentAsync()` for actual agent execution

### Alternatives Considered

- **Option A: Trampoline pattern** — workflow calls `fetch(PRODUCTION_URL/execute-and-chain)` to force latest deployment. Still uses daisy-chains, still has O(triggers) restart for workflow definition changes, still has deployment pinning for the sleep phase.
- **Option C: Deploy hook restart** — GitHub Actions step post-deploy calls restart endpoint. O(triggers) cost, requires manual infra, doesn't solve the "sleeping on old deploy" problem.
- **Option D: Single scheduler (Vercel Cron only)** — no scheduler workflow option. Breaks self-hosted environments where Vercel Cron is unavailable.
- **Why proposed solution:** Eliminates deployment pinning by construction. Zero deploy-time cost. Two scheduler options cover all environments. Short claim pattern allows concurrent invocations. Uses proven patterns (Temporal's schedule-as-entity, graphile-worker's ACID dedup). No new runtime dependencies.

## 11) Decision Log


| ID  | Decision                                                     | Type (P/T/X) | 1-way door?               | Status    | Rationale                                                                                                                    | Evidence / Links                                                                                     | Implications                              |
| --- | ------------------------------------------------------------ | ------------ | ------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| D1  | Schedule table in runtime Postgres (not manage DB)           | T            | No                        | Confirmed | DoltgreSQL is branch-scoped; cross-project "what's due?" query is impractical at cron speed.                                 | [evidence/current-system-trace.md](evidence/current-system-trace.md)                                 | Requires sync mechanism                   |
| D2  | ACID short claim pattern (claim → advance → start → release) | T            | No                        | Confirmed | Claim held for milliseconds, not minutes. Prevents blocking next occurrence. graphile-worker validates the pattern.          | [reports/workflow-scheduling-alternatives](../../reports/workflow-scheduling-alternatives/REPORT.md) | Concurrent invocations possible           |
| D3  | One-shot workflows (no daisy-chain)                          | T            | Yes (workflow def change) | Confirmed | All systems except Vercel WDK use one-shot + external scheduler. Eliminates deployment pinning.                              | [reports/workflow-scheduling-alternatives](../../reports/workflow-scheduling-alternatives/REPORT.md) | Breaking change; requires migration       |
| D4  | Two scheduler options (Vercel Cron + Scheduler Workflow)     | X            | No                        | Confirmed | Vercel Cron for Vercel (only way to guarantee latest deployment). Scheduler Workflow for self-hosted (durable, recoverable). | Investigation: scheduler workflow on Vercel would be deployment-pinned                               | Must detect world and choose              |
| D5  | Concurrent invocations allowed (no serialization)            | P            | No                        | Confirmed | Each invocation is independent. Serialization is future work (`maxConcurrency`).                                             | —                                                                                                    | Retries don't block next occurrence       |
| D6  | First-attempt-within-1-minute timing guarantee               | P            | No                        | Confirmed | 1-minute tick rate. Average 30s latency. Same guarantee for all frequencies.                                                 | —                                                                                                    | Acceptable for daily/hourly/5min triggers |
| D7  | Feature flag for gradual rollout                             | X            | No                        | Confirmed | `SCHEDULED_TRIGGER_DISPATCHER=cron                                                                                           | workflow`                                                                                            | —                                         |
| D8  | `scheduledWorkflows` table: leave in place initially         | T            | No                        | Confirmed | Stop using it but don't remove. Avoids extra migration.                                                                      | —                                                                                                    | Can clean up later                        |


## 12) Open Questions


| ID  | Question                                                                                                 | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action                                                      | Status |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | -------- | --------- | ---------------------------------------------------------------------------------- | ------ |
| Q1  | Vercel Cron `CRON_SECRET` verification — exact header format and verification pattern                    | T            | P1       | No        | Check Vercel docs for header name and value                                        | Open   |
| Q2  | Should the sync write-through be async or synchronous?                                                   | T            | P1       | No        | Sync is safer, adds ~5ms to trigger CRUD. Recommend sync.                          | Open   |
| Q3  | How does the scheduler workflow detect "already running" to avoid starting duplicates on server restart? | T            | P1       | No        | Use a singleton pattern: check if a scheduler workflow run exists before starting. | Open   |
| Q4  | Stale claim rollback: should it also create a recovery invocation, or just reset the schedule row?       | T            | P2       | No        | Just reset the row — next tick will re-dispatch normally                           | Open   |


## 13) Assumptions


| ID  | Assumption                                                                                                                        | Confidence | Verification Plan                                         | Expiry                | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- | --------------------- | ------ |
| A1  | Vercel Cron always hits the latest production deployment                                                                          | HIGH       | Vercel docs confirm this                                  | Before implementation | Active |
| A2  | `maxDuration: 800` applies to Vercel Cron invocations (not a shorter cron-specific limit)                                         | MEDIUM     | Test with a cron that runs > 60s                          | Before implementation | Active |
| A3  | Simultaneously due triggers per tick handled by time-based deadline (not row limit). Partial B-tree index handles any table size. | HIGH       | Postgres index performance is well-understood             | —                     | Active |
| A4  | Write-through sync is sufficient for consistency                                                                                  | MEDIUM     | Edge cases: manual DoltgreSQL edits, concurrent API calls | Integration test      | Active |
| A5  | Scheduler workflow on postgres world recovers reliably via orphan recovery                                                        | MEDIUM     | Existing orphan recovery covers this pattern              | Integration test      | Active |


## 14) In Scope (Implement Now)

**Goal:** Replace daisy-chain scheduled trigger execution with schedule-table + cron dispatcher + one-shot workflows. Eliminate deployment pinning. Provide both Vercel Cron and scheduler workflow as scheduler options.

**Non-goals:** See §3.

**Requirements:** All "Must" items from §7.

**Proposed solution:** See §10.

**Risks + mitigations:** See §15.

**What gets instrumented:** Dispatch count per tick, claim success/failure, dispatch latency, stale claim recoveries, carry-over count.

## 15) Risks & Mitigations


| Risk                                                                            | Likelihood | Impact                                   | Mitigation                                                                             | Owner |
| ------------------------------------------------------------------------------- | ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------- | ----- |
| Schedule table gets out of sync with manage DB                                  | Medium     | Missed or phantom triggers               | Write-through sync + periodic bulk resync as safety net                                | —     |
| Stale claim after dispatcher crash (claim held, `next_run_at` already advanced) | Low        | Occurrence missed until stale recovery   | Claim timeout is 5 min. Stale recovery rolls back `next_run_at` to original value.     | —     |
| Vercel Cron misses a tick                                                       | Low        | 1-minute delay                           | Next tick catches up (triggers still due)                                              | —     |
| Migration: both daisy-chain and dispatcher running simultaneously               | Medium     | Double-fires during migration            | Feature flag: only one path active. Idempotency key prevents actual double-execution.  | —     |
| Concurrent invocations for a trigger that mutates shared state                  | Low        | Data inconsistency                       | Document that concurrent invocations are allowed. Future work: `maxConcurrency` field. | —     |
| Scheduler workflow on postgres world lost due to DB failure                     | Low        | Triggers stop dispatching until recovery | Orphan recovery re-enqueues on restart. Health check on scheduler workflow status.     | —     |


## 16) Future Work

### Explored

- **Inngest as Vercel Workflows replacement**
  - What we learned: Solves deployment pinning by design (memoization model). Self-hostable single binary. Embeds into Hono via `serve()`.
  - Recommended approach: Evaluate as full WDK replacement
  - Why not in scope now: Adds a new runtime dependency. Schedule table + cron dispatcher solves the immediate problem.
  - Triggers to revisit: If Vercel Workflows introduces more limitations.
- **Per-trigger concurrency limits**
  - What we learned: Current daisy-chain accidentally serializes. New design allows overlap. Some triggers may need serialization.
  - Recommended approach: Add `maxConcurrency` field to `scheduled_triggers` table. Dispatcher checks active invocation count before dispatching.
  - Why not in scope now: Most triggers don't need it. Can be added without architectural changes.
  - Triggers to revisit: User reports of overlapping invocation issues.

### Identified

- **BullMQ for sub-minute scheduling**
  - What we know: BullMQ Job Schedulers support second/millisecond resolution. Requires Redis.
  - Why it matters: If users need sub-minute trigger resolution.
  - What investigation is needed: Redis infrastructure cost, BullMQ + Vercel compatibility.

### Noted

- **Vercel Queue deploymentless mode** — if Vercel exposes `null` deploymentId through the WDK, this could be a simpler fix. Monitor [workflow PR #1111](https://github.com/vercel/workflow/pull/1111).

