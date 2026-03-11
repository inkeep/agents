/**
 * Unit tests for environment settings generator
 */

import { generateEnvironmentIndexDefinition as originalGenerateEnvironmentIndexDefinition } from '../generators/environment-generator';
import { generateEnvironmentSettingsDefinition as originalGenerateEnvironmentSettingsDefinition } from '../generators/environment-settings-generator';
import { expectSnapshots } from '../utils';

function generateEnvironmentSettingsDefinition(
  ...args: Parameters<typeof originalGenerateEnvironmentSettingsDefinition>
): string {
  return originalGenerateEnvironmentSettingsDefinition(...args).getFullText();
}

function generateEnvironmentIndexDefinition(
  ...args: Parameters<typeof originalGenerateEnvironmentIndexDefinition>
): string {
  return originalGenerateEnvironmentIndexDefinition(...args).getFullText();
}

describe('Environment Settings Generator', () => {
  const developmentData = {
    credentials: {
      stripe_api_key: {
        id: 'stripe-api-key',
        name: 'Stripe API Key',
        type: 'memory',
        credentialStoreId: 'memory-default',
        retrievalParams: {
          key: 'STRIPE_API_KEY_DEV',
        },
      },
      database_url: {
        id: 'database-url',
        name: 'Database URL',
        type: 'keychain',
        credentialStoreId: 'env-default',
        retrievalParams: {
          key: 'DATABASE_URL',
          fallback: 'postgresql://localhost:5432/dev',
        },
      },
    },
  };

  const productionData = {
    credentials: {
      stripe_api_key: {
        id: 'stripe-api-key',
        name: 'Stripe API Key',
        type: 'keychain',
        credentialStoreId: 'keychain-main',
        retrievalParams: {
          service: 'stripe-api',
          account: 'production',
        },
      },
    },
  };

  describe('generateEnvironmentSettingsDefinition', () => {
    it('should generate correct definition with credentials', async () => {
      const environmentName = 'development';
      const definition = generateEnvironmentSettingsDefinition(environmentName, developmentData);

      expect(definition).toContain('export const development = registerEnvironmentSettings({');
      expect(definition).toContain('credentials: {');
      expect(definition).toContain('stripe_api_key: {');
      expect(definition).toContain("id: 'stripe-api-key',");
      expect(definition).toContain("name: 'Stripe API Key',");
      expect(definition).toContain("type: 'memory',");
      expect(definition).toContain("credentialStoreId: 'memory-default',");
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("key: 'STRIPE_API_KEY_DEV'");
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle multiple credentials', async () => {
      const environmentName = 'development';
      const definition = generateEnvironmentSettingsDefinition(environmentName, developmentData);

      expect(definition).toContain('stripe_api_key: {');
      expect(definition).toContain('database_url: {');
      expect(definition).toContain("type: 'memory',");
      expect(definition).toContain("type: 'keychain',");
      expect(definition).toContain("fallback: 'postgresql://localhost:5432/dev'");
      await expectSnapshots(definition);
    });

    it('should handle production environment with keychain credentials', async () => {
      const environmentName = 'production';
      const definition = generateEnvironmentSettingsDefinition(environmentName, productionData);

      expect(definition).toContain('export const production = registerEnvironmentSettings({');
      expect(definition).toContain("type: 'keychain',");
      expect(definition).toContain("credentialStoreId: 'keychain-main',");
      expect(definition).toContain("service: 'stripe-api',");
      expect(definition).toContain("account: 'production'");
      await expectSnapshots(definition);
    });

    it('should handle empty credentials', async () => {
      const emptyData = { credentials: {} };
      const environmentName = 'test';
      const definition = generateEnvironmentSettingsDefinition(environmentName, emptyData);

      expect(definition).toContain('export const test = registerEnvironmentSettings({');
      expect(definition).toContain('credentials: {}');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle environment with no credentials field', async () => {
      const environmentName = 'minimal';
      const data = {};
      const definition = generateEnvironmentSettingsDefinition(environmentName, data);

      expect(definition).toContain('export const minimal = registerEnvironmentSettings({');
      expect(definition).toContain('credentials: {}');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle credentials without optional fields', async () => {
      const environmentName = 'minimal';
      const minimalCredData = {
        credentials: {
          api_key: {
            id: 'api-key',
            type: 'memory',
            name: '',
            credentialStoreId: 'memory-default',
            retrievalParams: {
              key: 'API_KEY',
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition(environmentName, minimalCredData);

      expect(definition).toContain('api_key: {');
      expect(definition).toContain("id: 'api-key',");
      expect(definition).toContain("type: 'memory',");
      await expectSnapshots(definition);
    });

    it('should handle complex retrieval params', async () => {
      const environmentName = 'complex';
      const complexData = {
        credentials: {
          complex_cred: {
            id: 'complex-cred',
            type: 'keychain',
            name: '',
            credentialStoreId: 'keychain-main',
            retrievalParams: {
              service: 'oauth-service',
              account: 'user@example.com',
              timeout: 5000,
              retries: 3,
              enabled: true,
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition(environmentName, complexData);

      expect(definition).toContain("service: 'oauth-service',");
      expect(definition).toContain("account: 'user@example.com',");
      expect(definition).toContain('timeout: 5000,');
      expect(definition).toContain('retries: 3,');
      expect(definition).toContain('enabled: true');
      await expectSnapshots(definition);
    });
  });

  describe('generateEnvironmentIndexDefinition', () => {
    it('should generate index definition for multiple environments', async () => {
      const environments = ['development', 'production'];
      const definition = generateEnvironmentIndexDefinition(environments);

      expect(definition).toContain('export const envSettings = createEnvironmentSettings({');
      expect(definition).toContain('  development,');
      expect(definition).toContain('  production,');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should generate index definition for single environment', async () => {
      const environments = ['development'];
      const definition = generateEnvironmentIndexDefinition(environments);

      expect(definition).toContain('export const envSettings = createEnvironmentSettings({');
      expect(definition).toContain('  development,');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle empty environments array', async () => {
      const environments: string[] = [];
      const definition = generateEnvironmentIndexDefinition(environments);

      expect(definition).toContain('export const envSettings = createEnvironmentSettings({});');
      await expectSnapshots(definition);
    });
  });

  describe('generateEnvironmentSettingsFile', () => {
    it('should generate complete environment settings file', async () => {
      const environmentName = 'development';
      const file = generateEnvironmentSettingsDefinition(environmentName, developmentData);

      expect(file).toContain("import { registerEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const development = registerEnvironmentSettings({');
      expect(file).toContain('credentials: {');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
      await expectSnapshots(file);
    });
  });

  describe('generateEnvironmentIndexFile', () => {
    it('should generate complete environment index file', async () => {
      const environments = ['development', 'production'];
      const file = generateEnvironmentIndexDefinition(environments);

      expect(file).toContain("import { createEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { development } from './development.env';");
      expect(file).toContain("import { production } from './production.env';");
      expect(file).toContain('export const envSettings = createEnvironmentSettings({');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
      await expectSnapshots(file);
    });
  });

  describe('compilation tests', () => {
    it('should generate environment index code that compiles', async () => {
      // Extract just the definition
      const definition = generateEnvironmentIndexDefinition(['development', 'production']);
      await expectSnapshots(definition);
    });

    it('should generate minimal environment settings that compile', async () => {
      const minimalData = { credentials: {} };
      const definition = generateEnvironmentSettingsDefinition('minimal', minimalData);
      await expectSnapshots(definition);
    });
  });

  describe('edge cases', () => {
    it('should handle null credentials', async () => {
      const environmentName = 'test';
      const data = { credentials: null };
      const definition = generateEnvironmentSettingsDefinition(environmentName, data);

      expect(definition).toContain('credentials: {}');
      await expectSnapshots(definition);
    });

    it('should handle undefined credentials', async () => {
      const environmentName = 'test';
      const data = { credentials: undefined };
      const definition = generateEnvironmentSettingsDefinition(environmentName, data);

      expect(definition).toContain('credentials: {}');
      await expectSnapshots(definition);
    });

    it('should handle credential with null properties', async () => {
      const environmentName = 'test';
      const dataWithNulls = {
        credentials: {
          test_key: {
            id: 'test-key',
            name: '',
            type: 'memory',
            credentialStoreId: 'memory-default',
            retrievalParams: {
              key: 'TEST_KEY',
              fallback: null,
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition(environmentName, dataWithNulls);

      expect(definition).toContain("id: 'test-key',");
      expect(definition).toContain("type: 'memory',");
      expect(definition).toContain("key: 'TEST_KEY'");
      await expectSnapshots(definition);
    });

    it('should handle special characters in credential keys', async () => {
      const environmentName = 'special';
      const specialData = {
        credentials: {
          'api-key_v2': {
            id: 'api-key-v2',
            type: 'memory',
            name: '',
            credentialStoreId: 'env-default',
            retrievalParams: {
              key: 'API_KEY_V2',
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition(environmentName, specialData);

      expect(definition).toContain("'api-key_v2': {");
      expect(definition).toContain("id: 'api-key-v2',");
      await expectSnapshots(definition);
    });

    it('should handle empty environments array for index', async () => {
      const environments: string[] = [];
      const file = generateEnvironmentIndexDefinition(environments);

      expect(file).toContain("import { createEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const envSettings = createEnvironmentSettings({');
      expect(file).toContain('});');
      await expectSnapshots(file);
    });
  });
});
