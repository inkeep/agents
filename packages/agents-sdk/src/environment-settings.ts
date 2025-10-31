// Environment settings system for environment-agnostic entities management

import type { CredentialReferenceApiInsert } from '@inkeep/agents-core';
import type { UnionCredentialIds, UnionMcpServerIds } from './credential-ref';
import type { Tool } from './tool';

interface EnvironmentSettingsConfig {
  credentials?: {
    [settingId: string]: CredentialReferenceApiInsert;
  };
  mcpServers?: {
    [mcpServerId: string]: Tool;
  };
}

/**
 * Create a setting helper with TypeScript autocomplete
 */
export function createEnvironmentSettings<T extends Record<string, EnvironmentSettingsConfig>>(
  environments: T
) {
  // Simple type to extract credential keys for autocomplete
  type CredentialKeys = UnionCredentialIds<T>;
  type McpServerKeys = UnionMcpServerIds<T>;

  return {
    getEnvironmentCredential: (key: CredentialKeys): CredentialReferenceApiInsert => {
      const currentEnv = process.env.INKEEP_ENV || 'development';
      const env = environments[currentEnv];

      if (!env) {
        throw new Error(
          `Environment '${currentEnv}' not found. Available: ${Object.keys(environments).join(', ')}`
        );
      }

      const credential = env.credentials?.[key as string];
      if (!credential) {
        throw new Error(`Credential '${String(key)}' not found in environment '${currentEnv}'`);
      }

      return credential;
    },

    getEnvironmentMcp: (key: McpServerKeys): Tool => {
      const currentEnv = process.env.INKEEP_ENV || 'development';
      const env = environments[currentEnv];

      if (!env) {
        throw new Error(
          `Environment '${currentEnv}' not found. Available: ${Object.keys(environments).join(', ')}`
        );
      }

      const mcpServer = env.mcpServers?.[key as string];
      if (!mcpServer) {
        throw new Error(`MCP Server '${String(key)}' not found in environment '${currentEnv}'`);
      }

      return mcpServer;
    },

    //Deprecated: Use getEnvironmentCredential instead
    getEnvironmentSetting: (key: CredentialKeys): CredentialReferenceApiInsert => {
      const currentEnv = process.env.INKEEP_ENV || 'development';
      const env = environments[currentEnv];

      if (!env) {
        throw new Error(
          `Environment '${currentEnv}' not found. Available: ${Object.keys(environments).join(', ')}`
        );
      }

      const credential = env.credentials?.[key as string];
      if (!credential) {
        throw new Error(`Credential '${String(key)}' not found in environment '${currentEnv}'`);
      }

      return credential;
    },
  };
}

/**
 * Create type-safe environment configurations
 */
export function registerEnvironmentSettings<T extends EnvironmentSettingsConfig>(config: T): T {
  return config;
}

// Re-export type helpers for convenience
export type {
  ExtractCredentialIds,
  ExtractMcpServerIds,
  UnionCredentialIds,
  UnionMcpServerIds,
} from './credential-ref';
