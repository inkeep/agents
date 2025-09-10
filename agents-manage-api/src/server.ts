import { serve } from '@hono/node-server';
import { createManagementApp } from './index.js';
import { env } from './env.js';

const port = Number(env.PORT || process.env.PORT || 3002);
const app = createManagementApp();

console.log(`Starting agents-manage-api server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});