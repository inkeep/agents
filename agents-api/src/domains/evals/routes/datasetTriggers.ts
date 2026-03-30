import { OpenAPIHono, z } from '@hono/zod-openapi';
import { TenantProjectParamsSchema, TriggerDatasetRunSchema } from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../logger';
import { evalApiKeyAuth } from '../../../middleware/evalsAuth';
import { queueDatasetRunItems } from '../services/datasetRun';

const app = new OpenAPIHono();
const logger = getLogger('workflow-triggers');

// =============================================================================
// Trigger Dataset Run Workflow
// =============================================================================

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/run-dataset-items',
    summary: 'Run dataset items',
    description: 'Runs dataset items for processing through the chat API',
    operationId: 'run-dataset-items',
    tags: ['Workflows'],
    permission: evalApiKeyAuth(),
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

    logger.info(
      { tenantId, projectId, datasetRunId, itemCount: items.length },
      'Triggering dataset run workflow'
    );

    const { queued, failed } = await queueDatasetRunItems({
      tenantId,
      projectId,
      datasetRunId,
      items,
      evaluatorIds,
      evaluationRunId,
    });

    logger.info(
      { tenantId, projectId, datasetRunId, queued, failed },
      'Dataset run workflow trigger complete'
    );

    return c.json({ queued, failed, datasetRunId }, 202);
  }
);

export default app;
