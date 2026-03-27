import { OpenAPIHono } from '@hono/zod-openapi';
import type { ManageAppVariables } from '../../../../types/app';
import datasetItemsRoutes from './datasetItems';
import datasetRunConfigsRoutes from './datasetRunConfigs';
import datasetRunsRoutes from './datasetRuns';
import datasetRoutes from './datasets';
import evaluationJobConfigEvaluatorRelationsRoutes from './evaluationJobConfigEvaluatorRelations';
import evaluationJobConfigsRoutes from './evaluationJobConfigs';
import evaluationResultsRoutes from './evaluationResults';
import evaluationRunConfigsRoutes from './evaluationRunConfigs';
import evaluationSuiteConfigEvaluatorRelationsRoutes from './evaluationSuiteConfigEvaluatorRelations';
import evaluationSuiteConfigsRoutes from './evaluationSuiteConfigs';
import evaluatorsRoutes from './evaluators';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.route('dataset-run-configs', datasetRunConfigsRoutes);
app.route('dataset-items', datasetItemsRoutes);
app.route('dataset-runs', datasetRunsRoutes);
app.route('evaluation-job-configs', evaluationJobConfigsRoutes);
app.route('evaluation-job-configs', evaluationJobConfigEvaluatorRelationsRoutes);
app.route('evaluation-run-configs', evaluationRunConfigsRoutes);
app.route('evaluation-suite-configs', evaluationSuiteConfigsRoutes);
app.route('evaluation-suite-configs', evaluationSuiteConfigEvaluatorRelationsRoutes);
app.route('datasets', datasetRoutes);
app.route('evaluators', evaluatorsRoutes);
app.route('evaluation-results', evaluationResultsRoutes);

export default app;
