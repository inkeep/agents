import { OpenAPIHono } from '@hono/zod-openapi';

import datasetTriggerRoutes from './datasetTriggers';
import evaluationTriggerRoutes from './evaluationTriggers';

const app = new OpenAPIHono();
app.route('/', datasetTriggerRoutes);
app.route('/', evaluationTriggerRoutes);

export default app;
