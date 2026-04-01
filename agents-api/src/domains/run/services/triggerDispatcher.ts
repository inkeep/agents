import {
  advanceScheduledTriggerNextRunAt,
  computeNextRunAt,
  findDueScheduledTriggersAcrossProjects,
  getScheduledTriggerUsers,
  type ScheduledTrigger,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import {
  scheduledTriggerRunnerWorkflow,
  type TriggerPayload,
} from '../workflow/functions/scheduledTriggerRunner';

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

  let totalDispatched = 0;
  const results = await Promise.allSettled(
    dueTriggers.map((trigger) => dispatchSingleTrigger(trigger))
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      totalDispatched += result.value;
    } else {
      const trigger = dueTriggers[i];
      logger.error(
        {
          error: result.reason,
          scheduledTriggerId: trigger.id,
          tenantId: trigger.tenantId,
          projectId: trigger.projectId,
          agentId: trigger.agentId,
        },
        'Dispatch failed unexpectedly'
      );
    }
  }

  return { dispatched: totalDispatched };
}

async function dispatchSingleTrigger(trigger: ScheduledTrigger): Promise<number> {
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

  const scheduledFor = trigger.nextRunAt ?? new Date().toISOString();
  const dispatchDelayMs = trigger.dispatchDelayMs ?? 0;

  const joinTableUsers = await getScheduledTriggerUsers(runDbClient)({
    tenantId,
    scheduledTriggerId,
  });

  let workflowsStarted = 0;

  if (joinTableUsers.length > 0) {
    const payloads: TriggerPayload[] = joinTableUsers.map((row, index) => ({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      scheduledFor,
      ref: trigger.ref,
      runAsUserId: row.userId,
      delayBeforeExecutionMs: index * dispatchDelayMs,
    }));

    const workflowResults = await Promise.allSettled(
      payloads.map((payload) => start(scheduledTriggerRunnerWorkflow, [payload]))
    );

    for (let i = 0; i < workflowResults.length; i++) {
      if (workflowResults[i].status === 'fulfilled') {
        workflowsStarted++;
      } else {
        logger.error(
          {
            scheduledTriggerId,
            userId: joinTableUsers[i].userId,
            error: (workflowResults[i] as PromiseRejectedResult).reason,
          },
          'Failed to start workflow for user'
        );
      }
    }
  } else if (trigger.runAsUserId) {
    const payload: TriggerPayload = {
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      scheduledFor,
      ref: trigger.ref,
    };

    await start(scheduledTriggerRunnerWorkflow, [payload]);
    workflowsStarted = 1;
  } else {
    logger.info(
      { scheduledTriggerId, tenantId, projectId },
      'Trigger has no associated users and no runAsUserId, skipping execution'
    );
  }

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

  logger.info({ scheduledTriggerId, scheduledFor, workflowsStarted }, 'Trigger dispatched');

  return workflowsStarted;
}
