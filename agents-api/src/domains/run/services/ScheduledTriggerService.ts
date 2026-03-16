/**
 * Service for managing scheduled trigger lifecycle side effects.
 *
 * With the manage-table approach, next_run_at is set directly on the
 * scheduled_triggers table in the manage DB. This service only handles
 * cancellation of stale invocations when triggers are re-enabled or rescheduled.
 */

import {
  cancelPastPendingInvocationsForTrigger,
  cancelPendingInvocationsForTrigger,
  type ScheduledTrigger,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('ScheduledTriggerService');

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

  if (!previousEnabled && trigger.enabled) {
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
        'Cancelled past pending invocations on trigger re-enable'
      );
    }
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
        'Cancelled pending invocations on schedule change'
      );
    }
  }
}
