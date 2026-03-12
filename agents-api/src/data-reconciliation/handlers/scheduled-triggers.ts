import type { ScheduledTriggerAuditResult } from '@inkeep/agents-core';
import {
  defineHandlers,
  listEnabledScheduledTriggers,
  listScheduledWorkflowsByProject,
} from '@inkeep/agents-core';
import {
  onTriggerCreated,
  onTriggerDeleted,
  onTriggerUpdated,
} from '../../domains/run/services/ScheduledTriggerService';
import { world } from '../../workflow/world';

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
    const [enabledTriggers, workflows] = await Promise.all([
      listEnabledScheduledTriggers(ctx.manageDb)({ scopes: ctx.scopes }),
      listScheduledWorkflowsByProject(ctx.manageDb)({ scopes: ctx.scopes }),
    ]);

    const enabledTriggerIds = new Set(enabledTriggers.map((t) => t.id));
    const enabledTriggerMap = new Map(enabledTriggers.map((t) => [t.id, t]));
    const workflowsByTriggerId = new Map(workflows.map((w) => [w.scheduledTriggerId, w]));

    const missingWorkflows = enabledTriggers
      .filter((t) => !workflowsByTriggerId.has(t.id))
      .map((t) => ({ triggerId: t.id, triggerName: t.name }));

    const orphanedWorkflows = workflows
      .filter((w) => !enabledTriggerIds.has(w.scheduledTriggerId))
      .map((w) => ({
        workflowRunId: w.workflowRunId ?? w.id,
        scheduledTriggerId: w.scheduledTriggerId,
      }));

    const staleWorkflows = enabledTriggers
      .filter((t) => {
        const wf = workflowsByTriggerId.get(t.id);
        return wf && !wf.workflowRunId;
      })
      .map((t) => ({
        triggerId: t.id,
        triggerName: t.name,
        workflowId: workflowsByTriggerId.get(t.id)!.id,
      }));

    const deadWorkflows: ScheduledTriggerAuditResult['deadWorkflows'] = [];
    const verificationFailures: ScheduledTriggerAuditResult['verificationFailures'] = [];

    const workflowsToVerify = workflows.filter(
      (w) => w.workflowRunId && enabledTriggerIds.has(w.scheduledTriggerId)
    );

    const verificationResults = await Promise.allSettled(
      workflowsToVerify.map(async (w) => {
        const run = await world.runs.get(w.workflowRunId!);
        return { workflow: w, run };
      })
    );

    for (let i = 0; i < verificationResults.length; i++) {
      const result = verificationResults[i];
      const wf = workflowsToVerify[i];
      const trigger = enabledTriggerMap.get(wf.scheduledTriggerId);

      if (result.status === 'rejected') {
        verificationFailures.push({
          workflowRunId: wf.workflowRunId!,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        continue;
      }

      const { run } = result.value;
      if (
        !run ||
        run.status === 'failed' ||
        run.status === 'cancelled' ||
        run.status === 'completed'
      ) {
        deadWorkflows.push({
          triggerId: wf.scheduledTriggerId,
          triggerName: trigger?.name ?? wf.scheduledTriggerId,
          workflowRunId: wf.workflowRunId!,
          runStatus: run?.status ?? 'not_found',
        });
      }
    }

    return {
      missingWorkflows,
      orphanedWorkflows,
      staleWorkflows,
      deadWorkflows,
      verificationFailures,
    };
  },
});
