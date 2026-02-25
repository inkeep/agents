import type { DatasetItemInput, DatasetRunItem } from '@inkeep/agents-core';
import {
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { runDatasetItemWorkflow } from '../workflow/functions/runDatasetItem';

export type DatasetRunQueueItem = DatasetRunItem & { scheduledTriggerInvocationId: string };

export async function queueDatasetRunItems(params: {
  tenantId: string;
  projectId: string;
  datasetRunId: string;
  items: DatasetRunQueueItem[];
  evaluatorIds?: string[];
  evaluationRunId?: string;
}): Promise<{ queued: number; failed: number }> {
  const { tenantId, projectId, datasetRunId, items, evaluatorIds, evaluationRunId } = params;
  const logger = getLogger('workflow-triggers');

  const results = await Promise.allSettled(
    items.map(async (item) => {
      await markScheduledTriggerInvocationRunning(runDbClient)({
        scopes: { tenantId, projectId, agentId: item.agentId },
        scheduledTriggerId: datasetRunId,
        invocationId: item.scheduledTriggerInvocationId,
      });

      await start(runDatasetItemWorkflow, [
        {
          tenantId,
          projectId,
          agentId: item.agentId,
          datasetItemId: item.id ?? '',
          datasetItemInput: item.input as DatasetItemInput,
          datasetItemExpectedOutput: item.expectedOutput,
          datasetItemSimulationAgent: item.simulationAgent as any,
          datasetRunId,
          scheduledTriggerInvocationId: item.scheduledTriggerInvocationId,
          evaluatorIds,
          evaluationRunId,
        },
      ]);
    })
  );

  const failures = results
    .map((r, i) => (r.status === 'rejected' ? { item: items[i], reason: r.reason } : null))
    .filter((f): f is NonNullable<typeof f> => f !== null);

  await Promise.all(
    failures.map(({ item, reason }) => {
      logger.error({ err: reason, datasetItemId: item.id, agentId: item.agentId }, 'Failed to queue dataset item workflow');
      return markScheduledTriggerInvocationFailed(runDbClient)({
        scopes: { tenantId, projectId, agentId: item.agentId },
        scheduledTriggerId: datasetRunId,
        invocationId: item.scheduledTriggerInvocationId,
      }).catch(() => {});
    })
  );

  return { queued: results.length - failures.length, failed: failures.length };
}
