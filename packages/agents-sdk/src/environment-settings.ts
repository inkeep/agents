// Environment settings system for environment-agnostic entities management

import type { CredentialReferenceApiInsert } from '@inkeep/agents-core';
import type { UnionCredentialIds } from './credential-ref';

interface EnvironmentSettingsConfig {
  credentials?: {
    [settingId: string]: CredentialReferenceApiInsert;
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

  return {
    getEnvironmentSetting: async (key: CredentialKeys): Promise<CredentialReferenceApiInsert> => {
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
export type { ExtractCredentialIds, UnionCredentialIds } from './credential-ref';
