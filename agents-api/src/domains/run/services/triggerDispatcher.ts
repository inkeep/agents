import {
  advanceScheduledTriggerNextRunAt,
  type DueScheduledTrigger,
  findDueScheduledTriggersAcrossProjects,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import {
  scheduledTriggerRunnerWorkflow,
  type TriggerPayload,
} from '../workflow/functions/scheduledTriggerRunner';
import { computeNextRunAt } from '@inkeep/agents-core';

const logger = getLogger('triggerDispatcher');

export interface DispatchResult {
  dispatched: number;
}

export async function dispatchDueTriggers(): Promise<DispatchResult> {
  const now = new Date();

  const dueTriggers = await findDueScheduledTriggersAcrossProjects(runDbClient)({
    asOf: now.toISOString(),
  });

  if (dueTriggers.length === 0) {
    return { dispatched: 0 };
  }

  logger.info({ dueCount: dueTriggers.length }, 'Found due triggers');

  const results = await Promise.allSettled(
    dueTriggers.map((trigger) => dispatchSingleTrigger(trigger))
  );

  let dispatched = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      dispatched++;
    } else {
      logger.error({ error: result.reason }, 'Dispatch failed unexpectedly');
    }
  }

  return { dispatched };
}

async function dispatchSingleTrigger(trigger: DueScheduledTrigger): Promise<void> {
  const { tenantId, projectId, agentId, id: scheduledTriggerId } = trigger;

  const isOneTime = !trigger.cronExpression;
  const nextRunAt = isOneTime
    ? null
    : computeNextRunAt({
        cronExpression: trigger.cronExpression,
        cronTimezone: trigger.cronTimezone,
        runAt: trigger.runAt,
        lastScheduledFor: trigger.nextRunAt,
      });

  const payload: TriggerPayload = {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    scheduledFor: trigger.nextRunAt ?? new Date().toISOString(),
    ref: trigger.ref,
  };

  await start(scheduledTriggerRunnerWorkflow, [payload]);

  try {
    await advanceScheduledTriggerNextRunAt(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      nextRunAt,
    });
  } catch (err) {
    logger.error(
      { scheduledTriggerId, err },
      'Failed to advance next_run_at after workflow start; next tick will retry (idempotent)'
    );
  }

  logger.info({ scheduledTriggerId, scheduledFor: trigger.nextRunAt }, 'Trigger dispatched');
}
