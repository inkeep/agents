import { getLogger } from '../../../logger';
import type { DatasetRunItem } from '@inkeep/agents-core';
import { runDatasetItemWorkflow } from '../workflow/functions/runDatasetItem';
import { start } from 'workflow/api';

export async function queueDatasetRunItems(params: {
  tenantId: string;
  projectId: string;
  datasetRunId: string;
  items: DatasetRunItem[];
  evaluatorIds?: string[];
  evaluationRunId?: string;
}): Promise<{ queued: number; failed: number }> {
  const { tenantId, projectId, datasetRunId, items, evaluatorIds, evaluationRunId } = params;
  const logger = getLogger('workflow-triggers');

  let queued = 0;
  let failed = 0;

  for (const item of items) {
    const payload = {
      tenantId,
      projectId,
      agentId: item.agentId,
      datasetItemId: item.id ?? '',
      datasetItemInput: item.input,
      datasetItemExpectedOutput: item.expectedOutput,
      datasetItemSimulationAgent: item.simulationAgent as any,
      datasetRunId,
      evaluatorIds,
      evaluationRunId,
    };

    try {
      await start(runDatasetItemWorkflow, [payload]);
      queued++;
    } catch (err) {
      logger.error(
        { err, datasetItemId: item.id, agentId: item.agentId },
        'Failed to queue dataset item workflow'
      );
      failed++;
    }
  }

  return { queued, failed };
}
