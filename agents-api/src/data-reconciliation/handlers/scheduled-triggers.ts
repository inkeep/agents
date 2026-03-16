import type { ScheduledTriggerAuditResult } from '@inkeep/agents-core';
import { defineHandlers, listEnabledScheduledTriggers } from '@inkeep/agents-core';
import { onTriggerUpdated } from '../../domains/run/services/ScheduledTriggerService';

export const scheduledTriggersHandlers = defineHandlers('scheduled_triggers', {
  onUpdated: async (before, after) => {
    const scheduleChanged =
      before.cronExpression !== after.cronExpression ||
      String(before.runAt) !== String(after.runAt);
    await onTriggerUpdated({
      trigger: after,
      previousEnabled: before.enabled,
      scheduleChanged,
    });
  },
  check: async (ctx): Promise<ScheduledTriggerAuditResult> => {
    const enabledTriggers = await listEnabledScheduledTriggers(ctx.manageDb)({
      scopes: ctx.scopes,
    });

    const missingWorkflows = enabledTriggers
      .filter((t) => !t.nextRunAt)
      .map((t) => ({ triggerId: t.id, triggerName: t.name }));

    return { missingWorkflows };
  },
});
