import type { CredentialStoreRegistry, ServerConfig } from '@inkeep/agents-core';

/**
 * Base authentication variables set by session middleware
 * Available in all authenticated routes
 */
export type BaseAppVariables = {
  userId: string;
  userEmail: string;
  tenantId: string;
  tenantRole: string;
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
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};

