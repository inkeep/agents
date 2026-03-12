# Evidence: Scalability Analysis of Restart-All-On-Deploy

**Date:** 2026-03-12
**Sources:** PRD, @workflow/core start.js, manage-schema.ts, dolt-cleanup.ts

## Finding: Design target is "thousands of triggers"
**Confidence:** CONFIRMED
**Evidence:** `tasks/prd-scheduled-triggers.md`:
> "Vercel cron functions require static configuration in vercel.json and cannot be dynamically created via API—unsuitable for multi-tenant SaaS with thousands of user-configured schedules."

## Finding: Each start() call creates 1 DB write + 1 queue message
**Confidence:** CONFIRMED
**Evidence:** `@workflow/core` start.js:51-85 — `events.create()` + `world.queue()`

At 1,500 triggers: 1,500 DB writes + 1,500 queue messages in seconds.

## Finding: Doltgres branch enumeration is O(n) per project
**Confidence:** CONFIRMED
**Evidence:** `doltListBranches()` does `SELECT * FROM dolt_branches` — linear scan.
Each branch needs a checkout + query. At 250 projects: ~30-50 seconds.

## Finding: Vercel Cron is static but only ONE entry is needed for a dispatcher
**Confidence:** CONFIRMED
The PRD rejected Vercel Cron because "cannot be dynamically created via API."
But a SINGLE static cron entry acting as a dispatcher only needs one entry in vercel.json.
The dispatcher reads dynamic trigger config from the DB at runtime.

## Finding: Vercel Cron always runs on the latest production deployment
**Confidence:** CONFIRMED
Vercel docs: "Cron Jobs run on your latest Production Deployment."
This means a cron dispatcher would inherently solve deployment pinning.
