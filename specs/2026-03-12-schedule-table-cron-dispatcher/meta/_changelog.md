## 2026-03-12 (revision 2)

### Changes
- **Major spec revision:** Rewrote §10 Proposed Solution with both scheduler options (Vercel Cron + Scheduler Workflow)
- **D2 updated:** Changed from long claim to short claim pattern (claim → advance → start → release, milliseconds)
- **§6 added:** Scheduling Guarantees section — timing (1-min), retries (not bound by guarantee), overlap (allowed), idempotency
- **D5 created:** Concurrent invocations allowed (no serialization)
- **D6 created:** First-attempt-within-1-minute timing guarantee
- **Architecture diagram updated:** Shows both scheduler options and short claim lifecycle
- **One-shot workflow simplified:** No `clearClaimAndAdvanceStep` — dispatcher handles all scheduling state
- **Dispatcher rewritten:** Time-based deadline instead of row limit. `dispatchSingleTrigger` with claim→advance→start→release→rollback pattern.
- **Q1 resolved → D2:** clearClaimAndAdvance runs in the dispatcher (advance before start, release after start)
- **Q3 resolved:** Time-based deadline, no row limit
- **Stale claim timeout reduced:** 15 min → 5 min (claim is only held during dispatch, not execution)
- **Future work added:** Per-trigger concurrency limits (`maxConcurrency`)

### Pending (carried forward)
- Q1 (new): Vercel Cron CRON_SECRET verification
- Q2: Sync write-through timing (async vs sync)
- Q3 (new): Scheduler workflow singleton detection
- Q4 (new): Stale claim rollback strategy

## 2026-03-12 (initial)

### Changes
- **Spec created:** Schedule Table + Cron Dispatcher prototype spec
- **evidence/current-system-trace.md:** Created — full system trace of current daisy-chain architecture
- **SPEC.md:** Initial draft with problem statement, current state, proposed solution, open questions

### Pending (carried forward)
- D1-D5: All pending decisions
