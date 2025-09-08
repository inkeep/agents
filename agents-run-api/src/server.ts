#!/usr/bin/env node
import { serve } from '@hono/node-server';
import app from './index.js';
import { getLogger } from './logger.js';

const logger = getLogger('server');
const port = Number(process.env.PORT) || 3001;

logger.info(`Starting Inkeep Agent Run API server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  logger.info(`Server is running on http://localhost:${info.port}`);
});