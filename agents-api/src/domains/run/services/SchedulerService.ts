import { getSchedulerState, upsertSchedulerState } from '@inkeep/agents-core';
import runDbClient from 'src/data/db/runDbClient';
import { start } from 'workflow/api';
import { getLogger } from '../../../logger';
import { schedulerWorkflow } from '../workflow/functions/schedulerWorkflow';

const logger = getLogger('SchedulerService');

export async function startSchedulerWorkflow(): Promise<{
  runId: string;
  previousRunId: string | null;
}> {
  const previous = await getSchedulerState(runDbClient)();
  const run = await start(schedulerWorkflow, []);

  await upsertSchedulerState(runDbClient)({
    currentRunId: run.runId,
  });

  logger.info(
    { runId: run.runId, previousRunId: previous?.currentRunId ?? null },
    'Scheduler workflow started'
  );

  return {
    runId: run.runId,
    previousRunId: previous?.currentRunId ?? null,
  };
}

export async function getSchedulerStatus() {
  return getSchedulerState(runDbClient)();
}
