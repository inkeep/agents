import {
  advanceTriggerSchedule,
  claimTriggerSchedule,
  findDueTriggerSchedules,
  releaseTriggerScheduleClaim,
  rollbackTriggerSchedule,
  type TriggerScheduleRow,
} from '@inkeep/agents-core';
import runDbClient from 'src/data/db/runDbClient';
import { start } from 'workflow/api';
import { getLogger } from '../../../logger';
import {
  scheduledTriggerRunnerWorkflow,
  type TriggerPayload,
} from '../workflow/functions/scheduledTriggerRunner';
import { computeNextRunAt } from './computeNextRunAt';

const logger = getLogger('triggerDispatcher');

export interface DispatchResult {
  dispatched: number;
}

export async function dispatchDueTriggers(): Promise<DispatchResult> {
  const now = new Date();

  const dueTriggers = await findDueTriggerSchedules(runDbClient)({
    asOf: now.toISOString(),
  });

  if (dueTriggers.length === 0) {
    return { dispatched: 0 };
  }

  logger.info({ dueCount: dueTriggers.length }, 'Found due triggers');

  const results = await Promise.allSettled(
    dueTriggers.map((schedule) => dispatchSingleTrigger(schedule))
  );

  const dispatched = results.filter(
    (r) => r.status === 'fulfilled' && r.value === 'dispatched'
  ).length;

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ error: result.reason }, 'Dispatch failed unexpectedly');
    }
  }

  return { dispatched };
}

async function dispatchSingleTrigger(
  schedule: TriggerScheduleRow
): Promise<'dispatched' | 'skipped'> {
  const { tenantId, scheduledTriggerId } = schedule;

  const claimed = await claimTriggerSchedule(runDbClient)({
    tenantId,
    scheduledTriggerId,
    expectedClaimedAt: schedule.claimedAt,
  });

  if (!claimed) return 'skipped';

  const isOneTime = !schedule.cronExpression;
  const nextRunAt = isOneTime
    ? null
    : computeNextRunAt({
        cronExpression: schedule.cronExpression,
        cronTimezone: schedule.cronTimezone,
        runAt: schedule.runAt,
        lastScheduledFor: schedule.nextRunAt,
      });

  await advanceTriggerSchedule(runDbClient)({
    tenantId,
    scheduledTriggerId,
    nextRunAt,
    enabled: isOneTime ? false : undefined,
  });

  const payload: TriggerPayload = {
    tenantId,
    projectId: schedule.projectId,
    agentId: schedule.agentId,
    scheduledTriggerId,
    scheduledFor: schedule.nextRunAt!,
  };

  try {
    await start(scheduledTriggerRunnerWorkflow, [payload]);
  } catch (err) {
    await rollbackTriggerSchedule(runDbClient)({
      tenantId,
      scheduledTriggerId,
      nextRunAt: schedule.nextRunAt,
      enabled: isOneTime ? true : schedule.enabled,
    });
    logger.error({ scheduledTriggerId, err }, 'Workflow start failed, rolled back');
    return 'skipped';
  }

  await releaseTriggerScheduleClaim(runDbClient)({
    tenantId,
    scheduledTriggerId,
  });

  logger.info({ scheduledTriggerId, scheduledFor: schedule.nextRunAt }, 'Trigger dispatched');

  return 'dispatched';
}
