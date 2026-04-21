---
name: Adversarial Pre-Freeze Review Findings
description: Technical issues found in adversarial review of multi-user trigger design against actual codebase
type: evidence
---

## Issue 1: One-Time Trigger Disable Race (MEDIUM)

With multi-user fan-out, N workflows will each call `disableOneTimeTriggerStep()` when a one-time trigger completes. This calls `advanceScheduledTriggerNextRunAt()` which is an unconditional UPDATE — no WHERE clause checking current state.

**Impact**: The UPDATE executes N times on the same row. Functionally safe (same result) but wasteful and fragile.

**Fix**: Add `WHERE enabled = true` to the disable step so only the first call actually modifies. Or: move the one-time disable logic out of individual runner workflows and into the dispatcher (since the dispatcher already sets `nextRunAt = null` for one-time triggers).

**Location**: `scheduledTriggerSteps.ts` `disableOneTimeTriggerStep()`, `scheduledTriggers.ts` `advanceScheduledTriggerNextRunAt()`

## Issue 2: Runner Reads trigger.runAsUserId Not payload.runAsUserId (CRITICAL — must fix)

`scheduledTriggerRunner.ts` line 121: `runAsUserId: trigger.runAsUserId` — reads from the trigger record fetched by `checkTriggerEnabledStep`, not from the workflow payload.

With multi-user, the trigger record has no single `runAsUserId` (it's in the join table). The payload must carry the user ID.

**Fix**: Add `runAsUserId` to `TriggerPayload`. Runner uses `payload.runAsUserId` instead of `trigger.runAsUserId`. This is the only place where `trigger.runAsUserId` is read in the runner.

**Location**: `scheduledTriggerRunner.ts` line 121

## Issue 3: Dispatch-Level Deduplication (LOW — pre-existing)

If the scheduler restarts and re-ticks, the same trigger could be dispatched twice (2N workflows). Idempotency is at the invocation level (idempotency key prevents duplicate records), not the dispatch level.

**Impact**: Existing issue, not introduced by multi-user. The invocation-level idempotency key catches duplicates — the second set of N workflows would find existing invocations and return `already_executed`.

**No action needed** for multi-user feature — the new idempotency key format (`sched_{triggerId}_{userId}_{scheduledFor}`) still deduplicates correctly.

## Issue 4: Invocation Creation Coupled to Trigger Record (LOW)

`createInvocationIdempotentStep` stores `trigger.payload` in the invocation's `resolvedPayload`. This reads from the trigger, not the workflow payload.

**Impact**: Low — `payload` (the JSON data) is trigger-level and identical for all users. No per-user payload customization means this is fine.

**No action needed** unless per-user payload customization is added later.
