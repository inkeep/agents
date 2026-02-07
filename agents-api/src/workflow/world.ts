/**
 * Workflow world configuration.
 *
 * Static imports are required instead of dynamic imports because
 * Vercel's NFT can't trace dynamic imports in bundled code.
 *
 * Set WORKFLOW_TARGET_WORLD to: 'local' | 'vercel' | '@workflow/world-postgres'
 * Defaults to 'local' for development if not set.
 */
import { createLocalWorld } from '@workflow/world-local';
import { createWorld as createPostgresWorld } from '@workflow/world-postgres';
import { createVercelWorld } from '@workflow/world-vercel';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('workflow-world');

// Default to 'local' for development environments
const targetWorld = env.WORKFLOW_TARGET_WORLD || 'local';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let world: any;

if (targetWorld === 'vercel') {
  const token = process.env.WORKFLOW_VERCEL_AUTH_TOKEN;
  world = createVercelWorld({
    token: token?.trim() || undefined,
    baseUrl: process.env.WORKFLOW_VERCEL_BASE_URL || undefined,
    projectConfig: {
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_TEAM_ID,
      environment: process.env.VERCEL_ENV,
    },
  });
} else if (targetWorld === '@workflow/world-postgres') {
  world = createPostgresWorld({
    connectionString: env.WORKFLOW_POSTGRES_URL || 'postgres://world:world@localhost:5432/world',
    jobPrefix: env.WORKFLOW_POSTGRES_JOB_PREFIX,
    queueConcurrency: Number(env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY) || 10,
  });
} else {
  // Default to local world for development and 'local' value
  world = createLocalWorld();
}

/**
 * Check if the current world supports orphan recovery.
 * Both postgres and local worlds support recovery (they both have runs.list and queue).
 * Vercel world does not need recovery as it handles this differently.
 */
function supportsOrphanRecovery(): boolean {
  return targetWorld === '@workflow/world-postgres' || targetWorld === 'local';
}

/**
 * Re-enqueue a workflow run by its ID.
 * This creates a new job in the queue for an existing run.
 *
 * Use this to recover orphaned workflows that are stuck in "running" state
 * but have no corresponding job in the queue (e.g., after server restart).
 */
export async function reenqueueRun(runId: string): Promise<void> {
  if (!supportsOrphanRecovery()) {
    logger.warn({ targetWorld }, 'reenqueueRun is not supported for this world');
    throw new Error(`reenqueueRun is not supported for ${targetWorld}`);
  }

  try {
    // Get the run details from the world
    const run = await world.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const { workflowName, deploymentId } = run;
    const queueName = `__wkf_workflow_${workflowName}`;

    logger.info({ runId, workflowName, queueName, deploymentId }, 'Re-enqueueing workflow run');

    // Queue the workflow again
    await world.queue(queueName, { runId }, { deploymentId });
  } catch (error) {
    logger.error(
      { runId, error: error instanceof Error ? error.message : String(error) },
      'Failed to re-enqueue workflow run'
    );
    throw error;
  }
}

/**
 * Re-enqueue a workflow run directly using run data (without re-fetching).
 * This is more efficient when we already have the run data from a list operation.
 */
async function reenqueueRunDirect(
  runId: string,
  workflowName: string,
  deploymentId?: string
): Promise<void> {
  const queueName = `__wkf_workflow_${workflowName}`;
  // Queue the workflow again
  await world.queue(queueName, { runId }, { deploymentId });
}

/**
 * Recover all orphaned workflow runs.
 *
 * For postgres world: Jobs are stored in pg-boss, lost on restart without recovery.
 * For local world: Jobs are in-memory setTimeouts, lost on restart.
 * Both worlds store run state persistently (postgres tables / JSON files).
 *
 * Returns the count of recovered workflows.
 */
interface WorkflowRun {
  runId: string;
  name: string;
  deploymentId?: string;
}

async function recoverRun(run: WorkflowRun): Promise<boolean> {
  try {
    await reenqueueRunDirect(run.runId, run.name, run.deploymentId);
    return true;
  } catch (error) {
    logger.warn(
      { runId: run.runId, error: error instanceof Error ? error.message : String(error) },
      'Failed to recover workflow run'
    );
    return false;
  }
}

export async function recoverOrphanedWorkflows(): Promise<number> {
  if (!supportsOrphanRecovery()) {
    logger.info({ targetWorld }, 'Orphan recovery skipped - not supported for this world');
    return 0;
  }

  try {
    logger.info({ targetWorld }, 'Checking for orphaned workflow runs...');

    let recoveredCount = 0;
    let cursor: string | undefined;

    do {
      const result = await world.runs.list({
        status: 'running',
        pagination: { limit: 100, cursor },
        resolveData: 'none',
      });

      if (!result.data?.length) {
        break;
      }

      for (const run of result.data) {
        if (await recoverRun(run)) {
          recoveredCount++;
        }
      }

      cursor = result.cursor;
    } while (cursor);

    logger.info(
      { recoveredCount },
      recoveredCount > 0 ? 'Finished recovering orphaned workflows' : 'No orphaned workflows found'
    );
    return recoveredCount;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to list orphaned workflows'
    );
    return 0;
  }
}

export { world };
