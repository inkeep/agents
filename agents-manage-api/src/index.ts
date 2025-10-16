import {
  type CredentialStore,
  CredentialStoreRegistry,
  createDefaultCredentialStores,
  type ServerConfig,
} from '@inkeep/agents-core';
import { createManagementHono } from './app';

const defaultConfig: ServerConfig = {
  port: 3002,
  serverOptions: {
    requestTimeout: 60000, // 60 seconds for management requests
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

const defaultStores = createDefaultCredentialStores();
const defaultRegistry = new CredentialStoreRegistry(defaultStores);

const app = createManagementHono(defaultConfig, defaultRegistry);

// Export the default app for Vite dev server and simple deployments
export default app;

// Also export the factory function for advanced usage
export { createManagementHono };

// Export a helper to create app with custom credential stores
export function createManagementApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
}) {
  const serverConfig = config?.serverConfig ?? defaultConfig;
  const stores = config?.credentialStores ?? defaultStores;
  const registry = new CredentialStoreRegistry(stores);

  return createManagementHono(serverConfig, registry);
}
