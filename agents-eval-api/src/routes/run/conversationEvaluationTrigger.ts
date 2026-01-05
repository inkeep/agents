import {
  commonGetErrorResponses,
  createApiError,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { start } from 'workflow/api';
import { getLogger } from '../../logger';
import { evaluateConversationWorkflow } from '../../workflow';

const app = new OpenAPIHono();
const logger = getLogger('conversationEvaluationTrigger');

const TriggerConversationEvaluationSchema = z.object({
  conversationId: z.string(),
  evaluatorIds: z.array(z.string()),
  evaluationRunId: z.string(),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/trigger',
    summary: 'Trigger Conversation Evaluation via HTTP',
    operationId: 'trigger-conversation-evaluation-http',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerConversationEvaluationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation triggered successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      logger.info(
        {
          tenantId,
          projectId,
          conversationId: body.conversationId,
          evaluatorIds: body.evaluatorIds,
          evaluationRunId: body.evaluationRunId,
        },
        'Triggering conversation evaluation via HTTP endpoint'
      );

      // Start the evaluation workflow
      const payload = {
        tenantId,
        projectId,
        conversationId: body.conversationId,
        evaluatorIds: body.evaluatorIds,
        evaluationRunId: body.evaluationRunId,
      };
      await start(evaluateConversationWorkflow, [payload]);

      return c.json({
        success: true,
        message: 'Evaluation triggered successfully',
      }) as any;
    } catch (error: any) {
      logger.error(
        {
          error,
          tenantId,
          projectId,
          conversationId: body.conversationId,
        },
        'Failed to trigger conversation evaluation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: error?.message || 'Failed to trigger evaluation',
        }),
        500
      );
    }
  }
);

export default app;
