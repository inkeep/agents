import {
  advanceScheduledTriggerNextRunAt,
  type DueScheduledTrigger,
  findDueScheduledTriggersAcrossProjects,
  getProjectMainResolvedRef,
  listAllProjectsMetadata,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient, manageDbPool, runDbClient } from 'src/data/db';
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

  const projects = await listAllProjectsMetadata(runDbClient)();

  if (projects.length === 0) {
    return { dispatched: 0 };
  }

  const dueTriggers = await findDueScheduledTriggersAcrossProjects(manageDbClient)({
    projects: projects.map((p) => ({ tenantId: p.tenantId, projectId: p.id })),
    asOf: now.toISOString(),
  });

  if (dueTriggers.length === 0) {
    return { dispatched: 0 };
  }

  logger.info({ dueCount: dueTriggers.length }, 'Found due triggers');

  const results = await Promise.allSettled(
    dueTriggers.map((trigger) => dispatchSingleTrigger(trigger))
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
  trigger: DueScheduledTrigger
): Promise<'dispatched' | 'skipped'> {
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
  };

  await start(scheduledTriggerRunnerWorkflow, [payload]);

  const resolvedRef = await getProjectMainResolvedRef(manageDbClient)(tenantId, projectId);

  try {
    await withRef(
      manageDbPool,
      resolvedRef,
      (db) =>
        advanceScheduledTriggerNextRunAt(db)({
          scopes: { tenantId, projectId, agentId },
          scheduledTriggerId,
          nextRunAt,
          enabled: isOneTime ? false : undefined,
        }),
      { commit: true, commitMessage: `Advance next_run_at for trigger ${scheduledTriggerId}` }
    );
  } catch (err) {
    logger.error(
      { scheduledTriggerId, err },
      'Failed to advance next_run_at after workflow start; next tick will retry (idempotent)'
    );
  }

  logger.info({ scheduledTriggerId, scheduledFor: trigger.nextRunAt }, 'Trigger dispatched');

  return 'dispatched';
}
