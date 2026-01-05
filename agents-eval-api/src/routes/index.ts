import { OpenAPIHono } from '@hono/zod-openapi';

import datasetsRoutes from './manage/datasets';
import datasetItemsRoutes from './manage/datasetItems';
import evaluatorsRoutes from './manage/evaluators';
import evaluationSuiteConfigsRoutes from './manage/evaluationSuiteConfigs';
import evaluationSuiteConfigEvaluatorRelationsRoutes from './manage/evaluationSuiteConfigEvaluatorRelations';
import evaluationJobConfigsRoutes from './manage/evaluationJobConfigs';
import evaluationResultsRoutes from './run/evaluationResults';
import triggerConversationEvaluationRoutes from './run/triggerConversationEvaluation';
import datasetRunConfigsRoutes from './manage/datasetRunConfigs';
import datasetRunsRoutes from './run/datasetRuns';
import evaluationRunConfigsRoutes from './manage/evaluationRunConfigs';
import conversationEvaluationTriggerRoutes from './run/conversationEvaluationTrigger';

const evaluationConfigRoutes = new OpenAPIHono();
const evaluationRunRoutes = new OpenAPIHono();

// Evaluation Config Routes
evaluationConfigRoutes.route('/', datasetsRoutes);
evaluationConfigRoutes.route('/', datasetItemsRoutes);
evaluationConfigRoutes.route('/', evaluatorsRoutes);
evaluationConfigRoutes.route('/', evaluationSuiteConfigsRoutes);
evaluationConfigRoutes.route('/', evaluationSuiteConfigEvaluatorRelationsRoutes);
evaluationConfigRoutes.route('/', evaluationJobConfigsRoutes);
evaluationConfigRoutes.route('/', datasetRunConfigsRoutes);
evaluationConfigRoutes.route('/', evaluationRunConfigsRoutes);

// Evaluation Run Routes
evaluationRunRoutes.route('/', evaluationResultsRoutes);
evaluationRunRoutes.route('/', triggerConversationEvaluationRoutes);
evaluationRunRoutes.route('/', datasetRunsRoutes);
evaluationRunRoutes.route('/', conversationEvaluationTriggerRoutes);

export default {
  evaluationConfigRoutes,
  evaluationRunRoutes,
};

