import type { DatasetRunItem } from '@inkeep/agents-core';
import { updateDatasetRunInvocationStatus } from '@inkeep/agents-core';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { runDatasetItemWorkflow } from '../workflow/functions/runDatasetItem';

export type DatasetRunQueueItem = DatasetRunItem & { invocationId: string };

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
      await updateDatasetRunInvocationStatus(runDbClient)({
        scopes: { tenantId, projectId, invocationId: item.invocationId },
        data: { status: 'running', startedAt: new Date().toISOString() },
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
        invocationId: item.invocationId,
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
      await updateDatasetRunInvocationStatus(runDbClient)({
        scopes: { tenantId, projectId, invocationId: item.invocationId },
        data: { status: 'failed', completedAt: new Date().toISOString() },
      }).catch(() => {});
      failed++;
    }
  }

  return { queued, failed };
}
