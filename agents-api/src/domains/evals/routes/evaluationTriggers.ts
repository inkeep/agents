import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationRun,
  generateId,
  getAgentIdsForEvaluators,
  getConversation,
  getEvaluatorsByIds,
  type ResolvedRef,
  TenantProjectParamsSchema,
  TriggerEvaluationJobSchema,
  withRef,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { start } from 'workflow/api';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { evalApiKeyAuth } from '../../../middleware/evalsAuth';
import { triggerConversationEvaluation } from '../services/conversationEvaluation';
import { queueEvaluationJobConversations } from '../services/evaluationJob';
import { evaluateConversationWorkflow } from '../workflow';

const app = new OpenAPIHono<{ Variables: { resolvedRef: ResolvedRef } }>();
const logger = getLogger('ConversationEvaluations');

const TriggerConversationSchema = z.object({
  conversationId: z.string(),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/evaluate-conversation',
    summary: 'Trigger evaluation on a single conversation',
    operationId: 'evaluate-conversation',
    tags: ['Evaluations'],
    permission: evalApiKeyAuth(),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerConversationSchema,
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
              evaluationsTriggered: z.number(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { conversationId } = c.req.valid('json');
    const resolvedRef = c.get('resolvedRef');

    try {
      const result = await triggerConversationEvaluation({
        tenantId,
        projectId,
        conversationId,
        resolvedRef,
      });

      return c.json(result);
    } catch (error: any) {
      const message = error?.message || 'Failed to trigger evaluation';
      const isNotFound = message.includes('Conversation not found');

      return c.json(
        createApiError({
          code: isNotFound ? 'not_found' : 'internal_server_error',
          message,
        }),
        isNotFound ? 404 : 500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/evaluate-conversations',
    summary: 'Trigger evaluations on conversations with specified evaluators',
    operationId: 'start-conversations-evaluations',
    tags: ['Evaluations'],
    permission: evalApiKeyAuth(),
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
    const resolvedRef = c.get('resolvedRef');

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

      const missingConversations = conversationIds.filter((_id, index) => !conversations[index]);
      if (missingConversations.length > 0) {
        return c.json(
          createApiError({
            code: 'not_found',
            message: `Conversations not found: ${missingConversations.join(', ')}`,
          }),
          404
        ) as any;
      }

      // Verify all evaluators exist
      const evaluators = await withRef(manageDbPool, resolvedRef, (db) =>
        getEvaluatorsByIds(db)({
          scopes: { tenantId, projectId },
          evaluatorIds,
        })
      );

      const missingEvaluators = evaluatorIds.filter((_id, index) => !evaluators[index]);
      if (missingEvaluators.length > 0) {
        return c.json(
          createApiError({
            code: 'not_found',
            message: `Evaluators not found: ${missingEvaluators.join(', ')}`,
          }),
          404
        ) as any;
      }

      const agentIdsMap = await withRef(manageDbPool, resolvedRef, (db) =>
        getAgentIdsForEvaluators(db)({
          scopes: { tenantId, projectId },
          evaluatorIds,
        })
      );

      const evaluationRunId = generateId();
      await createEvaluationRun(runDbClient)({
        id: evaluationRunId,
        tenantId,
        projectId,
        ref: resolvedRef,
      });

      const triggeredConversationIds: string[] = [];

      const workflowPromises: Promise<unknown>[] = [];
      for (let i = 0; i < conversations.length; i++) {
        const conversation = conversations[i];
        if (!conversation) continue;
        const conversationId = conversationIds[i];
        const { agentId } = conversation;
        const scopedEvaluatorIds = agentId
          ? evaluatorIds.filter((evalId) => {
              const scopedAgents = agentIdsMap.get(evalId);
              if (!scopedAgents || scopedAgents.length === 0) return true;
              return scopedAgents.includes(agentId);
            })
          : evaluatorIds;

        if (scopedEvaluatorIds.length === 0) {
          logger.info(
            { conversationId, agentId },
            'All evaluators filtered out by agent scoping for conversation'
          );
          continue;
        }

        triggeredConversationIds.push(conversationId);
        workflowPromises.push(
          start(evaluateConversationWorkflow, [
            {
              tenantId,
              projectId,
              conversationId,
              evaluatorIds: scopedEvaluatorIds,
              evaluationRunId,
            },
          ])
        );
      }
      await Promise.all(workflowPromises);

      logger.info(
        {
          tenantId,
          projectId,
          conversationIds: triggeredConversationIds,
          evaluatorIds,
          evaluationRunId,
        },
        'Conversation evaluations triggered'
      );

      return c.json(
        {
          message: 'Evaluations triggered successfully',
          evaluationRunId,
          conversationIds: triggeredConversationIds,
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

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/evaluate-conversations-by-job',
    summary: 'Trigger evaluations on conversations by evaluation job config',
    permission: evalApiKeyAuth(),
    description:
      'Filters conversations based on job filters, creates an evaluation run, and enqueues workflows',
    operationId: 'evaluate-conversations-by-job',
    tags: ['Workflows'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerEvaluationJobSchema,
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Evaluation job triggered successfully',
        content: {
          'application/json': {
            schema: z.object({
              queued: z.number(),
              failed: z.number(),
              evaluationRunId: z.string(),
              conversationCount: z.number(),
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
    const { evaluationJobConfigId, evaluatorIds, jobFilters } = c.req.valid('json');

    logger.info(
      { tenantId, projectId, evaluationJobConfigId, evaluatorCount: evaluatorIds.length },
      'Triggering evaluation job'
    );

    try {
      const { conversationCount, queued, failed, evaluationRunId } =
        await queueEvaluationJobConversations({
          tenantId,
          projectId,
          evaluationJobConfigId,
          evaluatorIds,
          jobFilters,
          resolvedRef: c.get('resolvedRef'),
        });

      logger.info(
        {
          tenantId,
          projectId,
          evaluationJobConfigId,
          evaluationRunId,
          conversationCount,
          queued,
          failed,
        },
        'Evaluation job triggered successfully'
      );

      return c.json(
        {
          queued,
          failed,
          evaluationRunId,
          conversationCount,
        },
        202
      );
    } catch (err) {
      logger.error(
        { err, tenantId, projectId, evaluationJobConfigId },
        'Failed to trigger evaluation job'
      );
      return c.json(
        { error: 'Failed to trigger evaluation job', message: (err as Error).message },
        500
      );
    }
  }
);

export default app;
