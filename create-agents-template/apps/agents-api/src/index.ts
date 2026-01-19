import { loadEnvironmentFiles } from '@inkeep/agents-core';

loadEnvironmentFiles();
import './instrumentation.js';
import 'hono';

import { createAgentsApp } from '@inkeep/agents-api/factory';
import type { Hono } from 'hono';
import { credentialStores } from '../../shared/credential-stores.js';

const inkeep_agents_api_port = 3002;

// Create the Hono app
const app: Hono = createAgentsApp({
  serverConfig: {
    port: inkeep_agents_api_port,
    serverOptions: {
      requestTimeout: 60000,
      keepAliveTimeout: 60000,
      keepAlive: true,
    },
  },
  credentialStores,
});

export default app;
