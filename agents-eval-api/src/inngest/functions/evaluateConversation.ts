import {
  createEvaluationResult,
  generateId,
  getConversation,
  getEvaluatorById,
  updateEvaluationResult,
} from '@inkeep/agents-core';
import { inngest } from '../client';
import dbClient from '../../data/db/dbClient';
import { getLogger } from '../../logger';
import { EvaluationService } from '../../services/EvaluationService';

const logger = getLogger('inngest-evaluate-conversation');

export const evaluateConversation = inngest.createFunction(
  {
    id: 'evaluate-conversation',
    name: 'Evaluate Conversation',
    retries: 3,
    concurrency: {
      limit: 20,
    },
  },
  { event: 'evaluation/conversation.execute' },
  async ({ event, step }) => {
    const { tenantId, projectId, conversationId, evaluatorIds, evaluationRunId } = event.data;

    logger.info(
      { tenantId, projectId, conversationId, evaluatorIds, evaluationRunId },
      'Starting conversation evaluation'
    );

    const conversation = await step.run('get-conversation', async () => {
      const conv = await getConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conv) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }

      return conv;
    });

    const evaluators = await step.run('get-evaluators', async () => {
      const evals = await Promise.all(
        evaluatorIds.map((id: string) =>
          getEvaluatorById(dbClient)({
            scopes: { tenantId, projectId, evaluatorId: id },
          })
        )
      );

      return evals.filter((e) => e !== null);
    });

    if (evaluators.length === 0) {
      logger.warn({ conversationId, evaluatorIds }, 'No valid evaluators found');
      return { success: false, reason: 'No valid evaluators' };
    }

    const results: any[] = [];
    for (const evaluator of evaluators) {
      const result = await step.run(`evaluate-with-${evaluator.id}`, async () => {
        const evalResult = await createEvaluationResult(dbClient)({
          id: generateId(),
          tenantId,
          projectId,
          conversationId,
          evaluatorId: evaluator.id,
          evaluationRunId,
        });

        try {
          const evaluationService = new EvaluationService();
          const output = await evaluationService.executeEvaluation({
            conversation,
            evaluator,
            tenantId,
            projectId,
          }); 

          const updated = await updateEvaluationResult(dbClient)({
            scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
            data: { output: output as any },
          });

          logger.info(
            { conversationId, evaluatorId: evaluator.id, resultId: evalResult.id },
            'Evaluation completed successfully'
          );

          return updated;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          logger.error(
            { error, conversationId, evaluatorId: evaluator.id, resultId: evalResult.id },
            'Evaluation execution failed'
          );

          const failed = await updateEvaluationResult(dbClient)({
            scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
            data: { output: { text: `Evaluation failed: ${errorMessage}` } as any },
          });

          return failed;
        }
      });

      results.push(result);
    }

    return {
      success: true,
      conversationId,
      resultCount: results.length,
    };
  }
);

