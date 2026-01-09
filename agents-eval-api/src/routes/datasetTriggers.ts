import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { TenantProjectParamsSchema, TriggerDatasetRunSchema } from '@inkeep/agents-core';
import { start } from 'workflow/api';
import { getLogger } from '../logger';
import { runDatasetItemWorkflow } from '../workflow/functions/runDatasetItem';

const app = new OpenAPIHono();
const logger = getLogger('workflow-triggers');

// =============================================================================
// Trigger Dataset Run Workflow
// =============================================================================

app.openapi(
  createRoute({
    method: 'post',
    path: '/run-dataset-items',
    summary: 'Run dataset items',
    description: 'Runs dataset items for processing through the chat API',
    operationId: 'run-dataset-items',
    tags: ['Workflows'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerDatasetRunSchema,
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Workflows queued successfully',
        content: {
          'application/json': {
            schema: z.object({
              queued: z.number(),
              failed: z.number(),
              datasetRunId: z.string(),
            }),
          },
        },
      },
      400: { description: 'Invalid request' },
      500: { description: 'Internal server error' },
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { datasetRunId, items, evaluatorIds, evaluationRunId } = c.req.valid('json');

    let queued = 0;
    let failed = 0;

    logger.info(
      { tenantId, projectId, datasetRunId, itemCount: items.length },
      'Triggering dataset run workflow'
    );

    // Process items sequentially to avoid TransactionConflict in Vercel Queue
    for (const item of items) {
      const payload = {
        tenantId,
        projectId,
        agentId: item.agentId,
        datasetItemId: item.id ?? '',
        datasetItemInput: item.input,
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

    logger.info(
      { tenantId, projectId, datasetRunId, queued, failed },
      'Dataset run workflow trigger complete'
    );

    return c.json({ queued, failed, datasetRunId }, 202);
  }
);

export default app;
