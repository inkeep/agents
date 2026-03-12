# SPEC: Fix Deployment Pinning for Scheduled Triggers

## 1. Problem Statement

Scheduled triggers in the agents-api use a **daisy-chain workflow pattern** where each iteration calls `start()` to create the next workflow run. Because `start()` is called without an explicit `deploymentId`, each new iteration inherits `process.env.VERCEL_DEPLOYMENT_ID` from the old deployment. This creates a self-perpetuating loop where:

1. **Code fixes never reach active triggers.** Triggers continue running on whatever deployment existed when they were first created.
2. **Old deployments are kept alive indefinitely** by continuous queue message routing.
3. **There is no mechanism** to migrate triggers to a new deployment after promotion.

**Immediate impact:** PR #2651 fixed `initiatedBy` propagation for user-scoped MCP auth, but the fix never reaches scheduled triggers that were started before the deploy.

**Prior research:** [reports/vercel-world-workflows-deployment-pinning/REPORT.md](../../reports/vercel-world-workflows-deployment-pinning/REPORT.md)

---

## 2. Phased Approach

This spec covers two phases:

- **Phase 1 (In Scope):** Tactical fix — post-promotion restart of all scheduled trigger workflows via GitHub Actions + internal API endpoint. Unblocks the MCP auth fix immediately.
- **Phase 2 (Future Work — Explored):** Strategic fix — replace the daisy-chain scheduling model with a Vercel Cron dispatcher + one-shot workflows. Eliminates the entire class of deployment pinning problems and scales to thousands of triggers.

Phase 1 has known scaling limits (restart cost is O(triggers) per deploy) that are acceptable at current scale but will require Phase 2 as the system grows. See [evidence/scalability-analysis.md](evidence/scalability-analysis.md) for the analysis.

---

## 3. Goals

1. **New deployment adoption:** After a deployment is promoted to production, all active scheduled triggers must start their *next* iteration on the new deployment.
2. **In-flight consistency:** A workflow that is mid-execution when a new deployment is promoted must finish on its original deployment. No mid-execution deployment switching.
3. **Cron continuity:** For cron-based triggers, the next invocation that begins *after* a successful deployment should run on the new deployment. No missed invocations.
4. **Zero manual intervention:** The migration must be automatic — no one should need to manually disable/re-enable triggers after each deploy.

## 4. Non-Goals

- Changing the daisy-chain pattern itself (Phase 1 — deferred to Phase 2)
- Supporting mid-workflow deployment migration (this would break consistency)
- Handling preview/branch deployments (production promotion only)
- Changing A2A communication patterns (already correctly using in-process fetch)

---

## 5. Current State

### System Architecture

```
┌──────────────────────────────────────────────────────────┐
│ GitHub Actions: vercel-production.yml                     │
│                                                          │
│  migrate-databases → deploy-agents-api → promote         │
│                    → deploy-manage-ui  →                  │
└──────────────────────────────────────────────────────────┘
                            │
                     vercel promote
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Vercel: agents-api                                       │
│                                                          │
│  Deployment A (old, STILL ALIVE)                         │
│  ├── Queue: __wkf_workflow_* → routed to Deployment A    │
│  └── scheduledTriggerRunner daisy-chain                  │
│       └── start() → deploymentId = A (from process.env)  │
│                                                          │
│  Deployment B (new, promoted)                            │
│  ├── Queue: __wkf_workflow_* → only new messages         │
│  └── No active triggers (nothing started them here)      │
└──────────────────────────────────────────────────────────┘
```

### Key Behaviors (Confirmed)

| Aspect | Current Behavior | Evidence |
|--------|-----------------|----------|
| A2A communication | **In-process** via `getInProcessFetch()` — stays on same instance | [evidence/a2a-communication-mechanism.md](evidence/a2a-communication-mechanism.md) |
| Queue routing | Messages stamped with `deploymentId`, routed by VQS to that deployment | [research report](../../reports/vercel-world-workflows-deployment-pinning/REPORT.md) |
| Daisy-chain `start()` | No `deploymentId` passed — inherits from `process.env` | scheduledTriggerRunner.ts:78 |
| Supersession mechanism | Already works — new `workflowRunId` in DB causes old runner to stop at next checkpoint | ScheduledTriggerService.ts:202-224, scheduledTriggerSteps.ts:206-245 |
| Post-promotion hooks | **None** — pipeline ends after `vercel promote` | [evidence/deployment-lifecycle.md](evidence/deployment-lifecycle.md) |
| Orphan recovery | Only for postgres/local worlds, **not Vercel** | world.ts:50-52 |
| Manage DB | Doltgres with branch-per-project (`{tenantId}_{projectId}_main`) | manage-schema.ts |

### In-Flight Consistency (Already Solved)

A2A calls use `getInProcessFetch()` (executionHandler.ts:301), which routes through the Hono app middleware **in the same process** — not over the network. This means:

- An in-flight workflow executing an agent stays on its deployment
- No risk of A2A calls hitting a different deployment via load balancer
- The workflow completes its current execution fully before checking for supersession

The supersession check happens at `checkTriggerEnabledStep()`, which is called:
- At workflow start (line 159)
- After sleep/before execution (line 245)
- Before chaining to next iteration (line 414)

An in-progress `executeScheduledTriggerStep()` is **never interrupted** by supersession. The workflow finishes the current invocation, then on the next checkpoint discovers it's been superseded.

---

## 6. Proposed Solution (Phase 1)

### Approach: Post-Promotion Restart via GitHub Actions + Internal API Endpoint

Add a **post-promotion step** to the GitHub Actions pipeline that calls a new internal endpoint on the newly promoted deployment. This endpoint restarts all active scheduled trigger workflows, causing them to start fresh on the new deployment.

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions (updated)                                     │
│                                                              │
│  migrate → deploy → promote → restart-scheduled-workflows   │
│                                        │                     │
│                                   curl POST                  │
│                              new deployment endpoint         │
└─────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│ New Deployment B                                             │
│                                                              │
│  POST /run/internal/restart-scheduled-workflows              │
│  1. List all Doltgres branches                               │
│  2. For each project branch, query enabled triggers          │
│  3. Call restartScheduledTriggerWorkflow() for each          │
│     → Creates new workflow runs on Deployment B              │
│     → Updates scheduledWorkflows.workflowRunId               │
│                                                              │
│  Old Deployment A                                            │
│  At next checkpoint: sees workflowRunId mismatch → STOP     │
└─────────────────────────────────────────────────────────────┘
```

### Sequence: Normal Deployment with Trigger Migration

```
Time ──────────────────────────────────────────────────────────▶

Deployment A (old)          Deployment B (new)
│                           │
│ trigger executing...      │ vercel promote
│ [agent running]           │
│ execution completes       │
│                           │ POST /restart-scheduled-workflows
│ checkTriggerEnabled       │ → restartScheduledTriggerWorkflow()
│ → sees mismatch           │ → new workflow started on B
│ → STOPS                   │
│                           │ new iteration sleeps until next cron
│ (deployment goes idle)    │ new iteration executes on B ✓
```

### Sequence: Deployment During Active Execution

```
Time ──────────────────────────────────────────────────────────▶

Deployment A (old)          Deployment B (new)
│                           │
│ trigger mid-execution     │ vercel promote
│ [agent running A2A]       │
│ [in-process fetch]        │ POST /restart-scheduled-workflows
│ [stays on A]              │ → new workflow started on B
│                           │
│ execution completes ✓     │ new workflow sleeps until next cron
│ tries to chain →          │
│ checkTriggerEnabled       │
│ → sees mismatch → STOPS   │
│                           │ next cron fires on B ✓
```

---

## 7. Design Details (Phase 1)

### 6.1 New Internal API Endpoint

**Path:** `POST /run/internal/restart-scheduled-workflows`

**Auth:** Shared secret via `INTERNAL_API_SECRET` environment variable, checked by middleware. GitHub Actions passes it as a Bearer token.

**Logic (synchronous):**
1. List all Doltgres branches via `doltListBranches()`
2. Filter to project-main branches (pattern: `{tenantId}_{projectId}_main`)
3. For each branch, `withRef()` to query:
   - All `scheduledTriggers` where `enabled = true`
   - Their corresponding `scheduledWorkflows`
4. For each enabled trigger — unconditionally restart (idempotent):
   - Call `restartScheduledTriggerWorkflow()` (already exists)
   - This starts a new workflow on the current (new) deployment
   - Updates `workflowRunId` in DB
   - Old workflow detects mismatch at next checkpoint and stops
5. Return summary: `{ restarted: number, failed: number, triggers: [...ids], errors: [...] }`
6. Non-zero `failed` count returns HTTP 207 (partial success); zero restarts returns 200

### 6.2 GitHub Actions Pipeline Change

Add a step after `promote`:

```yaml
restart-scheduled-workflows:
  name: Restart scheduled trigger workflows
  needs: [promote]
  runs-on: ubuntu-latest
  steps:
    - name: Restart workflows on new deployment
      run: |
        # Wait briefly for promotion to propagate
        sleep 10

        curl -X POST \
          "https://${{ env.PRODUCTION_DOMAIN }}/run/internal/restart-scheduled-workflows" \
          -H "Authorization: Bearer ${{ secrets.INTERNAL_API_SECRET }}" \
          -H "Content-Type: application/json" \
          --fail --retry 3 --retry-delay 5
```

### 6.3 What About `lastScheduledFor`?

When restarting a trigger, the new workflow needs to know the last scheduled time to calculate the next cron invocation correctly. The current `restartScheduledTriggerWorkflow()` starts with `lastScheduledFor: undefined`, which means it calculates from "now."

**This is acceptable** because:
- The old workflow already completed (or will complete) the current invocation
- The new workflow calculates the next cron time from the current moment
- If a cron was due between the old workflow stopping and the new one starting, it will fire immediately (the sleep duration will be ~0)

**Risk:** If the restart happens while the old workflow is mid-sleep (waiting for the next cron time), and the new workflow also starts sleeping, both could wake up and try to execute the same invocation. **Mitigation:** The idempotency key (`sched_{triggerId}_{scheduledFor}`) in `createInvocationIdempotentStep` prevents double-execution.

---

## 7.4 Implementation Plan

### Step 1: Add `INTERNAL_API_SECRET` env var
- Add to `agents-api/src/env.ts` (optional, string)
- Add to `.env.example`
- Configure in Vercel project settings + GitHub Actions secrets

### Step 2: Create internal auth middleware
- New file: `agents-api/src/middleware/internalAuth.ts`
- Checks `Authorization: Bearer <INTERNAL_API_SECRET>` header
- Returns 401 if missing/invalid
- Use with `noAuth()` in route definition (this is an internal endpoint, not user-facing)

### Step 3: Create the restart endpoint
- New route file: `agents-api/src/domains/run/routes/internal.ts`
- Route: `POST /internal/restart-scheduled-workflows`
- Auth: `internalAuth` middleware
- Logic:
  1. `doltListBranches(manageDbClient)` to get all branches
  2. Filter to `*_main` branches, parse `{tenantId}_{projectId}` from name
  3. For each branch, `withRef(manageDbPool, resolvedRef)` to query `scheduledTriggers` where `enabled = true`
  4. For each trigger, call `restartScheduledTriggerWorkflow()` with error handling
  5. Collect results and return summary JSON
- Mount in `agents-api/src/domains/run/index.ts` at `/internal`

### Step 4: Add data access function for cross-project trigger query
- New function in `packages/agents-core/src/data-access/manage/scheduledTriggers.ts`:
  `listEnabledScheduledTriggers(db)` — queries all enabled triggers without agent scoping
- Returns `{ tenantId, projectId, agentId, id, name }[]`

### Step 5: Update GitHub Actions pipeline
- Add `restart-scheduled-workflows` job in `.github/workflows/vercel-production.yml`
- `needs: [promote]`
- `sleep 10` then `curl POST` with retry logic
- New secrets: `INTERNAL_API_SECRET`, `PRODUCTION_DOMAIN` (or derive from existing config)

### Step 6: Tests
- Unit test for the restart endpoint (mock Doltgres branch query + restartScheduledTriggerWorkflow)
- Unit test for internal auth middleware
- Integration test: verify supersession mechanism works end-to-end when a new workflow is started for an existing trigger

### Step 7: One-time migration
- After deploying the endpoint, manually call it once to restart all currently-pinned triggers
- Or: disable and re-enable all active scheduled triggers via the manage UI

---

## 8. Requirements (Phase 1)

### R1: Post-promotion workflow restart
- After `vercel promote`, all enabled scheduled triggers must have their workflows restarted on the new deployment
- **Acceptance criteria:** After deployment, `scheduledWorkflows.workflowRunId` for all active triggers points to workflow runs on the new deployment

### R2: In-flight execution safety
- An in-progress agent execution must complete on its original deployment
- **Acceptance criteria:** No HTTP errors, partial responses, or dropped A2A calls during deployment transition

### R3: No duplicate invocations
- A cron invocation must not execute twice due to the restart
- **Acceptance criteria:** Idempotency key prevents double-creation of invocations; at most one `running` invocation per trigger at any time

### R4: No missed invocations
- A cron invocation that was due must still fire after the restart
- **Acceptance criteria:** New workflow calculates next cron time from now; if a cron was due, sleep duration is ~0 and it fires immediately

### R5: Graceful old-deployment shutdown
- Old deployment workflows must stop cleanly, not error out
- **Acceptance criteria:** Old workflows log "superseded" and return `{ status: 'stopped', reason: 'superseded' }`, not errors

---

## 9. Open Questions

| # | Question | Type | Priority | Blocking? | Status |
|---|----------|------|----------|-----------|--------|
| OQ1 | ~~How should the internal endpoint be authenticated?~~ | Technical | P1 | No | **Resolved → D5** |
| OQ2 | ~~Should the restart be synchronous or async?~~ | Technical | P1 | No | **Resolved → D6** |
| OQ3 | Should we add a `sleep 10` or similar delay after promote before calling the restart endpoint, to ensure the promotion has propagated? | Technical | P2 | No | Deferred — use 10s sleep as default, adjust if issues arise |
| OQ4 | Cross-branch query efficiency: iterating all Doltgres branches could be slow with many projects. Is this a concern at current scale? | Technical | P1 | No | Accepted risk — parallelize if slow (see R1) |
| OQ5 | ~~Should the endpoint restart all triggers or only stale ones?~~ | Technical | P2 | No | **Resolved → D7** |

## 10. Decision Log

| # | Decision | Type | Reversible? | Status |
|---|----------|------|-------------|--------|
| D1 | Use post-promotion GitHub Actions step (not startup hook or deployment-aware daisy-chain) | Technical | Yes | **Confirmed** |
| D2 | Leverage existing `restartScheduledTriggerWorkflow()` — no changes to the workflow framework | Technical | Yes | **Confirmed** |
| D3 | In-flight consistency is already handled by `getInProcessFetch()` + supersession checkpoints | Technical | N/A | **Confirmed** |
| D4 | No changes to daisy-chain `start()` call or `@workflow/world-vercel` | Technical | Yes | **Confirmed** |
| D5 | Auth via shared secret (`INTERNAL_API_SECRET` env var) | Technical | Yes | **Confirmed** |
| D6 | Synchronous restart — endpoint waits for all restarts and returns summary | Technical | Yes | **Confirmed** |
| D7 | Restart ALL enabled triggers unconditionally (idempotent) — don't check deployment affinity | Technical | Yes | **Confirmed** |
| D8 | Phased approach: Phase 1 (restart-all) now, Phase 2 (cron dispatcher) when scaling limits hit | Cross-cutting | Yes | **Confirmed** |
| D9 | Phase 2 architecture: Vercel Cron dispatcher + one-shot workflows, replacing daisy-chain | Technical | Yes | **Confirmed** (design explored, implementation deferred) |

## 11. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | `vercel promote` makes the new deployment immediately serve production traffic | HIGH | Vercel docs confirm this |
| A2 | Old deployments continue serving queue messages until they idle out | HIGH | Observed in production |
| A3 | The existing supersession mechanism works reliably | HIGH | Used by trigger update/delete flows today |
| A4 | Idempotency keys prevent duplicate invocations across old/new workflows | HIGH | Verified in scheduledTriggerSteps.ts:258-309 |

## 12. Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R1 | Cross-branch query is slow with many projects | Restart takes minutes, triggers run on old deployment longer | Low (current scale) | Parallelize branch queries; add timeout |
| R2 | GitHub Actions step fails (network, auth) | Triggers stay on old deployment until next deploy | Medium | Retry logic; monitoring alert if restart count is 0 |
| R3 | Race condition: old workflow chains before restart endpoint runs | One extra iteration on old deployment | Medium | Acceptable — next checkpoint catches supersession |
| R4 | Promotion propagation delay causes restart to hit old deployment | Restart is a no-op, triggers stay pinned | Low | Wait 10-15s after promote; verify deployment ID in response |

## 13. Future Work

### Phase 2: Vercel Cron Dispatcher + One-Shot Workflows (Explored)

**Status:** Design explored, deferred. Implement when Phase 1 scaling limits are hit (~500+ active triggers).

**Problem Phase 1 doesn't solve:** Restart cost is O(triggers) per deploy. At thousands of triggers, the restart endpoint becomes a bottleneck (Doltgres branch enumeration, queue message burst, endpoint timeout risk). See [evidence/scalability-analysis.md](evidence/scalability-analysis.md).

**Proposed architecture:**

```
vercel.json:
  crons: [{ path: "/run/cron/process-triggers", schedule: "* * * * *" }]
```

Every minute, Vercel Cron hits the endpoint on the **latest production deployment** (guaranteed by platform):
1. Query all triggers where next execution time <= now
2. For each due trigger, start a **one-shot** workflow (execute agent, handle retries, done)
3. Workflow does NOT chain — cron handles recurrence
4. Update trigger's `nextRunAt` after completion

**What changes from Phase 1:**
- Remove daisy-chain `startNextIterationStep()` from `scheduledTriggerRunner.ts`
- Workflow becomes one-shot: execute, retry if needed, complete
- New cron dispatcher endpoint replaces the post-promotion restart endpoint
- Add `nextRunAt` column to `scheduledTriggers` (or compute from last invocation + cron expression)
- Remove the restart-all GitHub Actions step (no longer needed)

**What stays:**
- Vercel Workflows for durable agent execution
- Retry logic, idempotency keys, invocation tracking
- All DB schemas, manage UI, API

**Why this eliminates deployment pinning:**
- Vercel Cron always runs on the latest production deployment (platform guarantee)
- Each trigger execution is a fresh one-shot workflow started by the latest deployment
- No daisy-chain = no deployment inheritance = no pinning
- Zero deploy-time cost regardless of trigger count

**Tradeoff:** Cron resolution is 1 minute (Vercel minimum). Acceptable for scheduled triggers (typically 5min/hourly/daily).

**Trigger to revisit:** When restart endpoint consistently takes >30 seconds, or when active trigger count exceeds ~500.

### Other Future Work

#### Identified
- **Deployment health monitoring:** Alert when scheduled triggers are running on a non-production deployment for more than N minutes after a promotion.

#### Noted
- **Preview deployment cleanup:** Old preview deployments accumulate. A cleanup mechanism could reclaim resources.
- **Deployment-aware daisy-chain:** Have `start()` fetch the "latest production deployment ID" via Vercel API before chaining. Rejected in favor of Phase 2 (cron dispatcher) as the long-term solution.
