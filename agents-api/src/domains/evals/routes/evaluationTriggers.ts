import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationRun,
  generateId,
  getConversation,
  getEvaluationSuiteConfigById,
  getEvaluationSuiteConfigEvaluatorRelations,
  getEvaluatorsByIds,
  listEvaluationRunConfigsWithSuiteConfigs,
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
    const body = c.req.valid('json');
    const resolvedRef = c.get('resolvedRef');

    const { conversationId } = body;

    try {
      logger.info({ tenantId, projectId, conversationId }, 'Triggering conversation evaluation');

      // Get the conversation
      const conversation = await getConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        logger.warn({ conversationId }, 'Conversation not found');
        return c.json(
          createApiError({
            code: 'not_found',
            message: 'Conversation not found',
          }),
          404
        ) as any;
      }

      // Get all active evaluation run configs
      // const allRunConfigs = await client.listEvaluationRunConfigs();
      const configs = await withRef(manageDbPool, resolvedRef, (db) =>
        listEvaluationRunConfigsWithSuiteConfigs(db)({
          scopes: { tenantId, projectId },
        })
      );

      const runConfigs = configs.filter((config) => config.isActive);

      if (runConfigs.length === 0) {
        logger.debug({ tenantId, projectId }, 'No active evaluation run configs found');
        return c.json({
          success: true,
          message: 'No active evaluation run configs',
          evaluationsTriggered: 0,
        });
      }

      let evaluationsTriggered = 0;

      for (const runConfig of runConfigs) {
        // Check if run config matches conversation (using filters)
        // For now, we match all - can add filter logic later if needed

        for (const suiteConfigId of runConfig.suiteConfigIds) {
          const suiteConfig = await withRef(manageDbPool, resolvedRef, (db) =>
            getEvaluationSuiteConfigById(db)({
              scopes: { tenantId, projectId, evaluationSuiteConfigId: suiteConfigId },
            })
          );

          if (!suiteConfig) {
            logger.warn({ suiteConfigId }, 'Suite config not found, skipping');
            continue;
          }

          // Apply sample rate check
          if (suiteConfig.sampleRate !== null && suiteConfig.sampleRate !== undefined) {
            const random = Math.random();
            if (random > suiteConfig.sampleRate) {
              logger.info(
                {
                  suiteConfigId: suiteConfig.id,
                  sampleRate: suiteConfig.sampleRate,
                  random,
                  conversationId,
                },
                'Conversation filtered out by sample rate'
              );
              continue;
            }
          }

          // Get evaluators for this suite config
          const evaluatorRelations = await withRef(manageDbPool, resolvedRef, (db) =>
            getEvaluationSuiteConfigEvaluatorRelations(db)({
              scopes: { tenantId, projectId, evaluationSuiteConfigId: suiteConfigId },
            })
          );

          const evaluatorIds = evaluatorRelations.map((r) => r.evaluatorId);

          if (evaluatorIds.length === 0) continue;

          // Create evaluation run
          const evaluationRunId = generateId();
          await createEvaluationRun(runDbClient)({
            id: evaluationRunId,
            tenantId,
            projectId,
            evaluationRunConfigId: runConfig.id,
          });

          logger.info(
            {
              conversationId,
              runConfigId: runConfig.id,
              evaluationRunId,
              evaluatorCount: evaluatorIds.length,
              sampleRate: suiteConfig.sampleRate,
            },
            'Created evaluation run, starting workflow'
          );

          // Start the evaluation workflow
          await start(evaluateConversationWorkflow, [
            {
              tenantId,
              projectId,
              conversationId,
              evaluatorIds,
              evaluationRunId,
            },
          ]);

          evaluationsTriggered++;
        }
      }

      return c.json({
        success: true,
        message:
          evaluationsTriggered > 0
            ? `Triggered ${evaluationsTriggered} evaluation(s)`
            : 'No evaluations matched (filtered by sample rate or no evaluators)',
        evaluationsTriggered,
      });
    } catch (error: any) {
      logger.error(
        {
          error,
          errorStack: error?.stack,
          tenantId,
          projectId,
          conversationId,
        },
        'Failed to trigger conversation evaluation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: error?.message || 'Failed to trigger evaluation',
        }),
        500
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
          start(evaluateConversationWorkflow, [
            {
              tenantId,
              projectId,
              conversationId,
              evaluatorIds,
              evaluationRunId,
            },
          ])
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
