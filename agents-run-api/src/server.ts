import './instrumentation.js';
import {
  createKeyChainStore,
  createNangoCredentialStore,
  InMemoryCredentialStore,
} from '@inkeep/agents-core';
import { AgentExecutionServer, EXECUTION_API_PORT } from './AgentExecutionServer.js';
import { env } from './env.js';
import { getLogger } from './logger.js';

const logger = getLogger('execution-api');

// Create credential stores
const credentialStores = [
  new InMemoryCredentialStore('memory-default'), // In-memory store + env vars
  // Nango store (only loads if NANGO_SECRET_KEY is set)
  ...(process.env.NANGO_SECRET_KEY
    ? [
        createNangoCredentialStore('nango-default', {
          apiUrl: process.env.NANGO_HOST || 'https://api.nango.dev',
          secretKey: process.env.NANGO_SECRET_KEY,
        }),
      ]
    : []),
  createKeyChainStore('keychain-default'),
];

// Initialize Execution Server
const executionServer = new AgentExecutionServer({
  port: EXECUTION_API_PORT,
  credentialStores,
  serverOptions: {
    requestTimeout: 120000, // 120 seconds for execution requests
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
});

// Start the server only if not in test environment AND not using Vite dev server  
const isViteDevServer =
  process.env.NODE_ENV === 'development' &&
  (process.env.VITE_DEV_SERVER === 'true' ||
    process.env.VITE !== undefined ||
    process.argv.some((arg) => arg.includes('vite')) ||
    globalThis.__vite_dev_server__);

if (env.ENVIRONMENT !== 'test' && !isViteDevServer) {
  executionServer
    .serve()
    .then(() => {
      logger.info(
        `📝 OpenAPI documentation available at http://localhost:${EXECUTION_API_PORT}/openapi.json`
      );
    })
    .catch((error) => {
      logger.error('Failed to start Execution API server:', error);
      process.exit(1);
    });
} else if (isViteDevServer) {
  // Initialize server (credential stores, etc.) but don't start HTTP server - Vite handles that
  (async () => {
    try {
      await executionServer.initializeOnly();
      logger.info('🚀 Execution server initialized for Vite dev mode (credential stores ready)');
      logger.info('🔥 HTTP server handled by Vite dev server');
    } catch (error) {
      logger.error('Failed to initialize execution server:', error);
    }
  })();
}

export { executionServer };
