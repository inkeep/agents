# Manage-Table Cron Dispatcher — Spec (Alternative Evaluation)

**Status:** Evaluation — this spec evaluates a single-table alternative to the runtime `trigger_schedules` approach  
**Owner(s):** —  
**Last updated:** 2026-03-13  
**Compared against:** [Schedule Table + Scheduler Workflow Spec](../2026-03-12-schedule-table-cron-dispatcher/SPEC.md)

---

## 1) Problem Statement

Same as the runtime-table spec: Vercel Workflow deployment pinning traps scheduled trigger execution on stale code. The architectural question this spec evaluates is **where to store the `next_run_at` materialized schedule** — specifically, whether it can live on the existing manage `scheduled_triggers` table in DoltgreSQL instead of a new runtime Postgres table.

### What this spec evaluates

Adding `next_run_at` and `claimed_at` columns directly to the existing `scheduled_triggers` table in the manage DB (DoltgreSQL), then polling that table for dispatch. The goal: avoid a second table, keep scheduling state co-located with trigger config.

## 2) Proposed Schema Change

### Current `scheduled_triggers` table (manage DB, DoltgreSQL)

```sql
CREATE TABLE scheduled_triggers (
  tenant_id     VARCHAR(256) NOT NULL,
  project_id    VARCHAR(256) NOT NULL,
  agent_id      VARCHAR(256) NOT NULL,
  id            VARCHAR(256) NOT NULL,
  name          VARCHAR(256),
  description   TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  cron_expression VARCHAR(256),
  cron_timezone   VARCHAR(64) DEFAULT 'UTC',
  run_at        TIMESTAMPTZ,
  payload       JSONB,
  message_template TEXT,
  max_retries   NUMERIC NOT NULL DEFAULT 1,
  retry_delay_seconds NUMERIC NOT NULL DEFAULT 60,
  timeout_seconds NUMERIC NOT NULL DEFAULT 780,
  run_as_user_id VARCHAR(256),
  created_by    VARCHAR(256),
  created_at    TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMP DEFAULT NOW() NOT NULL,
  PRIMARY KEY (tenant_id, project_id, agent_id, id)
);
```

### Proposed additions

```sql
ALTER TABLE scheduled_triggers
  ADD COLUMN next_run_at TIMESTAMPTZ,
  ADD COLUMN claimed_at  TIMESTAMPTZ;

CREATE INDEX scheduled_triggers_dispatch_idx
  ON scheduled_triggers (next_run_at)
  WHERE enabled = true AND claimed_at IS NULL;
```

Two new columns:
- `next_run_at` — precomputed timestamp for the next due execution
- `claimed_at` — distributed lock marker for the dispatch cycle

## 3) Proposed Dispatch Loop

### 3.1) Overview

```
Every 60s:
  1. Query runtime project_metadata for all projects (grouped by tenant)
  2. For each project's main branch, AS-OF-read scheduled_triggers WHERE next_run_at <= now()
  3. For each due trigger: withRef → claim → compute next → advance → start workflow → release
```

### 3.2) Step 1: Enumerate projects

Query the runtime `project_metadata` table for all `(tenantId, projectId, mainBranchName)` tuples. This is a single indexed Postgres query — fast and already used by `listProjectsMetadata`.

### 3.3) Step 2: Find due triggers (AS OF reads)

For each project, issue a read-only `AS OF` query against the manage DB:

```sql
SELECT * FROM scheduled_triggers AS OF '{tenantId}_{projectId}_main'
WHERE enabled = true
  AND next_run_at <= now()
  AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
```

This uses the existing DoltgreSQL `AS OF` pattern (see `listAgentsAcrossProjectMainBranches` in `packages/agents-core/src/data-access/manage/agents.ts`). A single manage DB connection can issue multiple `AS OF` queries without checking out branches.

All project reads could be parallelized with `Promise.allSettled`, bounded by a concurrency limiter.

### 3.4) Step 3: Claim + advance + dispatch

For each due trigger, acquire a branch-scoped connection via `withRef`:

```
withRef(manageDbPool, ref, async (db) => {
  // 1. Claim: UPDATE claimed_at = now() WHERE claimed_at IS NULL (or stale)
  // 2. Compute next_run_at from cron_expression + cron_timezone
  // 3. Advance: UPDATE next_run_at = <computed>, (disable if one-time)
  // 4. Start one-shot workflow
  // 5. Release: UPDATE claimed_at = NULL
}, { commit: true, commitMessage: 'Dispatch trigger {triggerId}' })
```

### 3.5) Step 4: Run chat workflow

Same as the runtime-table approach: start a one-shot `scheduledTriggerRunnerWorkflow` that calls `executeAgentAsync`.

## 4) Tradeoff Analysis

### 4.1) Branch iteration cost

**Issue:** DoltgreSQL is branch-scoped. There is no single query that returns "all due triggers across all tenants and projects." The dispatcher must:

1. Query `project_metadata` from runtime Postgres (fast, single query)
2. For each of N projects, issue an `AS OF` read against the manage DB

**Impact at scale:**

| Projects | AS OF queries per tick | Connection hold time (est.) |
|----------|----------------------|---------------------------|
| 10       | 10                   | ~50ms total               |
| 100      | 100                  | ~500ms total              |
| 1,000    | 1,000                | ~5s total (parallelized)  |
| 10,000   | 10,000               | ~50s total — exceeds 60s tick |

With bounded parallelism (e.g., 20 concurrent), 1,000 projects takes ~2.5s (50 batches × 50ms). At 10,000 projects, even with parallelism the scanning phase alone approaches or exceeds the 60s tick interval.

**Runtime-table comparison:** A single indexed query: `SELECT * FROM trigger_schedules WHERE next_run_at <= now() AND enabled = true AND (claimed_at IS NULL OR ...)` — O(1) regardless of project count, uses the `trigger_schedules_dispatch_idx` partial index.

**Verdict:** Manage-table approach scales linearly with project count. Runtime-table approach is constant-time.

### 4.2) Write versioning overhead

**Issue:** Every DoltgreSQL write creates a versioned commit. The dispatch cycle performs 3 writes per trigger per dispatch:

1. Claim (`UPDATE claimed_at = now()`)
2. Advance (`UPDATE next_run_at = ...`)
3. Release (`UPDATE claimed_at = NULL`)

Each `withRef(..., { commit: true })` creates a Dolt commit. For a cron trigger running every 5 minutes, that's **864 commits/day** per trigger (3 writes × 288 dispatches).

**Impact:**
- Dolt stores history for every commit — this is data designed for config versioning, not transactional churn
- `claimed_at` flipping between timestamps and NULL every minute is pure operational noise in the version history
- Branch history bloat makes `dolt_log`, `dolt_diff`, and branch operations progressively slower
- No way to exclude columns from Dolt versioning — all columns in the table are versioned

**Runtime-table comparison:** Postgres writes with no versioning overhead. Claim/release is a standard UPDATE — no history accumulation.

**Verdict:** Dolt versioning makes high-frequency transactional writes fundamentally inappropriate. The `claimed_at` column alone generates unbounded history pollution.

### 4.3) Connection pool pressure

**Issue:** Each `withRef` call acquires a dedicated connection from `manageDbPool`, checks out a branch, runs operations, checks out `main`, and releases.

The dispatch cycle needs one `withRef` connection per due trigger (for claim → advance → release). On a tick with 50 due triggers across 30 projects, the dispatcher holds up to 50 connections (or whatever the parallelism bound is).

Meanwhile, the `AS OF` scan phase also uses connections — though a single connection can serve multiple `AS OF` queries sequentially.

The manage pool default is 100 connections. The dispatcher would compete with manage API requests for connections.

**Runtime-table comparison:** Uses the runtime Postgres pool, which is a separate resource from the manage pool. No connection competition with manage API routes.

**Verdict:** Shared pool contention is a real operational risk. Self-hosted deployments with lower pool sizes are especially vulnerable.

### 4.4) AS OF consistency gap

**Issue:** The `AS OF` read sees the branch state at read time. Between the `AS OF` scan and the `withRef` claim, another process could:

- Disable the trigger (Builder toggles `enabled = false`)
- Delete the trigger
- Update the cron expression (changing `next_run_at`)

The `withRef` claim would succeed on stale data. The `checkTriggerEnabledStep` in the workflow catches deleted/disabled triggers, so this doesn't cause incorrect execution — but it does cause wasted work (claim + advance + workflow start + immediate exit).

**Runtime-table comparison:** Same TOCTOU risk exists, but the scan + claim happen in the same Postgres instance with a single connection pool, reducing the window.

**Verdict:** Not a correctness issue (existing safeguards handle it), but increases wasted work compared to the runtime-table approach.

### 4.5) Index behavior in DoltgreSQL

**Issue:** DoltgreSQL supports B-tree indexes, but its storage engine (prolly trees) has different performance characteristics than vanilla Postgres. Partial indexes (`WHERE enabled = true AND claimed_at IS NULL`) may not be supported or may behave differently.

The `AS OF` query path adds another variable — indexes may not be consulted the same way when reading historical snapshots vs. the checked-out branch.

**Runtime-table comparison:** Standard Postgres partial index with well-understood query planner behavior. The existing `trigger_schedules_dispatch_idx` is proven to work.

**Verdict:** Unknown performance characteristics for partial indexes under `AS OF` reads in DoltgreSQL add operational risk.

### 4.6) Commit semantics for claim/release

**Issue:** In the `withRef` flow with `{ commit: true }`, the claim, advance, and release all happen in one transaction that commits atomically as a single Dolt commit. This means `claimed_at` is set and then immediately cleared in the same commit — making the claim invisible in history and useless as a distributed lock.

To make `claimed_at` work as a lock, you'd need separate Dolt commits for claim and release, which means two `withRef` calls per trigger per dispatch (doubling the connection cost and commit noise).

**Alternative:** Skip `claimed_at` entirely and rely on the Dolt commit as an implicit lock. But Dolt commits are not atomic compare-and-swap — two dispatchers could both read `claimed_at IS NULL`, both succeed in writing, and double-fire.

**Runtime-table comparison:** Standard Postgres row-level locking. `UPDATE ... WHERE claimed_at IS NULL` is atomic — the first writer wins, the second gets zero rows. Simple and correct.

**Verdict:** DoltgreSQL's commit model is fundamentally incompatible with the claim/release distributed lock pattern. There is no clean way to implement ACID-safe dispatch without the lock, and the lock doesn't work correctly in Dolt.

### 4.7) Migration complexity

**Issue:** Adding columns to `scheduled_triggers` in DoltgreSQL requires migrating every branch. The `migrate-all-branches.ts` script exists for this purpose, but it iterates all branches sequentially and commits schema changes to each. For a multi-tenant platform with many projects, this migration is slow and must be coordinated.

**Runtime-table comparison:** Standard Postgres migration — one `ALTER TABLE` or `CREATE TABLE` applied once.

**Verdict:** DoltgreSQL schema migrations are more complex and slower than runtime Postgres migrations.

## 5) Comparison Matrix

| Dimension | Manage-table (this spec) | Runtime-table (prior spec) |
|-----------|-------------------------|---------------------------|
| **New tables** | 0 (columns added to existing) | 1 (`trigger_schedules`) |
| **Find due triggers** | O(projects) AS OF queries | O(1) single indexed query |
| **Claim/lock mechanism** | Broken — Dolt commits can't do atomic CAS | Standard Postgres row-level locking |
| **Write overhead** | ~864 Dolt commits/day/trigger (versioned noise) | Standard Postgres UPDATEs (no versioning) |
| **History pollution** | Unbounded — every claim/release versioned | N/A — runtime DB has no versioning |
| **Connection pool** | Shares manage pool (competition with API) | Separate runtime pool |
| **Scale ceiling** | ~1,000 projects before scan exceeds tick | Tens of thousands of triggers |
| **Migration** | Multi-branch Dolt migration | Single Postgres migration |
| **Sync layer needed** | No (config + schedule co-located) | Yes (`ScheduledTriggerService.syncTriggerToScheduleTable`) |
| **Deployment pinning fix** | Yes (same one-shot workflow approach) | Yes |
| **Data co-location** | Schedule state lives with config | Schedule state separate from config |
| **Operational complexity** | Lower table count, higher operational risk | Higher table count, lower operational risk |

## 6) The One Advantage: No Sync Layer

The manage-table approach has one genuine advantage: there is no sync layer. In the runtime-table approach, `ScheduledTriggerService` must sync every create/update/delete from manage to `trigger_schedules`. This sync layer:

- Must handle partial failures (manage write succeeds, runtime write fails)
- Must be called from every code path that modifies triggers (API routes, user deletion cleanup, etc.)
- Can drift if a code path forgets to call sync

With the manage-table approach, `next_run_at` is computed and written in the same transaction as the trigger create/update. No drift possible.

However, the sync layer in the runtime-table approach is already implemented and tested. The simplification from removing it does not outweigh the fundamental issues in sections 4.2 and 4.6.

## 7) Recommendation

**Do not use the manage-table approach.** The DoltgreSQL manage DB is designed for versioned configuration storage, not transactional dispatch workloads. Two issues are blocking:

1. **Broken locking (4.6):** DoltgreSQL's commit model cannot implement atomic compare-and-swap for `claimed_at`. Without a correct distributed lock, ACID-safe dispatch (no double-fires) is not achievable. Any workaround (external lock, advisory locks) negates the "no new table" benefit by introducing external state.

2. **Unbounded version history pollution (4.2):** The `claimed_at` column flips between a timestamp and NULL on every dispatch cycle. DoltgreSQL versions every write. This creates hundreds of commits per day per trigger that carry zero informational value, bloat branch history, and degrade Dolt operations over time.

Secondary concerns reinforce the recommendation:

3. **O(projects) scan cost (4.1):** The dispatch loop scales linearly with project count, while the runtime-table approach is constant-time.

4. **Connection pool competition (4.3):** The dispatcher would compete with manage API requests for connections from the same pool.

**The runtime `trigger_schedules` table (prior spec) is the correct approach.** It uses the right tool for the job: standard Postgres for transactional dispatch, DoltgreSQL for versioned configuration.
