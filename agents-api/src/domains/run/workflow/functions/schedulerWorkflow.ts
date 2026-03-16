/**
 * Scheduler workflow — single long-lived workflow that ticks every 60 seconds
 * and dispatches all due scheduled triggers.
 *
 * Runs on all environments (Vercel, postgres world, local).
 * On Vercel: restarted by a post-deploy CI step to move onto the latest deployment.
 * On postgres/local: recovers via orphan recovery on server restart.
 *
 * Supersession: registers its run ID in `scheduler_state`. On each tick,
 * checks if it's still the active scheduler. If a newer scheduler has taken
 * over (e.g., deploy restart), this one stops.
 */

import { getWorkflowMetadata, sleep } from 'workflow';
import {
  checkSchedulerCurrentStep,
  dispatchDueTriggersStep,
  msUntilNextMinuteStep,
  registerSchedulerStep,
} from '../steps/schedulerSteps';

async function _schedulerWorkflow() {
  'use workflow';

  const metadata = getWorkflowMetadata();
  const myRunId = metadata.workflowRunId;

  await registerSchedulerStep({ runId: myRunId });

  while (true) {
    const sleepMs = await msUntilNextMinuteStep();
    await sleep(sleepMs);

    const isCurrent = await checkSchedulerCurrentStep({ runId: myRunId });
    if (!isCurrent) {
      return { status: 'superseded', runId: myRunId };
    }

    await dispatchDueTriggersStep();
  }
}

export const schedulerWorkflow = Object.assign(_schedulerWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/schedulerWorkflow//_schedulerWorkflow',
});
