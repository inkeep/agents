import { ManagementServer } from './ManagementServer.js';
import {
  InMemoryCredentialStore,
  createNangoCredentialStore,
  createKeyChainStore,
} from '@inkeep/agents-core';
import { env } from './env.js';
import { getLogger } from './logger.js';

const logger = getLogger('management-api');
export const MANAGEMENT_API_PORT = 3002;
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
// Initialize Management Server
export const managementServer = new ManagementServer({
  port: MANAGEMENT_API_PORT,
  credentialStores,
  serverOptions: {
    requestTimeout: 60000, // 60 seconds
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
});

// Start the server only if not in test environment
if (env.ENVIRONMENT !== 'test') {
  managementServer
    .serve()
    .then(() => {
      logger.info(
        `📝 OpenAPI documentation available at http://localhost:${MANAGEMENT_API_PORT}/openapi.json`
      );
    })
    .catch((error) => {
      logger.error('Failed to start Management API server:', error);
      process.exit(1);
    });
}
