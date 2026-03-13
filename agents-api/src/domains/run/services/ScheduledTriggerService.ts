/**
 * Service for managing scheduled trigger lifecycle.
 *
 * Handles syncing trigger schedule state to the runtime `trigger_schedules` table
 * when scheduled triggers are created, updated, or deleted in the manage DB.
 * The scheduler workflow + dispatcher reads from this table to dispatch one-shot workflows.
 */

import {
  cancelPastPendingInvocationsForTrigger,
  cancelPendingInvocationsForTrigger,
  deleteTriggerSchedule,
  type ScheduledTrigger,
  updateTriggerScheduleEnabled,
  upsertTriggerSchedule,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { computeNextRunAt } from './computeNextRunAt';

const logger = getLogger('ScheduledTriggerService');

function syncTriggerToScheduleTable(trigger: ScheduledTrigger) {
  const nextRunAt = trigger.enabled
    ? computeNextRunAt({
        cronExpression: trigger.cronExpression,
        cronTimezone: trigger.cronTimezone,
        runAt: trigger.runAt,
      })
    : null;

  return upsertTriggerSchedule(runDbClient)({
    tenantId: trigger.tenantId,
    projectId: trigger.projectId,
    agentId: trigger.agentId,
    scheduledTriggerId: trigger.id,
    cronExpression: trigger.cronExpression,
    cronTimezone: trigger.cronTimezone,
    runAt: trigger.runAt,
    enabled: trigger.enabled,
    nextRunAt,
  });
}

export async function onTriggerCreated(trigger: ScheduledTrigger): Promise<void> {
  logger.info(
    { scheduledTriggerId: trigger.id, enabled: trigger.enabled },
    'Syncing new trigger to schedule table',
  );

  await syncTriggerToScheduleTable(trigger);
}

/**
 * Handle trigger update - restart workflow if needed.
 */
export async function onTriggerUpdated(params: {
  trigger: ScheduledTrigger;
  previousEnabled: boolean;
  scheduleChanged: boolean;
}): Promise<void> {
  const { trigger, previousEnabled, scheduleChanged } = params;

  // Case 1: Disabled -> still disabled = no action
  if (!previousEnabled && !trigger.enabled) {
    return;
  }

  // Case 2: Enabled -> disabled = signal workflow to stop
  // (past invocations will be cleaned up when re-enabled)
  if (previousEnabled && !trigger.enabled) {
    await updateTriggerScheduleEnabled(runDbClient)({
      tenantId: trigger.tenantId,
      scheduledTriggerId: trigger.id,
      enabled: false,
    });
    return;
  }

  // Case 3: Disabled -> enabled = cancel past pending invocations and start workflow
  if (!previousEnabled && trigger.enabled) {
    // Cancel any pending invocations that are now in the past
    const cancelledCount = await cancelPastPendingInvocationsForTrigger(runDbClient)({
      scopes: {
        tenantId: trigger.tenantId,
        projectId: trigger.projectId,
        agentId: trigger.agentId,
      },
      scheduledTriggerId: trigger.id,
    });

    if (cancelledCount > 0) {
      logger.info(
        { scheduledTriggerId: trigger.id, cancelledCount },
        'Cancelled past pending invocations on trigger re-enable',
      );
    }

    await syncTriggerToScheduleTable(trigger);
    return;
  }

  // Case 4: Still enabled but schedule changed = cancel pending and restart workflow
  if (scheduleChanged) {
    const cancelledCount = await cancelPendingInvocationsForTrigger(runDbClient)({
      scopes: {
        tenantId: trigger.tenantId,
        projectId: trigger.projectId,
        agentId: trigger.agentId,
      },
      scheduledTriggerId: trigger.id,
    });

    if (cancelledCount > 0) {
      logger.info(
        { scheduledTriggerId: trigger.id, cancelledCount },
        'Cancelled pending invocations on schedule change',
      );
    }

    await syncTriggerToScheduleTable(trigger);
  }
}

/**
 * Handle trigger deletion - signal workflow to stop.
 * The workflow will be automatically deleted via cascade when the trigger is deleted.
 */
export async function onTriggerDeleted(trigger: ScheduledTrigger): Promise<void> {
  logger.info(
    { scheduledTriggerId: trigger.id },
    'Removing trigger from schedule table',
  );

  await deleteTriggerSchedule(runDbClient)({
    tenantId: trigger.tenantId,
    scheduledTriggerId: trigger.id,
  });
}
