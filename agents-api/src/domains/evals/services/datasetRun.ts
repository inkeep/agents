import type { DatasetRunItem } from '@inkeep/agents-core';
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

  let queued = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await markScheduledTriggerInvocationRunning(runDbClient)({
        scopes: { tenantId, projectId, agentId: item.agentId },
        scheduledTriggerId: datasetRunId,
        invocationId: item.scheduledTriggerInvocationId,
      });

      const payload = {
        tenantId,
        projectId,
        agentId: item.agentId,
        datasetItemId: item.id ?? '',
        datasetItemInput: item.input,
        datasetItemExpectedOutput: item.expectedOutput,
        datasetItemSimulationAgent: item.simulationAgent as any,
        datasetRunId,
        scheduledTriggerInvocationId: item.scheduledTriggerInvocationId,
        evaluatorIds,
        evaluationRunId,
      };

      await start(runDatasetItemWorkflow, [payload]);
      queued++;
    } catch (err) {
      logger.error(
        { err, datasetItemId: item.id, agentId: item.agentId },
        'Failed to queue dataset item workflow'
      );
      await markScheduledTriggerInvocationFailed(runDbClient)({
        scopes: { tenantId, projectId, agentId: item.agentId },
        scheduledTriggerId: datasetRunId,
        invocationId: item.scheduledTriggerInvocationId,
      }).catch(() => {});
      failed++;
    }
  }

  return { queued, failed };
}
