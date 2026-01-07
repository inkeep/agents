import { OpenAPIHono } from '@hono/zod-openapi';
import type { BaseAppVariables } from '../../types/app';
import datasetRunConfigsRoutes from './datasetRunConfigs';
import datasetItemsRoutes from './datasetItems';
import datasetRunsRoutes from './datasetRuns';
import evaluationJobConfigsRoutes from './evaluationJobConfigs';
import evaluationRunConfigsRoutes from './evaluationRunConfigs';
import evaluationSuiteConfigsRoutes from './evaluationSuiteConfigs';
import evaluationSuiteConfigEvaluatorRelationsRoutes from './evaluationSuiteConfigEvaluatorRelations';
import datasetRoutes from './datasets';
import evaluatorsRoutes from './evaluators';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.route('dataset-run-configs', datasetRunConfigsRoutes);
app.route('dataset-items', datasetItemsRoutes);
app.route('dataset-runs', datasetRunsRoutes);
app.route('evaluation-job-configs', evaluationJobConfigsRoutes);
app.route('evaluation-run-configs', evaluationRunConfigsRoutes);
app.route('evaluation-suite-configs', evaluationSuiteConfigsRoutes);
app.route('evaluation-suite-configs', evaluationSuiteConfigEvaluatorRelationsRoutes);
app.route('datasets', datasetRoutes);
app.route('evaluators', evaluatorsRoutes);

export default app;