import type { ScheduledTriggerAuditResult } from '@inkeep/agents-core';
import {
  defineHandlers,
  listEnabledScheduledTriggers,
  listTriggerSchedulesByProject,
} from '@inkeep/agents-core';
import {
  onTriggerCreated,
  onTriggerDeleted,
  onTriggerUpdated,
} from '../../domains/run/services/ScheduledTriggerService';

export const scheduledTriggersHandlers = defineHandlers('scheduled_triggers', {
  onCreated: async (after) => {
    await onTriggerCreated(after);
  },
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
  onDeleted: async (before) => {
    await onTriggerDeleted(before);
  },
  check: async (ctx): Promise<ScheduledTriggerAuditResult> => {
    const [enabledTriggers, schedules] = await Promise.all([
      listEnabledScheduledTriggers(ctx.manageDb)({ scopes: ctx.scopes }),
      listTriggerSchedulesByProject(ctx.runDb)({ scopes: ctx.scopes }),
    ]);

    const scheduleMap = new Map(schedules.map((s) => [s.scheduledTriggerId, s]));
    const enabledTriggerIds = new Set(enabledTriggers.map((t) => t.id));

    const missingWorkflows = enabledTriggers
      .filter((t) => !scheduleMap.has(t.id))
      .map((t) => ({ triggerId: t.id, triggerName: t.name }));

    const orphanedWorkflows = schedules
      .filter((s) => s.enabled && !enabledTriggerIds.has(s.scheduledTriggerId))
      .map((s) => ({
        workflowRunId: s.scheduledTriggerId,
        scheduledTriggerId: s.scheduledTriggerId,
      }));

    return {
      missingWorkflows,
      orphanedWorkflows,
      staleWorkflows: [],
      deadWorkflows: [],
      verificationFailures: [],
    };
  },
});
