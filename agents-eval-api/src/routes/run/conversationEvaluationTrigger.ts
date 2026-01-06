import {
  commonGetErrorResponses,
  createEvaluationRun,
  getConversation,
  createApiError,
  TenantProjectParamsSchema,
  listEvaluationRunConfigs,
  getEvaluationSuiteConfigById,
  getEvaluationSuiteConfigEvaluatorRelations,
  getEvaluationRunConfigEvaluationSuiteConfigRelations,
  generateId,
} from '@inkeep/agents-core';
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { start } from 'workflow/api';
import { getLogger } from '../../logger';
import { evaluateConversationWorkflow } from '../../workflow';
import runDbClient from '../../data/db/runDbClient';
import manageDbClient from '../../data/db/manageDbClient';

const app = new OpenAPIHono();
const logger = getLogger('conversationEvaluationTrigger');

const TriggerConversationSchema = z.object({
  conversationId: z.string(),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/trigger-conversation',
    summary: 'Trigger Conversation Evaluation via HTTP',
    operationId: 'trigger-conversation-evaluation-http',
    tags: ['Evaluations'],
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

    const { conversationId } = body;  

    try {
      logger.info(
        { tenantId, projectId, conversationId },
        'Triggering conversation evaluation (eval-api handling all logic)'
      );

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
      const allRunConfigs = await listEvaluationRunConfigs(manageDbClient)({
        scopes: { tenantId, projectId },
      });
      const runConfigs = allRunConfigs.filter((config) => config.isActive);

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
        
        // Get suite configs linked to this run config
        const suiteRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(manageDbClient)({
          scopes: { tenantId, projectId, evaluationRunConfigId: runConfig.id },
        });

        for (const suiteRelation of suiteRelations) {
          const suiteConfig = await getEvaluationSuiteConfigById(manageDbClient)({
            scopes: {
              tenantId,
              projectId,
              evaluationSuiteConfigId: suiteRelation.evaluationSuiteConfigId,
            },
          });

          if (!suiteConfig) {
            logger.warn(
              { suiteConfigId: suiteRelation.evaluationSuiteConfigId },
              'Suite config not found, skipping'
            );
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
          const evaluatorRelations = await getEvaluationSuiteConfigEvaluatorRelations(manageDbClient)({
            scopes: {
              tenantId,
              projectId,
              evaluationSuiteConfigId: suiteRelation.evaluationSuiteConfigId,
            },
          });

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
          await start(evaluateConversationWorkflow, [{
            tenantId,
            projectId,
            conversationId,
            evaluatorIds,
            evaluationRunId,
          }]);

          evaluationsTriggered++;
        }
      }

      return c.json({
        success: true,
        message: evaluationsTriggered > 0 
          ? `Triggered ${evaluationsTriggered} evaluation(s)` 
          : 'No evaluations matched (filtered by sample rate or no evaluators)',
        evaluationsTriggered,
      });
    } catch (error: any) {
      logger.error(
        {
          error,
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

export default app;
