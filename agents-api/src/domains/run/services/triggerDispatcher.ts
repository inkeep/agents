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
  type ScheduledDatasetRunPayload,
  scheduledDatasetRunWorkflow,
} from '../../evals/workflow/functions/scheduledDatasetRun';
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
        },
        'Dispatch failed unexpectedly'
      );
    }
  }

  return { dispatched: totalDispatched };
}

interface FanOutParams<T> {
  trigger: ScheduledTrigger;
  scheduledFor: string;
  dispatchDelayMs: number;
  workflowFn: { (payload: T): unknown; workflowId: string };
  buildPayload: (base: {
    tenantId: string;
    projectId: string;
    agentId?: string;
    scheduledTriggerId: string;
    scheduledFor: string;
    ref: string;
    runAsUserId?: string;
    delayBeforeExecutionMs?: number;
  }) => T;
  errorLabel: string;
}

async function dispatchTriggerForUsers<T>({
  trigger,
  scheduledFor,
  dispatchDelayMs,
  workflowFn,
  buildPayload,
  errorLabel,
}: FanOutParams<T>): Promise<number> {
  const { tenantId, projectId, agentId, id: scheduledTriggerId } = trigger;

  const joinTableUsers = await getScheduledTriggerUsers(runDbClient)({
    tenantId,
    scheduledTriggerId,
  });

  if (joinTableUsers.length === 0) {
    const payload = buildPayload({
      tenantId,
      projectId,
      agentId: agentId ?? undefined,
      scheduledTriggerId,
      scheduledFor,
      ref: trigger.ref,
      runAsUserId: trigger.runAsUserId ?? undefined,
    });
    await start(workflowFn, [payload]);
    return 1;
  }

  const workflowResults = await Promise.allSettled(
    joinTableUsers.map((row, index) => {
      const payload = buildPayload({
        tenantId,
        projectId,
        agentId: agentId ?? undefined,
        scheduledTriggerId,
        scheduledFor,
        ref: trigger.ref,
        runAsUserId: row.userId,
        delayBeforeExecutionMs: index * dispatchDelayMs,
      });
      return start(workflowFn, [payload]);
    })
  );

  let started = 0;
  for (let i = 0; i < workflowResults.length; i++) {
    if (workflowResults[i].status === 'fulfilled') {
      started++;
    } else {
      logger.error(
        {
          scheduledTriggerId,
          userId: joinTableUsers[i].userId,
          error: (workflowResults[i] as PromiseRejectedResult).reason,
        },
        errorLabel
      );
    }
  }
  return started;
}

async function dispatchSingleTrigger(trigger: ScheduledTrigger): Promise<number> {
  const { tenantId, projectId, id: scheduledTriggerId } = trigger;

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
  const isDatasetRun = trigger.datasetRunConfigId != null;

  let workflowsStarted: number;

  if (isDatasetRun && trigger.datasetRunConfigId) {
    const payload: ScheduledDatasetRunPayload = {
      tenantId,
      projectId,
      datasetRunConfigId: trigger.datasetRunConfigId,
      scheduledTriggerId,
      scheduledFor,
      ref: trigger.ref,
      runAsUserId: trigger.runAsUserId ?? undefined,
    };
    await start(scheduledDatasetRunWorkflow, [payload]);
    workflowsStarted = 1;
  } else if (trigger.agentId) {
    const agentId = trigger.agentId;
    workflowsStarted = await dispatchTriggerForUsers<TriggerPayload>({
      trigger,
      scheduledFor,
      dispatchDelayMs,
      workflowFn: scheduledTriggerRunnerWorkflow,
      buildPayload: (base) => ({ ...base, agentId }),
      errorLabel: 'Failed to start workflow for user',
    });
  } else {
    logger.warn({ scheduledTriggerId }, 'Trigger has neither datasetRunConfigId nor agentId');
    workflowsStarted = 0;
  }

  if (workflowsStarted > 0) {
    try {
      await advanceScheduledTriggerNextRunAt(runDbClient)({
        scopes: { tenantId, projectId, agentId: trigger.agentId ?? undefined },
        scheduledTriggerId,
        nextRunAt,
      });
    } catch (err) {
      logger.error(
        { scheduledTriggerId, err },
        'Failed to advance next_run_at after workflow start; next tick will retry (idempotent)'
      );
    }
  } else {
    logger.warn(
      { scheduledTriggerId, scheduledFor },
      'No workflows started for trigger tick; not advancing nextRunAt so next tick retries'
    );
  }

  logger.info(
    { scheduledTriggerId, scheduledFor, workflowsStarted, isDatasetRun },
    'Trigger dispatched'
  );

  return workflowsStarted;
}
