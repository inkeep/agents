import type {
  AgentsManageDatabaseClient,
  CredentialStoreRegistry,
  ResolvedRef,
  ServerConfig,
} from '@inkeep/agents-core';
import type { auth as authForTypes, createAuth } from '@inkeep/agents-core/auth';

interface CommonSandboxConfig {
  runtime: 'node22' | 'typescript';
  timeout?: number;
  vcpus?: number;
}

export interface NativeSandboxConfig extends CommonSandboxConfig {
  provider: 'native';
}

export interface VercelSandboxConfig extends CommonSandboxConfig {
  provider: 'vercel';
  teamId: string;
  projectId: string;
  token: string;
}

export type SandboxConfig = NativeSandboxConfig | VercelSandboxConfig;

type BaseAppVariables = {
  requestId: string;
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  tenantRole?: string;
  projectId?: string;
};

export type AppVariables = BaseAppVariables & {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  auth: ReturnType<typeof createAuth> | null;
  user: typeof authForTypes.$Infer.Session.user | null;
  session: typeof authForTypes.$Infer.Session.session | null;
  sandboxConfig?: SandboxConfig;
  requestBody?: unknown;
};

export type ManageAppVariables = AppVariables & {
  db: AgentsManageDatabaseClient;
  auth: ReturnType<typeof createAuth> | null;
  resolvedRef: ResolvedRef;
  /** Cached by projectFull middleware to avoid duplicate DB lookup for PUT upsert */
  isProjectCreate?: boolean;
};

export type AppConfig = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  auth: ReturnType<typeof createAuth> | null;
  sandboxConfig?: SandboxConfig;
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
