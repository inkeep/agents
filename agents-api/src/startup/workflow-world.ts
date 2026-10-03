import {
  cleanupExpiredStreamChunks,
  cleanupExpiredToolApprovalDecisions,
} from '@inkeep/agents-core';
import runDbClient from '../data/db/runDbClient';
import { startSchedulerWorkflow } from '../domains/run/services/SchedulerService';
import { env } from '../env';
import { getLogger } from '../logger';
import { recoverOrphanedWorkflows, world } from '../workflow/world';

const logger = getLogger('workflow-world-startup');

const DEFAULT_STARTUP_DELAY_MS = 3000; // Give the HTTP server time to start listening
const STREAM_CHUNK_CLEANUP_INTERVAL_MS = 60_000;

let workflowWorldStartScheduled = false;

/**
 * Start the workflow world worker (postgres only), recover orphaned runs, and start the
 * scheduler workflow. Errors are logged, never thrown.
 */
export async function runWorkflowWorldStartup(): Promise<void> {
  const targetWorld = env.WORKFLOW_TARGET_WORLD || 'local';
  try {
    if (targetWorld === '@workflow/world-postgres') {
      await world.start();
      logger.info({}, 'Workflow world worker started successfully');
    } else {
      logger.info({ targetWorld }, 'Workflow world does not require explicit start');
    }
    const recoveredCount = await recoverOrphanedWorkflows();
    if (recoveredCount > 0) {
      logger.info({ recoveredCount }, 'Recovered orphaned workflow(s)');
    }
    await startSchedulerWorkflow();
    logger.info({}, 'Scheduler workflow started');
  } catch (err) {
    logger.error({ error: err }, 'Failed to start workflow world');
  }
}

async function runPeriodicCleanup(): Promise<void> {
  try {
    await cleanupExpiredStreamChunks(runDbClient)();
  } catch (err) {
    logger.error({ error: err }, 'Failed to cleanup expired stream chunks');
  }
  try {
    await cleanupExpiredToolApprovalDecisions(runDbClient)();
  } catch (err) {
    logger.error({ error: err }, 'Failed to cleanup expired tool approval decisions');
  }
}

/**
 * Schedule workflow world startup for long-running server processes.
 *
 * Shared by the default entrypoint (`index.ts`) and `createAgentsApp()` so that apps built
 * with the factory (e.g. the self-hosted Docker image) also start the durable-execution
 * worker. Idempotent: only the first call in a process schedules anything.
 *
 * - `@workflow/world-postgres`: starts the job worker, then recovers orphaned runs.
 * - `local`: recovers orphaned runs (no worker to start).
 * - `vercel`: nothing to start; Vercel drives the queue.
 * - Expired stream chunk / tool approval cleanup runs on an interval unless on Vercel.
 */
export function scheduleWorkflowWorldStartup(options?: { delayMs?: number }): void {
  if (workflowWorldStartScheduled) {
    return;
  }
  workflowWorldStartScheduled = true;

  const targetWorld = env.WORKFLOW_TARGET_WORLD || 'local';
  const delayMs = options?.delayMs ?? DEFAULT_STARTUP_DELAY_MS;

  if (targetWorld === '@workflow/world-postgres' || targetWorld === 'local') {
    logger.info({ targetWorld, delayMs }, 'Scheduling workflow world worker start');
    setTimeout(() => {
      void runWorkflowWorldStartup();
    }, delayMs);
  }

  if (!process.env.VERCEL) {
    const cleanupTimer = setInterval(() => {
      void runPeriodicCleanup();
    }, STREAM_CHUNK_CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  }
}

/** @internal Test helper to reset the once-per-process guard. */
export function resetWorkflowWorldStartupForTests(): void {
  workflowWorldStartScheduled = false;
}
