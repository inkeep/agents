import type {
  CredentialStoreRegistry,
  AgentsManageDatabaseClient,
  ResolvedRef,
  ServerConfig,
} from '@inkeep/agents-core';
import type { createAuth } from '@inkeep/agents-core/auth';

/**
 * Base authentication variables set by session middleware
 * Available in all authenticated routes
 */
export type BaseAppVariables = {
  auth: ReturnType<typeof createAuth> | null;
  userId: string;
  userEmail: string;
  tenantId: string;
  tenantRole: string;
  resolvedRef: ResolvedRef;
  db: AgentsManageDatabaseClient;
};

/**
 * Extended app variables with credential store support
 * Used in routes that need credential management
 */
export type AppVariablesWithCredentials = BaseAppVariables & {
  credentialStores: CredentialStoreRegistry;
};

/**
 * Extended app variables with server config and credential stores
 * Used in routes that need full server configuration
 */
export type AppVariablesWithServerConfig = BaseAppVariables & {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};

/**
 * Minimal app variables for public/OAuth routes
 * Does not include authentication variables
 */
export type PublicAppVariables = {
  credentialStores: CredentialStoreRegistry;
};

/**
 * Minimal app variables for OAuth routes with server config
 */
export type PublicAppVariablesWithServerConfig = {
  db: AgentsManageDatabaseClient;
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};
