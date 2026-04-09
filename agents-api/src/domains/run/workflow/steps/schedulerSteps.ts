import { getSchedulerState, upsertSchedulerState } from '@inkeep/agents-core';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { dispatchDueTriggers } from '../../services/triggerDispatcher';

const logger = getLogger('scheduler-steps');

export async function registerSchedulerStep(params: { runId: string }): Promise<void> {
  'use step';
  await upsertSchedulerState(runDbClient)({
    currentRunId: params.runId,
  });
  logger.info({ runId: params.runId }, 'Scheduler registered');
}

export async function checkSchedulerCurrentStep(params: { runId: string }): Promise<boolean> {
  'use step';
  const state = await getSchedulerState(runDbClient)();
  if (!state?.currentRunId) return false;
  return state.currentRunId === params.runId;
}

export async function msUntilNextMinuteStep(): Promise<number> {
  'use step';
  const ms = 60_000 - (Date.now() % 60_000);
  return Math.max(ms, 1_000);
}

export async function dispatchDueTriggersStep(): Promise<void> {
  'use step';
  const result = await dispatchDueTriggers();
  if (result.dispatched > 0) {
    logger.info({ dispatched: result.dispatched }, 'Dispatch tick completed');
  }
}

