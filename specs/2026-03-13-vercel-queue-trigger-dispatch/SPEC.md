# Vercel Queue Trigger Dispatch — Spec

**Status:** Draft
**Owner(s):** —
**Last updated:** 2026-03-13
- Research: [reports/vercel-workflow-deployment-pinning/](../../reports/vercel-workflow-deployment-pinning/REPORT.md)
- Vercel Queues docs: [vercel.com/docs/queues](https://vercel.com/docs/queues)
- Vercel Queues SDK: [vercel.com/docs/queues/sdk](https://vercel.com/docs/queues/sdk)
- Vercel Queues poll mode: [vercel.com/docs/queues/poll-mode](https://vercel.com/docs/queues/poll-mode)
- WDK Postgres World (graphile-worker): [useworkflow.dev/worlds/postgres](https://useworkflow.dev/worlds/postgres)

---

## 1) Problem Statement

- **Who is affected:** Any user with scheduled triggers (cron or one-time). All deployment modes (Vercel Cloud + self-hosted).
- **What pain:** Vercel Workflow's deployment pinning traps scheduled trigger execution on stale deployments. When new code is deployed, existing daisy-chain workflows continue running old code indefinitely. Bugs fixed in new deploys never take effect for running triggers.
- **Why now:** Active bug impacting production scheduled triggers. The architecture amplifies the problem — every `startNextIterationStep()` call re-pins to the old deployment.
- **Current workaround:** Manually restarting all triggers after each deploy. No automated mechanism exists.

### Why a new spec?

An earlier design proposed a schedule-table + scheduler-workflow architecture. That design solves the problem but introduces significant complexity:

- A new `trigger_schedules` table in runtime Postgres that must be kept in sync with DoltgreSQL via write-through
- A new `scheduler_state` singleton table for scheduler supersession
- A polling scheduler workflow with a 60s tick loop
- An ACID claim/advance/release cycle for dispatch dedup
- A deploy restart CI step to supersede the old scheduler
- Bulk resync logic for migration and consistency recovery

Vercel Queues (GA, `@vercel/queue`) provides native primitives — **delayed delivery**, **idempotency keys**, and **deployment-agnostic poll mode** — that eliminate the need for all of the above.

## 2) Goals

- **G1:** Scheduled triggers always execute on the latest deployed code, on every deployment (Vercel Cloud) and on server restart (self-hosted).
- **G2:** Zero new database tables — scheduling state lives in the queue, not in Postgres.
- **G3:** No double-fires, no missed fires — queue idempotency + invocation-level idempotency key provides two layers of dedup.
- **G4:** Works for all environments: Vercel Cloud, self-hosted (`@workflow/world-postgres`), and local development.
- **G5:** First execution attempt starts within 1 minute of the scheduled time.
- **G6:** O(0) deploy-time cost — no deploy hook, no scheduler restart. Poll mode consumers automatically run on the latest deployment.

## 3) Non-Goals

- **NG1:** Sub-minute scheduling resolution. 1-minute minimum is acceptable.
- **NG2:** Replacing Vercel Workflows for durable execution. One-shot WDK workflows still handle trigger execution (steps, retries, timeout).
- **NG3:** UI changes. Trigger CRUD stays the same.
- **NG4:** Changing the manage DB schema for `scheduled_triggers`. DoltgreSQL remains source of truth for trigger config.
- **NG5:** Per-trigger concurrency limits. Concurrent invocations for the same trigger are allowed. Future work.
- **NG6:** Eliminating `@vercel/queue` as a cloud dependency. Self-hosted has a separate scheduling path.

## 4) Personas / Consumers

- **P1: Builder** — creates/edits scheduled triggers in the manage UI. No visible change. Triggers execute reliably on latest code.
- **P2: Platform operator** — deploys the API. No manual action needed. No deploy hook. Poll mode consumers automatically shift to the latest deployment.
- **P3: Self-hosted deployer** — runs `@workflow/world-postgres` or local. Uses graphile-worker delayed jobs (same abstraction, different backend). Recovers on server restart.

## 5) User Journeys

### Happy path (Builder — cron trigger, Vercel Cloud)

1. Builder creates a cron trigger (e.g., `*/5 * * * `*)
2. Manage API computes next occurrence → `send('trigger-dispatch', payload, { delaySeconds, idempotencyKey })` to Vercel Queue
3. Message sits in the queue with a delay until the trigger is due
4. At the scheduled time, poll mode consumer receives the message (on the latest deployment)
5. Consumer validates trigger still active (single branch-scoped read on DoltgreSQL)
6. Consumer starts one-shot WDK workflow → agent executes on latest code
7. Consumer computes next cron occurrence → enqueues next message with delay
8. Deploy happens → poll mode consumer automatically runs on the new deployment → no restart needed

### Happy path (Builder — one-time trigger)

1. Builder creates a one-time trigger with `run_at = 2026-03-15T09:00Z`
2. Manage API enqueues message with `delaySeconds = secondsUntilRunAt`
3. At 09:00, consumer receives message → validates → executes
4. No next occurrence → no re-enqueue. Done.

### Happy path (Self-hosted — cron trigger)

1. Builder creates a cron trigger (e.g., `0 * * * *`)
2. Manage API computes next occurrence → enqueues via graphile-worker with `runAt` delay
3. graphile-worker delivers the job at the scheduled time (LISTEN/NOTIFY — near-instant pickup)
4. Worker validates trigger → starts one-shot WDK workflow → enqueues next occurrence
5. Server restart → graphile-worker recovers pending jobs automatically (persisted in Postgres)

### Failure / recovery

1. **Transient execution failure:** WDK one-shot workflow retries per `maxRetries` config. The next occurrence was already enqueued by the consumer before starting execution, so retries don't block the next fire.
2. **Consumer crashes after receive, before enqueuing next:** Vercel Queue redelivers the message (visibility timeout expires). Consumer re-processes: validates, executes (invocation idempotency key deduplicates), enqueues next.
3. **Queue message arrives for deleted/disabled trigger:** Consumer reads manage DB → trigger not found or disabled → drops message, no re-enqueue.
4. **Queue message arrives for updated trigger (stale schedule):** Consumer reads manage DB → trigger config has changed → drops stale message. The update path already enqueued a new message with the correct schedule.
5. **Retries overlap with next occurrence:** Allowed. Each invocation is independent (different `scheduledFor`, different idempotency key, different conversation).

### Deploy path (Vercel Cloud)

1. CI deploys new production, promotion completes
2. **No deploy hook needed.** Poll mode consumers are not deployment-pinned — they automatically run on the latest active deployment.
3. Old deployment's consumer (if still running) may process a message — but `checkTriggerEnabledStep` and invocation idempotency prevent double-fires.
4. All one-shot workflows started by the consumer run on the latest code.

### Deploy path (Self-hosted)

1. New version deployed, server restarts
2. graphile-worker reconnects, recovers pending jobs from Postgres
3. Next scheduled jobs fire as normal on latest code

### Deploy path (Local dev)

1. Developer restarts dev server (`pnpm dev`)
2. All in-memory timers are lost (setTimeout-based — no persistence)
3. On startup, catch-up recovery runs: scans enabled triggers from manage DB, computes next occurrence for each, re-enqueues via `LocalScheduler`
4. Triggers resume firing on latest code

> **Note:** Local dev uses `@workflow/world-local` which is fully in-memory. Trigger schedules do not survive restarts without the catch-up recovery step. This is acceptable for development — production environments (Vercel Queue, graphile-worker) persist pending jobs across restarts.

## 6) Scheduling Guarantees

### Timing

**Guarantee:** The first execution attempt for a scheduled trigger starts within 1 minute of its `scheduledFor` time.

- Cron expressions have minute resolution — triggers are always due at exact minute boundaries.
- Vercel Queue docs state messages become visible to consumers once the delay expires, but do not document a specific delivery latency SLA after expiry. Needs validation.
- **Normal case (assumed):** Message delay expires at :05:00 → consumer invoked within seconds. This assumption needs to be verified on staging.
- **Degraded case:** Consumer is busy or Vercel Queue has delivery delay → message delivered within ~60s.

### Retries

Retries are a continuation of the same invocation and are NOT bound by the 1-minute guarantee.

### Overlap

Each scheduled occurrence dispatches independently. Concurrent invocations allowed.

### Idempotency (two layers)

1. **Queue-level:** `idempotencyKey` on `send()` prevents duplicate messages for the same `(triggerId, scheduledFor)` pair. Dedup window = message retention (up to 24h).
2. **Invocation-level:** `idempotency_key` unique index on `scheduled_trigger_invocations` prevents duplicate execution records. Same as today.

## 7) Requirements

### Functional Requirements


| Priority | Requirement                                                         | Acceptance Criteria                                                                                                                                                                    | Notes                                                                            |
| -------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Must     | Trigger CRUD enqueues delayed messages                              | On create/enable: compute next occurrence → `send()` with `delaySeconds`. On update: enqueue new message (old one dropped by consumer). On delete/disable: no-op (consumer validates). | No schedule table needed                                                         |
| Must     | Poll mode consumer processes due triggers                           | Consumer receives message → validates trigger active (single branch read) → starts one-shot WDK workflow → enqueues next occurrence                                                    | Not deployment-pinned                                                            |
| Must     | Idempotency prevents double-fires                                   | Queue `idempotencyKey` + invocation-level `idempotency_key` unique index                                                                                                               | Two layers                                                                       |
| Must     | One-shot workflow executes trigger (no daisy-chain)                 | Reuse existing `scheduledTriggerRunnerWorkflow` + all step functions. No changes to execution layer.                                                                                   | Already implemented                                                              |
| Must     | Re-enqueue pattern for next occurrence                              | After dispatching execution, consumer computes next cron occurrence → enqueues with delay. One-time triggers: no re-enqueue.                                                           | Chain resilience: enqueue before start                                           |
| Must     | Consumer validates trigger before executing                         | Read manage DB for trigger config. Drop message if trigger deleted/disabled/changed.                                                                                                   | Single branch-scoped read, not cross-project scan                                |
| Must     | Works on self-hosted (postgres world)                               | graphile-worker delayed jobs as the scheduling backend. Same consumer logic, same WDK execution.                                                                                       | graphile-worker is already used by `@workflow/world-postgres` for job processing |
| Must     | Works on local dev                                                  | `setTimeout`-based scheduling. Same consumer logic.                                                                                                                                    | Matches existing local world pattern                                             |
| Must     | 24h delay cap handling                                              | Triggers with next occurrence >24h: enqueue with `min(delaySeconds, 86400)`. Consumer checks if due; if not, re-enqueues with remaining delay.                                         | Affects weekly/monthly triggers only                                             |
| Should   | Stale message handling                                              | Consumer checks trigger `updatedAt` or version against message timestamp. Drops stale messages.                                                                                        | Prevents executing on outdated config                                            |
| Must     | Startup recovery (local dev)                                        | On startup when `WORKFLOW_TARGET_WORLD=local`, scan all enabled triggers from manage DB and re-enqueue via `LocalScheduler`.                                                           | Primary recovery for in-memory scheduler. Not needed for Vercel Queue or graphile-worker (both persist jobs). |
| Could    | Observability: log enqueue, receive, validate, dispatch, re-enqueue | Structured logs with `scheduledTriggerId`, `scheduledFor`, `messageId`, `deliveryCount`                                                                                                |                                                                                  |


### Non-Functional Requirements

- **Performance:** Consumer invocation per message is lightweight (~ms for validation + workflow start). Vercel Queue handles concurrency and scaling automatically.
- **Reliability:** At-least-once delivery. Visibility timeout auto-extends while consumer runs. Invocation idempotency prevents duplicate execution.
- **Security:** Poll mode consumer authenticates via Vercel OIDC. Push mode consumer (alternative) is air-gapped from the internet.
- **Cost:** Vercel Queue charges per operation (send + receive + acknowledge). At typical trigger volumes (hundreds of triggers, minute-to-hourly frequency), cost is negligible. No Postgres polling queries.

## 8) Success Metrics & Instrumentation

- **Metric 1: Triggers running on stale code**
  - Baseline: All cron triggers run on stale code after deploy
  - Target: Zero triggers on stale code
  - Instrumentation: Compare `VERCEL_DEPLOYMENT_ID` at execution time vs current production deployment
- **Metric 2: Deploy-time overhead**
  - Baseline: O(triggers) restart cost (current daisy-chain)
  - Target: O(0) — no deploy action needed
  - Instrumentation: Absence of deploy-time CI step
- **Metric 3: Dispatch latency**
  - Target: < 60 seconds from `scheduledFor` to first execution attempt
  - Instrumentation: `scheduledFor - invocation.startedAt`
- **Metric 4: Double-fire rate**
  - Target: Zero double-fires
  - Instrumentation: `DuplicateMessageError` count from `@vercel/queue` + invocation idempotency violations
- **Metric 5: Queue message age**
  - Target: Messages processed within seconds of becoming visible
  - Instrumentation: Vercel Queue observability dashboard

## 9) Current State (How It Works Today)

**What exists today on `main`:**

- `trigger_schedules` table in runtime Postgres (schema + data access layer)
- `scheduler_state` table in runtime Postgres (schema + data access layer)
- `schedulerWorkflow` (sleep 60s → check superseded → dispatch loop)
- `scheduledTriggerRunnerWorkflow` (one-shot execution, no daisy-chain)
- `triggerDispatcher.ts` (claim → advance → start → release pattern)
- `SchedulerService.ts` (startSchedulerWorkflow)
- `restartScheduler.ts` (deploy restart endpoint)
- CI step in `vercel-production.yml` (restart-scheduler job)
- Step functions (`scheduledTriggerSteps.ts`) — all reusable

**What this spec replaces:**


| Component on `main`        | Current behavior                                      | This spec                                                   |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `trigger_schedules` table  | Denormalized schedule rows with `next_run_at`, claims | **Removed** — queue IS the schedule                         |
| `scheduler_state` table    | Singleton for scheduler supersession                  | **Removed** — no scheduler to coordinate                    |
| `schedulerWorkflow.ts`     | 60s polling loop                                      | **Removed** — queue delivers at the right time              |
| `triggerDispatcher.ts`     | Claim/advance/release dispatch logic                  | **Replaced** — consumer validates and dispatches directly   |
| `SchedulerService.ts`      | Start/restart scheduler workflow                      | **Replaced** — `TriggerSchedulingService` enqueues/dequeues |
| `restartScheduler.ts`      | Deploy restart endpoint                               | **Removed** — poll mode consumers are deployment-agnostic   |
| CI `restart-scheduler` job | Post-deploy curl to restart endpoint                  | **Removed**                                                 |
| Write-through sync         | Upsert to `trigger_schedules` on CRUD                 | **Removed** — CRUD enqueues directly to queue               |
| Bulk resync                | Populate schedule table from manage DB                | **Removed** — recovery via startup scan (local dev only)    |


**What stays the same:**

- `scheduled_triggers` table in manage DB (source of truth for trigger config)
- `scheduled_trigger_invocations` table in runtime DB (execution records)
- `scheduledTriggerRunnerWorkflow.ts` (one-shot execution — **reused as-is**)
- All step functions in `scheduledTriggerSteps.ts` (**reused as-is**)
- `TriggerService.executeAgentAsync()` for actual agent execution
- Trigger CRUD API and manage UI

## 10) Proposed Solution

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│ TRIGGER CRUD (manage API)                                    │
│                                                              │
│  On create/enable:                                           │
│    1. Write to manage DB (DoltgreSQL) — unchanged            │
│    2. Compute next occurrence via cron-parser                │
│    3. triggerScheduler.schedule(payload, delaySeconds)       │
│       └→ Vercel: send('trigger-dispatch', ..., {delaySeconds,│
│                        idempotencyKey})                      │
│       └→ Postgres (self-host): addJob('trigger-dispatch', ...│
│                        {runAt})          (graphile-worker)   │
│       └→ Local: setTimeout(callback, delayMs)                │
│                                                              │
│  On update:                                                  │
│    1. Write to manage DB — unchanged                         │
│    2. Enqueue new message with new schedule                  │
│       (old message arrives → consumer validates → drops)     │
│                                                              │
│  On delete/disable:                                          │
│    1. Write to manage DB — unchanged                         │
│    2. No queue action needed (consumer validates and drops)  │
└──────────────────────┬───────────────────────────────────────┘
                       │
          (message sits in queue with delay)
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ SCHEDULING QUEUE                                             │
│                                                              │
│  Vercel Cloud: Vercel Queue topic "trigger-dispatch"         │
│    • delaySeconds: seconds until next occurrence             │
│    • idempotencyKey: "sched_{triggerId}_{scheduledFor}"      │
│    • Poll mode consumer: NOT deployment-pinned               │
│                                                              │
│  Self-hosted:  graphile-worker task "trigger-dispatch"        │
│    • runAt: next occurrence timestamp                        │
│    • jobKey: same idempotency pattern                        │
│                                                              │
│  Local dev:    setTimeout / in-memory timer                  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ CONSUMER (shared logic, all environments)                    │
│                                                              │
│  1. Receive message {triggerId, scheduledFor, tenantId,      │
│     projectId, agentId, enqueuedAt}                          │
│                                                              │
│  2. VALIDATE: read trigger from manage DB                    │
│     (single branch-scoped read for this one trigger)         │
│     • Trigger deleted? → drop, no re-enqueue                │
│     • Trigger disabled? → drop, no re-enqueue               │
│     • Trigger updated after enqueue? → drop (stale)          │
│                                                              │
│  3. ENQUEUE NEXT (before starting execution):                │
│     • Cron trigger: compute next occurrence → schedule()     │
│     • One-time trigger: skip (no next occurrence)            │
│     This ensures the chain continues even if execution fails │
│                                                              │
│  4. DISPATCH: start(scheduledTriggerRunnerWorkflow, payload) │
│     Uses existing one-shot WDK workflow (unchanged)          │
│                                                              │
│  5. ACKNOWLEDGE message (auto on handler return)             │
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ ONE-SHOT TRIGGER WORKFLOW (unchanged from current impl on    |
|   branch workflow-fix-reset)                                 │
│                                                              │
│  scheduledTriggerRunnerWorkflow.ts — reused as-is:           │
│  checkTriggerEnabledStep()                                   │
│  createInvocationIdempotentStep()                            │
│  markRunningStep()                                           │
│  executeScheduledTriggerStep() (with retry loop)             │
│  markCompletedStep() or markFailedStep()                     │
│  DONE                                                        │
└──────────────────────────────────────────────────────────────┘
```

### Scheduling Abstraction

A thin interface that abstracts the queue backend. Three implementations share the same consumer logic.

```typescript
// packages/agents-core/src/scheduling/types.ts

export interface TriggerScheduleMessage {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  scheduledFor: string;        // ISO timestamp of intended fire time
  enqueuedAt: string;          // ISO timestamp of when this message was created
  triggerUpdatedAt: string;    // manage DB updatedAt — for staleness check
}

export interface TriggerScheduler {
  schedule(message: TriggerScheduleMessage, delaySeconds: number): Promise<void>;
}
```

### Vercel Queue Implementation

```typescript
// agents-api/src/domains/run/services/scheduling/vercelQueueScheduler.ts

import { send } from '@vercel/queue';

const TOPIC = 'trigger-dispatch';
const MAX_DELAY_SECONDS = 86_400; // 24h Vercel Queue cap

export class VercelQueueScheduler implements TriggerScheduler {
  async schedule(message: TriggerScheduleMessage, delaySeconds: number): Promise<void> {
    const effectiveDelay = Math.min(delaySeconds, MAX_DELAY_SECONDS);
    const idempotencyKey = `sched_${message.scheduledTriggerId}_${message.scheduledFor}`;

    await send(TOPIC, message, {
      delaySeconds: effectiveDelay,
      idempotencyKey,
      retentionSeconds: MAX_DELAY_SECONDS,
    });
  }
}
```

### Poll Mode Consumer (Vercel)

```typescript
// agents-api/app/api/queues/trigger-dispatch/route.ts
// (or equivalent Hono route with experimentalTriggers)

import { handleCallback } from '@vercel/queue';
import { consumeTriggerMessage } from '../../domains/run/services/scheduling/triggerConsumer';

export const POST = handleCallback(
  async (message: TriggerScheduleMessage, metadata) => {
    await consumeTriggerMessage(message, {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    });
  },
  {
    visibilityTimeoutSeconds: 900, // 15 min — enough for validation + workflow start
    retry: (error, metadata) => {
      if (metadata.deliveryCount > 5) {
        return { acknowledge: true }; // poison message — stop retrying
      }
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
```

`**vercel.json` configuration:**

```json
{
  "functions": {
    "agents-api/app/api/queues/trigger-dispatch/route.ts": {
      "experimentalTriggers": [
        {
          "type": "queue/v2beta",
          "topic": "trigger-dispatch"
        }
      ]
    }
  }
}
```

> **Key:** Push mode consumers are air-gapped from the internet. No authentication needed on the consumer function — only Vercel's internal queue infrastructure can invoke it. Push mode delivers to the **current production deployment** (not pinned to the publishing deployment in v2beta with topic-level routing). If push mode deployment routing is still pinned per-publisher, fall back to poll mode which explicitly avoids pinning by omitting `Vqs-Deployment-Id`.

### Shared Consumer Logic

```typescript
// agents-api/src/domains/run/services/scheduling/triggerConsumer.ts

export async function consumeTriggerMessage(
  message: TriggerScheduleMessage,
  meta: { messageId: string; deliveryCount: number },
): Promise<void> {
  const { tenantId, projectId, agentId, scheduledTriggerId, scheduledFor, enqueuedAt, triggerUpdatedAt } = message;

  // 1. VALIDATE — read trigger from manage DB (single branch lookup)
  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);
  if (!resolvedRef) {
    logger.warn({ tenantId, projectId }, 'Cannot resolve ref, dropping message');
    return; // acknowledge — no retry
  }

  const trigger = await withRef(manageDbPool, resolvedRef, (db) =>
    getScheduledTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
    }),
  );

  if (!trigger || !trigger.enabled) {
    logger.info({ scheduledTriggerId, reason: !trigger ? 'deleted' : 'disabled' }, 'Dropping stale message');
    return;
  }

  // Staleness check: if trigger was updated after this message was enqueued,
  // a newer message exists with the correct schedule. Drop this one.
  if (trigger.updatedAt && new Date(trigger.updatedAt) > new Date(enqueuedAt)) {
    logger.info({ scheduledTriggerId, enqueuedAt, triggerUpdatedAt: trigger.updatedAt }, 'Dropping stale message (trigger updated)');
    return;
  }

  // 2. ENQUEUE NEXT (before execution — ensures chain continuity)
  if (trigger.cronExpression) {
    const nextOccurrence = computeNextCronOccurrence(trigger.cronExpression, trigger.cronTimezone, scheduledFor);
    if (nextOccurrence) {
      const delaySeconds = Math.max(0, Math.floor((nextOccurrence.getTime() - Date.now()) / 1000));
      await triggerScheduler.schedule({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        scheduledFor: nextOccurrence.toISOString(),
        enqueuedAt: new Date().toISOString(),
        triggerUpdatedAt: trigger.updatedAt,
      }, delaySeconds);
    }
  }

  // 3. Handle 24h delay cap — if message arrived early, re-enqueue
  const scheduledTime = new Date(scheduledFor);
  if (scheduledTime.getTime() > Date.now() + 60_000) { // >1 min early = relay hop
    const remainingSeconds = Math.floor((scheduledTime.getTime() - Date.now()) / 1000);
    logger.info({ scheduledTriggerId, scheduledFor, remainingSeconds }, 'Message arrived early (24h relay), re-enqueueing');
    await triggerScheduler.schedule(message, remainingSeconds);
    return;
  }

  // 4. DISPATCH — start one-shot WDK workflow
  const payload: TriggerPayload = {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    scheduledFor,
  };

  await start(scheduledTriggerRunnerWorkflow, [payload]);
  logger.info({ scheduledTriggerId, scheduledFor, messageId: meta.messageId }, 'Trigger dispatched');
}
```

### graphile-worker Implementation (Self-hosted / Postgres world)

`@workflow/world-postgres` uses [graphile-worker](https://worker.graphile.org/) for reliable job processing with Postgres LISTEN/NOTIFY for near-instant pickup. The trigger scheduler reuses the same graphile-worker instance.

```typescript
// agents-api/src/domains/run/services/scheduling/graphileWorkerScheduler.ts

import type { WorkerUtils } from 'graphile-worker';
import type { TriggerScheduleMessage, TriggerScheduler } from './types';

export class GraphileWorkerScheduler implements TriggerScheduler {
  constructor(private workerUtils: WorkerUtils) {}

  async schedule(message: TriggerScheduleMessage, delaySeconds: number): Promise<void> {
    const runAt = new Date(Date.now() + delaySeconds * 1000);
    const jobKey = `sched_${message.scheduledTriggerId}_${message.scheduledFor}`;

    await this.workerUtils.addJob('trigger-dispatch', message, {
      runAt,
      jobKey,
      maxAttempts: 5,
    });
  }
}
```

graphile-worker task registration on startup:

```typescript
// agents-api/src/index.ts (postgres world startup path)

const taskList: TaskList = {
  'trigger-dispatch': async (payload, helpers) => {
    const message = payload as TriggerScheduleMessage;
    await consumeTriggerMessage(message, {
      messageId: helpers.job.id.toString(),
      deliveryCount: helpers.job.attempts,
    });
  },
};

// Register task list with the graphile-worker runner from @workflow/world-postgres
```

### Local Development Implementation

```typescript
// agents-api/src/domains/run/services/scheduling/localScheduler.ts

const pendingTimers = new Map<string, NodeJS.Timeout>();

export class LocalScheduler implements TriggerScheduler {
  async schedule(message: TriggerScheduleMessage, delaySeconds: number): Promise<void> {
    const key = `sched_${message.scheduledTriggerId}_${message.scheduledFor}`;

    if (pendingTimers.has(key)) return; // already scheduled

    const timer = setTimeout(async () => {
      pendingTimers.delete(key);
      await consumeTriggerMessage(message, {
        messageId: key,
        deliveryCount: 0,
      });
    }, delaySeconds * 1000);

    pendingTimers.set(key, timer);
  }
}
```

### Scheduler Factory

```typescript
// agents-api/src/domains/run/services/scheduling/index.ts

export function createTriggerScheduler(): TriggerScheduler {
  const world = process.env.WORKFLOW_TARGET_WORLD || 'local';

  if (world === 'vercel') {
    return new VercelQueueScheduler();
  }
  if (world === '@workflow/world-postgres') {
    return new GraphileWorkerScheduler(getWorkerUtils());
  }
  return new LocalScheduler();
}

export const triggerScheduler = createTriggerScheduler();
```

### Trigger CRUD Integration

The manage API's trigger lifecycle hooks (`ScheduledTriggerService`) are modified to enqueue queue messages instead of writing to `trigger_schedules` or starting daisy-chain workflows.

```typescript
// In ScheduledTriggerService (simplified)

async onTriggerCreated(trigger: ScheduledTrigger, scopes: Scopes) {
  if (!trigger.enabled) return;

  const nextOccurrence = computeNextCronOccurrence(
    trigger.cronExpression,
    trigger.cronTimezone,
    trigger.runAt,
  );
  if (!nextOccurrence) return;

  const delaySeconds = Math.max(0, Math.floor((nextOccurrence.getTime() - Date.now()) / 1000));

  await triggerScheduler.schedule({
    tenantId: scopes.tenantId,
    projectId: scopes.projectId,
    agentId: scopes.agentId,
    scheduledTriggerId: trigger.id,
    scheduledFor: nextOccurrence.toISOString(),
    enqueuedAt: new Date().toISOString(),
    triggerUpdatedAt: trigger.updatedAt,
  }, delaySeconds);
}

async onTriggerUpdated(trigger: ScheduledTrigger, scopes: Scopes) {
  // Enqueue new message with updated schedule.
  // Old message (if pending) will be dropped by consumer's staleness check.
  await this.onTriggerCreated(trigger, scopes);
}

async onTriggerDeleted(trigger: ScheduledTrigger, scopes: Scopes) {
  // No queue action needed.
  // If a message is pending, consumer will read manage DB → trigger not found → drop.
}
```

### 24-Hour Delay Cap Handling

Vercel Queue's maximum delay is 24 hours (86,400 seconds). For triggers with infrequent schedules (weekly, monthly), the next occurrence may exceed this.

**Relay pattern:**

1. Enqueue with `delaySeconds = min(actualDelay, 86400)`
2. When the consumer receives a "relay" message, it checks: is `scheduledFor` still in the future?
3. If yes → re-enqueue with `min(remainingDelay, 86400)` (another relay hop)
4. If no → `scheduledFor` is now or past → proceed with dispatch

**Impact:** A weekly trigger (`0 0 * * 0`) requires at most 1 relay hop (7 days = max 7 hops of 24h each). A daily trigger requires 0 hops. Most triggers (`*/5`, `*/15`, `0 `*) are under 24h.

graphile-worker and local scheduler: no cap — they support arbitrary delays natively.

### Startup Recovery (Local Dev Only)

`LocalScheduler` is in-memory — all timers are lost on server kill/restart. A startup catch-up scan is the **only** way triggers resume:

```typescript
async function recoverLocalSchedulerOnStartup() {
  if (process.env.WORKFLOW_TARGET_WORLD !== 'local' && process.env.WORKFLOW_TARGET_WORLD) return;

  // Find all enabled cron triggers across all tenants/projects.
  // For each, compute next occurrence and enqueue via LocalScheduler.
  //
  // This is an expensive cross-branch operation, but it only runs once
  // on startup and only for local dev.
}
```

**Why only local dev:**

- **Vercel Cloud:** Vercel Queue persists messages and redelivers automatically. No recovery needed.
- **Self-hosted (graphile-worker):** Jobs are rows in Postgres. graphile-worker reconnects on restart and picks up pending jobs automatically. No recovery needed.
- **Local dev:** No persistence layer. Startup scan is the primary recovery mechanism.

## 11) What Changes From Current System


| Concern                                       | Current on `main` (daisy-chain)     | This spec (Vercel Queue)                         |
| --------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Who decides "when"                            | Workflow itself (sleep + chain)     | Queue delayed delivery                           |
| Execution model                               | Long-lived daisy-chain workflow     | One-shot workflow per occurrence                 |
| Deployment pinning                            | Yes (inherits from parent)          | No (poll mode not pinned)                        |
| Deploy-time cost                              | O(triggers) restart                 | O(0) — nothing needed                            |
| New DB tables                                 | None                                | None                                             |
| Double-fire prevention                        | N/A (single chain)                  | Queue idempotency + invocation idempotency       |
| Next occurrence blocked by current execution? | Yes (chain waits)                   | No (enqueue next before start)                   |
| Scheduler mechanism                           | Per-trigger workflow with sleep     | Queue delayed delivery                           |
| Self-hosted                                   | Accidental (no pinning in pg world) | graphile-worker delayed jobs                     |
| Cross-environment code                        | Shared (WDK abstracts worlds)       | Shared consumer logic, per-env scheduler backend |


## 12) Implementation Plan

### Phase 1: Scheduling Abstraction + Vercel Queue


| File                                                                        | Action                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `agents-api/src/domains/run/services/scheduling/types.ts`                   | Create — `TriggerScheduleMessage`, `TriggerScheduler` interface |
| `agents-api/src/domains/run/services/scheduling/vercelQueueScheduler.ts`    | Create — Vercel Queue implementation                            |
| `agents-api/src/domains/run/services/scheduling/graphileWorkerScheduler.ts` | Create — graphile-worker implementation                         |
| `agents-api/src/domains/run/services/scheduling/localScheduler.ts`          | Create — local dev implementation                               |
| `agents-api/src/domains/run/services/scheduling/index.ts`                   | Create — factory + export `triggerScheduler` singleton          |
| `agents-api/package.json`                                                   | Add `@vercel/queue` dependency                                  |


### Phase 2: Consumer


| File                                                                          | Action                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `agents-api/src/domains/run/services/scheduling/triggerConsumer.ts`           | Create — `consumeTriggerMessage()` shared logic                          |
| `agents-api/src/domains/run/services/scheduling/computeNextCronOccurrence.ts` | Create — cron-parser helper (extracted from existing `computeNextRunAt`) |
| `vercel.json`                                                                 | Add `experimentalTriggers` for `trigger-dispatch` topic                  |
| `agents-api/app/api/queues/trigger-dispatch/route.ts`                         | Create — Vercel Queue push mode handler (or poll mode endpoint)          |


### Phase 3: CRUD Integration


| File                                                                                               | Action                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents-api/src/domains/run/services/ScheduledTriggerService.ts` (or equivalent manage-side hooks) | Modify — `onTriggerCreated/Updated/Deleted` calls `triggerScheduler.schedule()` instead of writing to `trigger_schedules` or starting daisy-chain workflows |


### Phase 4: Migration + Initial Enqueue


| File                                                                     | Action                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `agents-api/src/domains/run/services/scheduling/seedExistingTriggers.ts` | Create — one-time migration: reads all enabled triggers from manage DB, enqueues first occurrence for each |


### Phase 5: Self-hosted Integration


| File                      | Action                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `agents-api/src/index.ts` | Modify — register graphile-worker task for `trigger-dispatch` on postgres world startup |


### Phase 6: Cleanup


| File                                                                 | Action                                                         |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `agents-api/src/domains/run/workflow/functions/schedulerWorkflow.ts` | Delete                                                         |
| `agents-api/src/domains/run/workflow/steps/schedulerSteps.ts`        | Delete                                                         |
| `agents-api/src/domains/run/services/SchedulerService.ts`            | Delete                                                         |
| `agents-api/src/domains/run/services/triggerDispatcher.ts`           | Delete                                                         |
| `agents-api/src/routes/restartScheduler.ts`                          | Delete                                                         |
| `packages/agents-core/src/data-access/runtime/triggerSchedules.ts`   | Delete                                                         |
| `packages/agents-core/src/data-access/runtime/schedulerState.ts`     | Delete                                                         |
| `packages/agents-core/src/db/runtime/runtime-schema.ts`              | Remove `triggerSchedules` + `schedulerState` table definitions |
| `.github/workflows/vercel-production.yml`                            | Remove `restart-scheduler` job                                 |
| DB migration                                                         | Drop `trigger_schedules` + `scheduler_state` tables            |


## 13) Alternatives Considered


| Alternative                                                                                                     | Why not                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Schedule table + scheduler workflow** | Works but introduces 2 new tables, write-through sync, polling loop, claim/release cycle, deploy restart hook, bulk resync. More moving parts than needed now that Vercel Queue provides the primitives natively. |
| **Vercel Cron as primary scheduler**                                                                            | Works on Vercel (no deployment pinning). But needs a separate mechanism for self-hosted. Two code paths.                                                                                                                                                     |
| **Vercel Queue push mode only**                                                                                 | Push mode consumers are air-gapped (good for security) but historically deployment-pinned. If push mode routing has been updated to deliver to current production (v2beta topic routing), this becomes viable. Otherwise, poll mode avoids pinning entirely. |
| **graphile-worker for all environments**                                                                        | Would unify the backend but requires Postgres on all environments and doesn't leverage Vercel's managed queue infrastructure. graphile-worker is already used by `@workflow/world-postgres` — it's the self-hosted backend.                                  |
| **BullMQ**                                                                                                      | Requires Redis. Adds a new infrastructure dependency.                                                                                                                                                                                                        |
| **Inngest**                                                                                                     | Solves deployment pinning by design. But adds a new runtime dependency. Overkill for this use case.                                                                                                                                                          |


## 14) Decision Log


| ID  | Decision                                                                 | Type | 1-way? | Status   | Rationale                                                                                                                                                      |
| --- | ------------------------------------------------------------------------ | ---- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Use Vercel Queue with delayed delivery for scheduling on Vercel          | T    | No     | Proposed | Eliminates schedule table, polling loop, and deploy restart. Native delayed delivery + idempotency.                                                            |
| D2  | Use graphile-worker delayed jobs for self-hosted scheduling              | T    | No     | Proposed | graphile-worker already powers `@workflow/world-postgres`. Native delayed job support via `runAt`. LISTEN/NOTIFY for near-instant pickup. No new dependencies. |
| D3  | Thin `TriggerScheduler` abstraction with per-environment implementations | T    | No     | Proposed | Keeps consumer logic shared across environments. Only the enqueue mechanism differs.                                                                           |
| D4  | Enqueue next occurrence before starting execution (chain resilience)     | T    | No     | Proposed | Prevents chain breaks if consumer crashes after execution. Worst case: duplicate invocation (caught by idempotency key).                                       |
| D5  | Relay pattern for >24h delays                                            | T    | No     | Proposed | Vercel Queue caps delay at 24h. Relay hops handle weekly/monthly triggers. graphile-worker and local have no cap.                                              |
| D6  | Consumer validates trigger against manage DB on every invocation         | T    | No     | Proposed | Eliminates need for message cancellation. Stale messages are cheap (one branch-scoped DB read + drop).                                                         |
| D7  | Reuse `scheduledTriggerRunnerWorkflow` unchanged                         | T    | No     | Proposed | One-shot workflow + all step functions are already implemented and tested. No changes needed.                                                                  |
| D8  | Push mode consumer with `queue/v2beta` experimental triggers             | T    | No     | Proposed | Air-gapped from internet. Automatically routed by Vercel. Falls back to poll mode if deployment routing is per-publisher.                                      |
| D9  | No `trigger_schedules` or `scheduler_state` tables                       | T    | Yes    | Proposed | Core simplification. Queue replaces both tables. Recovery via catch-up scan instead of bulk resync.                                                            |


## 15) Open Questions


| ID  | Question                                                                                                                                                                              | Priority | Blocking? | Plan to resolve                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Push mode deployment routing: does `queue/v2beta` deliver to the current production deployment, or to the deployment that published the message? If per-publisher, we need poll mode. | P0       | Yes       | Test with `experimentalTriggers` on a staging project. If per-publisher, switch to poll mode (omit `Vqs-Deployment-Id`).                       |
| Q2  | Does `@workflow/world-postgres` expose its graphile-worker `WorkerUtils` or `Runner` instance, or do we need to create a separate connection?                                         | P1       | No        | Check the WDK postgres world source. May need to export the runner/utils or create a parallel graphile-worker connection to the same database. |
| Q3  | `@vercel/queue` pricing impact at scale — what's the per-operation cost for send + receive + ack at thousands of triggers?                                                            | P2       | No        | Review [Vercel Queue pricing](https://vercel.com/docs/queues/pricing). Estimate: ~3 operations per trigger fire.                               |
| Q4  | Should catch-up recovery run as Vercel Cron, startup task, or both?                                                                                                                   | P2       | No        | Start with startup task + optional Vercel Cron for belt-and-suspenders.                                                                        |
| Q5  | Vercel Queue `retentionSeconds` — does the 24h max apply to delayed messages too? i.e., does a message with `delaySeconds: 86000` + processing time risk expiring?                    | P1       | No        | Test. If yes, set `retentionSeconds` to max and account for processing time in delay calculation.                                              |
| Q6  | Can we use push mode (`handleCallback`) within the existing Hono app, or does it require a Next.js API route?                                                                         | P1       | No        | Test. May need a separate route file or adapter. `handleNodeCallback` exists for non-Next.js apps.                                             |


## 16) Assumptions


| ID  | Assumption                                                                              | Confidence | Verification Plan                                                                                                     |
| --- | --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| A1  | Vercel Queue `delaySeconds` reliably delivers within seconds of delay expiry            | MEDIUM     | Not documented by Vercel — docs only state messages become visible after delay expires, no latency SLA. Must test with 60s and 300s delays on staging to measure actual delivery latency. |
| A2  | Push mode consumers on `queue/v2beta` are invoked on the current production deployment  | MEDIUM     | Critical assumption. Test on staging. If false, switch to poll mode.                                                  |
| A3  | graphile-worker `runAt` works for delays up to 7+ days                                  | HIGH       | graphile-worker is mature. `runAt` accepts any future `Date`. Verified in docs.                                       |
| A4  | Vercel Queue `idempotencyKey` dedup window covers the full retention period             | HIGH       | Documented: "The deduplication window lasts for the entire lifetime of the original message."                         |
| A5  | One branch-scoped DoltgreSQL read per message is fast enough (~5ms)                     | HIGH       | Single trigger lookup by ID, not a cross-project scan.                                                                |
| A6  | `@vercel/queue` works in the agents-api Hono app (not just Next.js)                     | MEDIUM     | `handleNodeCallback` exists for non-Next.js. Test integration.                                                        |
| A7  | graphile-worker instance from `@workflow/world-postgres` is accessible for custom tasks | MEDIUM     | May need WDK to export `WorkerUtils`/`Runner`, or create a parallel graphile-worker instance on the same Postgres DB. |


## 17) Risks & Mitigations


| Risk                                                           | Likelihood | Impact                                                   | Mitigation                                                                                                                        |
| -------------------------------------------------------------- | ---------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Push mode delivers to wrong deployment (per-publisher pinning) | Medium     | Triggers run on stale code                               | Fall back to poll mode (omit deployment ID). Poll mode is explicitly deployment-agnostic per Vercel docs.                         |
| Chain break: consumer crashes between execute and re-enqueue   | Low        | One trigger misses one occurrence until next restart (local) or redelivery (Vercel/graphile) | Enqueue next occurrence BEFORE starting execution. Vercel Queue redelivers on visibility timeout. graphile-worker retries automatically. Local dev recovers on next server restart via startup scan. |
| Stale messages accumulate when triggers are frequently updated | Low        | Extra consumer invocations (~ms each, no execution)      | Consumer validates and drops. Cost is one branch-scoped DB read per stale message.                                                |
| 24h delay cap causes relay storms for very-infrequent triggers | Low        | Extra queue operations for weekly/monthly triggers       | At most 7 relay hops for a weekly trigger. Cost is negligible.                                                                    |
| Vercel Queue outage delays all trigger execution               | Low        | Triggers delayed until queue recovers                    | Vercel Queue has 3-AZ replication. Self-hosted is unaffected (graphile-worker). Catch-up scan recovers on restoration.            |
| `@vercel/queue` SDK incompatible with Hono app                 | Medium     | Need adapter or separate route file                      | `handleNodeCallback` exists for non-Next.js. Worst case: thin Next.js API route that delegates to shared consumer.                |
| graphile-worker instance not accessible from WDK               | Medium     | Need separate graphile-worker connection for self-hosted | Create parallel graphile-worker `WorkerUtils` pointing to same database. Low overhead — shares the same Postgres connection pool. |


## 18) Future Work

### Explored

- **Per-trigger concurrency limits:** Add `maxConcurrency` field. Consumer checks active invocation count before dispatching. Queue visibility timeout prevents re-delivery during execution.
- **Vercel Queue batch receive:** Poll mode supports `limit: 10` per receive call. Could batch multiple trigger dispatches in a single consumer invocation for efficiency.

### Identified

- **Remove `scheduledWorkflows` table from manage DB:** No longer needed for supersession tracking. Can be cleaned up in a follow-up migration.
- **Observability dashboard:** Vercel Queue provides built-in observability. Integrate with existing telemetry (dispatch latency, message age, delivery count).
- **Cost optimization:** If queue operation costs become significant at scale, consider batching: one "tick" message per minute → consumer queries manage DB for what's due → dispatches. This is a hybrid of the schedule-table approach and queue approach.

