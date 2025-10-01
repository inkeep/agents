import './env';
import {
  type CredentialStore,
  CredentialStoreRegistry,
  createDefaultCredentialStores,
  type ServerConfig,
} from '@inkeep/agents-core';
import { createExecutionHono } from './app';

// Create default configuration
const defaultConfig: ServerConfig = {
  port: 3003,
  serverOptions: {
    requestTimeout: 120000, // 120 seconds for execution requests
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

// Create default credential stores
const defaultStores = createDefaultCredentialStores();
const defaultRegistry = new CredentialStoreRegistry(defaultStores);

// Create default app instance for simple usage
const app = createExecutionHono(defaultConfig, defaultRegistry);

// Export the default app for Vite dev server and simple deployments
export default app;

// Also export the factory function for advanced usage
export { createExecutionHono };

// Export a helper to create app with custom credential stores - fallsback to default configs
export function createExecutionApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
}) {
  const serverConfig = config?.serverConfig ?? defaultConfig;
  const stores = config?.credentialStores ?? defaultStores;
  const registry = new CredentialStoreRegistry(stores);

  return createExecutionHono(serverConfig, registry);
}
