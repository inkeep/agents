import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationRun,
  generateId,
  getConversation,
  getEvaluatorById,
  InternalServices,
  ManagementApiClient,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { start } from 'workflow/api';
import runDbClient from '../../data/db/runDbClient';
import { getLogger } from '../../logger';
import { evaluateConversationWorkflow } from '../../workflow';
import { env } from '../../env';

const app = new OpenAPIHono();
const logger = getLogger('triggerConversationEvaluation');

app.openapi(
  createRoute({
    method: 'post',
    path: '/conversations/evaluate',
    summary: 'Trigger Evaluation on Conversations',
    operationId: 'trigger-conversation-evaluation',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              conversationIds: z.array(z.string()).min(1, 'At least one conversation is required'),
              evaluatorIds: z.array(z.string()).min(1, 'At least one evaluator is required'),
            }),
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Evaluations triggered',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
              evaluationRunId: z.string(),
              conversationIds: z.array(z.string()),
              evaluatorIds: z.array(z.string()),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { conversationIds, evaluatorIds } = c.req.valid('json');

    try {
      // Verify all conversations exist
      const conversations = await Promise.all(
        conversationIds.map((conversationId) =>
          getConversation(runDbClient)({
            scopes: { tenantId, projectId },
            conversationId,
          })
        )
      );

      const missingConversations = conversationIds.filter((id, index) => !conversations[index]);
      if (missingConversations.length > 0) {
        return c.json(
          createApiError({
            code: 'not_found',
            message: `Conversations not found: ${missingConversations.join(', ')}`,
          }),
          404
        ) as any;
      }

      const client = new ManagementApiClient({
        apiUrl: env.INKEEP_AGENTS_MANAGE_API_URL,
        tenantId,
        projectId,
        auth: { mode: 'internalService', internalServiceName: InternalServices.EVALUATION_API },
      }); 

      // Verify all evaluators exist
      const evaluators = await client.getEvaluatorsByIds(evaluatorIds);

      const missingEvaluators = evaluatorIds.filter((id, index) => !evaluators[index]);
      if (missingEvaluators.length > 0) {
        return c.json(
          createApiError({
            code: 'not_found',
            message: `Evaluators not found: ${missingEvaluators.join(', ')}`,
          }),
          404
        ) as any;
      }

      // Create evaluation run
      const evaluationRunId = generateId();
      await createEvaluationRun(runDbClient)({
        id: evaluationRunId,
        tenantId,
        projectId,
      });

      // Trigger evaluations via Workflow
      await Promise.all(
        conversationIds.map((conversationId) =>
          start(evaluateConversationWorkflow, [{
            tenantId,
            projectId,
            conversationId,
            evaluatorIds,
            evaluationRunId,
          }])
        )
      );

      logger.info(
        { tenantId, projectId, conversationIds, evaluatorIds, evaluationRunId },
        'Conversation evaluations triggered'
      );

      return c.json(
        {
          message: 'Evaluations triggered successfully',
          evaluationRunId,
          conversationIds,
          evaluatorIds,
        },
        202
      ) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, conversationIds },
        'Failed to trigger conversation evaluations'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to trigger evaluations',
        }),
        500
      );
    }
  }
);

export default app;
