# Spec Changelog

## 2026-03-31 — Session 1

- **Intake completed**: Problem validated with user. Confirmed demand reality (unlocks customer scenarios like sales team meeting prep), status quo pain (N duplicate triggers hard to manage), narrowest wedge (single-trigger-multi-user model, not just grouping), and future direction (same config for all users).
- **Evidence gathered**: Comprehensive mapping of current system — schema, dispatch, execution, auth, UI, user lifecycle. Persisted to `evidence/current-system.md` and `evidence/design-constraints.md`.
- **World model in progress**: Building design options for data model, dispatch, and API changes.
- **Decisions locked**: 8 decisions confirmed — fan-out in dispatcher, auto-disable on last user removal, inline+sub-resource API, backfill+deprecate runAsUserId, join table, separate tables for future groups, cleanup hook on project member removal, dispatchDelayMs for rate limits.
- **Evidence added**: `evidence/existing-patterns.md` (join table patterns), `evidence/permission-change-gap.md` (no cleanup on project access revocation).
- **New scope items**: dispatchDelayMs, cleanup hook in projectMembers, backfill migration.
- **Open questions remaining**: 3 (feature flag for cleanup, dispatch ordering, dispatchDelayMs cap).
- **Decisions 9-12 locked**: No feature flag, insertion order dispatch, stagger delay in runner workflow (not dispatcher), 5s cap per user.
- **Key design refinement**: Dispatcher stays non-blocking. All N workflows start immediately. Each workflow sleeps `position × dispatchDelayMs` before executing. This prevents dispatcher blocking while still staggering MCP calls.
- **Invocations table confirmed**: Already supports multiple invocations per trigger per tick — just different idempotency keys. No structural change needed beyond adding `runAsUserId` column.
- **All P0 open questions now resolved.** Remaining: P2 UI invocation display (deferred).
- **Adversarial review completed**: Found 2 critical issues (runner reads trigger.runAsUserId not payload; one-time disable race), 1 pre-existing low-risk issue (dispatch-level deduplication). All documented in `evidence/adversarial-review.md` and integrated into spec §6.7 and §9.
- **Scope freeze in progress**: All P0 items resolved, all decisions locked or directed.
- **Decisions 13-14 locked**: Non-breaking response schema (add `runAsUserIds` alongside deprecated `runAsUserId`). List run info adds `lastRunUserSummary` with per-status counts and `partial` status for mixed-result ticks.
- **Workflow engine deep dive**: Confirmed Vercel Workflows with durable sleep, concurrency=10 default. Evaluated coordinator workflow (Option C) vs sleep-in-runner (Option B). Sleep-in-runner chosen for better crash isolation, simpler implementation, and no serialization bottleneck.
- **Crash recovery fully traced**: 4 crash points analyzed. All safe due to idempotency keys + orphan recovery on restart.
- **Feedback round**: 6 issues addressed:
  - CRITICAL: Added composite FK `(tenant_id, scheduled_trigger_id) → scheduled_triggers(tenant_id, id)` with CASCADE to join table DDL.
  - HIGH: Defined "Run Now" (fan-out to all users by default, optional userId targeting) and "Rerun" (original user only, never fans out) semantics. Both currently read `trigger.runAsUserId` — must be updated.
  - HIGH: Run info grouping model specified: key by `(triggerId, scheduledFor)`, exclude manual runs from summary.
  - HIGH: Eliminated system-identity fallback for empty user set. Empty = no-op + log warning. Trigger should already be disabled (Decision 2).
  - MEDIUM: Dropped audit log for CASCADE removal — DB-level CASCADE can't produce app events. Accepted risk.
  - MEDIUM: Full authorization rules table for create/update/sub-resource with `runAsUserIds`. Non-admin can only include self, matching existing scalar delegation rule.
- **Decisions 15-20 locked.**
- **Technical audit completed**: Independent verification of all file paths, function/type references, schema details, and pattern claims. Zero discrepancies found.
- **Spec finalized**: Status set to "Ready for Implementation".
