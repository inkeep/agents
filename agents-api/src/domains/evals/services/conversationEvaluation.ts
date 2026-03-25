import {
  createEvaluationRun,
  type EvaluationSuiteFilterCriteria,
  type Filter,
  generateId,
  getConversation,
  getEvaluationSuiteConfigById,
  getEvaluationSuiteConfigEvaluatorRelations,
  listEvaluationRunConfigsWithSuiteConfigs,
  type ResolvedRef,
  withRef,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { evaluateConversationWorkflow } from '../workflow';

const logger = getLogger('ConversationEvaluation');

function extractSuiteFilterCriteria(
  filter: Filter<EvaluationSuiteFilterCriteria> | null | undefined
): EvaluationSuiteFilterCriteria | null {
  if (!filter) return null;
  if ('and' in filter || 'or' in filter) return null;
  return filter;
}

function conversationMatchesSuiteFilter(
  conversationAgentId: string | null | undefined,
  filters: Filter<EvaluationSuiteFilterCriteria> | null | undefined
): boolean {
  const criteria = extractSuiteFilterCriteria(filters);
  if (!criteria?.agentIds || criteria.agentIds.length === 0) return true;
  return !!conversationAgentId && criteria.agentIds.includes(conversationAgentId);
}

export const triggerConversationEvaluation = async (params: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  resolvedRef: ResolvedRef;
}): Promise<{ success: boolean; message: string; evaluationsTriggered: number }> => {
  const { tenantId, projectId, conversationId, resolvedRef } = params;
  try {
    const configs = await withRef(manageDbPool, resolvedRef, (db) =>
      listEvaluationRunConfigsWithSuiteConfigs(db)({
        scopes: { tenantId, projectId },
      })
    );

    const runConfigs = configs.filter((config) => config.isActive);

    if (runConfigs.length === 0) {
      logger.debug(
        { tenantId, projectId, conversationId },
        'No active evaluation run configs found, skipping evaluation'
      );
      return {
        success: true,
        message: 'No active evaluation run configs found',
        evaluationsTriggered: 0,
      };
    }

    logger.info(
      { tenantId, projectId, conversationId, runConfigCount: runConfigs.length },
      'Triggering conversation evaluation'
    );

    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    let evaluationsTriggered = 0;

    for (const runConfig of runConfigs) {
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

        if (!conversationMatchesSuiteFilter(conversation.agentId, suiteConfig.filters)) {
          logger.info(
            {
              suiteConfigId: suiteConfig.id,
              conversationAgentId: conversation.agentId,
              filterAgentIds: extractSuiteFilterCriteria(suiteConfig.filters)?.agentIds,
              conversationId,
            },
            'Conversation filtered out by agent filter'
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
          ref: resolvedRef,
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
    return {
      success: true,
      message:
        evaluationsTriggered > 0
          ? `Triggered ${evaluationsTriggered} evaluation(s)`
          : 'No evaluations matched (filtered by sample rate or no evaluators)',
      evaluationsTriggered,
    };
  } catch (error) {
    logger.error(
      {
        error: (error as Error)?.message,
        errorStack: (error as Error)?.stack,
        tenantId,
        projectId,
        conversationId,
      },
      'Failed to trigger conversation evaluation'
    );
    throw error;
  }
};
