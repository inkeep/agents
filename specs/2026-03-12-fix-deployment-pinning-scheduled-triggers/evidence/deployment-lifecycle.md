# Evidence: Deployment Lifecycle and Promotion

**Date:** 2026-03-12
**Sources:** .github/workflows/vercel-production.yml, agents-api/src/index.ts

## Finding: Deployment follows migrate → deploy → promote pipeline

**Confidence:** CONFIRMED

GitHub Actions workflow (vercel-production.yml):
1. DB migrations (Postgres runtime + Doltgres manage)
2. Parallel deploy: `vercel deploy --prod` for agents-api and manage-ui
3. Wait for deployment checks: `vercel inspect --wait`
4. Promote: `vercel promote <url>` for both

## Finding: No post-promotion hooks exist for restarting workflows

**Confidence:** CONFIRMED

After `vercel promote`, the pipeline ends. There is no step that:
- Notifies the new deployment to pick up scheduled triggers
- Calls any "restart workflows" endpoint
- Signals old deployments to stop their daisy-chains

## Finding: Orphan recovery only supports postgres/local worlds, NOT Vercel

**Confidence:** CONFIRMED

```typescript
// world.ts:50-52
function supportsOrphanRecovery(): boolean {
  return targetWorld === '@workflow/world-postgres' || targetWorld === 'local';
}
```

The startup recovery in index.ts:117-145 runs only for postgres/local worlds. Vercel world has no equivalent startup migration.

## Finding: The supersession mechanism already exists and works

**Confidence:** CONFIRMED

When a new workflow run is started for a trigger (via `startScheduledTriggerWorkflow`), the old run detects the mismatch at `checkTriggerEnabledStep` (scheduledTriggerSteps.ts:206-245) and stops gracefully. This mechanism is already used for trigger updates and restarts.
