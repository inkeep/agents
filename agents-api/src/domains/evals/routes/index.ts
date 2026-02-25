import { OpenAPIHono } from '@hono/zod-openapi';

import evaluationTriggerRoutes from './evaluationTriggers';

const app = new OpenAPIHono();
app.route('/', evaluationTriggerRoutes);

export default app;
