import type { ScheduledTriggerAuditResult } from '@inkeep/agents-core';
import { defineHandlers } from '@inkeep/agents-core';
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
  check: async (): Promise<ScheduledTriggerAuditResult> => {
    return {
      missingWorkflows: [],
      orphanedWorkflows: [],
      staleWorkflows: [],
      deadWorkflows: [],
      verificationFailures: [],
    };
  },
});
