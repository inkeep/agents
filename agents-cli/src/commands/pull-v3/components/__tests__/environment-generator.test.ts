// biome-ignore-all lint/security/noGlobalEval: allow in test

/**
 * Unit tests for environment settings generator
 */

import {
  generateEnvironmentIndexDefinition as generateEnvironmentIndexDefinitionV4,
  generateEnvironmentIndexFile as generateEnvironmentIndexFileV4,
  generateEnvironmentSettingsDefinition as generateEnvironmentSettingsDefinitionV4,
  generateEnvironmentSettingsFile as generateEnvironmentSettingsFileV4,
} from '../../../pull-v4/environment-generator';
import {
  generateEnvironmentIndexDefinition,
  generateEnvironmentIndexFile,
  generateEnvironmentIndexImports,
  generateEnvironmentSettingsDefinition,
  generateEnvironmentSettingsFile,
  generateEnvironmentSettingsImports,
} from '../environment-generator';

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
        type: 'env',
        credentialStoreId: 'env-default',
        description: 'Database connection string',
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

  describe('generateEnvironmentSettingsImports', () => {
    it('should generate basic imports', () => {
      const imports = generateEnvironmentSettingsImports(developmentData);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toBe("import { registerEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { CredentialStoreType } from '@inkeep/agents-core';");
    });

    it('should not include CredentialStoreType when not needed', () => {
      const emptyData = { credentials: {} };
      const imports = generateEnvironmentSettingsImports(emptyData);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { registerEnvironmentSettings } from '@inkeep/agents-sdk';");
    });

    // it('should handle different code styles', () => {
    //   const imports = generateEnvironmentSettingsImports(developmentData, {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(imports[0]).toBe('import { registerEnvironmentSettings } from "@inkeep/agents-sdk"');
    //   expect(imports[1]).toBe('import { CredentialStoreType } from "@inkeep/agents-core"');
    // });
  });

  describe('generateEnvironmentSettingsDefinition', () => {
    it.only('should generate correct definition with credentials', async () => {
      const environmentName = 'development';
      const definition = generateEnvironmentSettingsDefinition(environmentName, developmentData);

      expect(definition).toContain('export const development = registerEnvironmentSettings({');
      expect(definition).toContain('credentials: {');
      expect(definition).toContain("'stripe_api_key': {");
      expect(definition).toContain("id: 'stripe-api-key',");
      expect(definition).toContain("name: 'Stripe API Key',");
      expect(definition).toContain('type: CredentialStoreType.memory,');
      expect(definition).toContain("credentialStoreId: 'memory-default',");
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("key: 'STRIPE_API_KEY_DEV'");
      expect(definition).toContain('});');

      await expectEnvironmentSettingsDefinitionSnapshots(
        environmentName,
        developmentData,
        definition
      );
    });

    it.only('should handle multiple credentials', async () => {
      const environmentName = 'development';
      const definition = generateEnvironmentSettingsDefinition(environmentName, developmentData);

      expect(definition).toContain("'stripe_api_key': {");
      expect(definition).toContain("'database_url': {");
      expect(definition).toContain('type: CredentialStoreType.memory,');
      expect(definition).toContain('type: CredentialStoreType.env,');
      expect(definition).toContain("description: 'Database connection string',");
      expect(definition).toContain("fallback: 'postgresql://localhost:5432/dev'");

      await expectEnvironmentSettingsDefinitionSnapshots(
        environmentName,
        developmentData,
        definition
      );
    });

    it.only('should handle production environment with keychain credentials', async () => {
      const environmentName = 'production';
      const definition = generateEnvironmentSettingsDefinition(environmentName, productionData);

      expect(definition).toContain('export const production = registerEnvironmentSettings({');
      expect(definition).toContain('type: CredentialStoreType.keychain,');
      expect(definition).toContain("credentialStoreId: 'keychain-main',");
      expect(definition).toContain("service: 'stripe-api',");
      expect(definition).toContain("account: 'production'");

      await expectEnvironmentSettingsDefinitionSnapshots(
        environmentName,
        productionData,
        definition
      );
    });

    it.only('should handle empty credentials', async () => {
      const emptyData = { credentials: {} };
      const environmentName = 'test';
      const definition = generateEnvironmentSettingsDefinition(environmentName, emptyData);

      expect(definition).toContain('export const test = registerEnvironmentSettings({');
      expect(definition).toContain('credentials: {}');
      expect(definition).toContain('});');

      await expectEnvironmentSettingsDefinitionSnapshots(environmentName, emptyData, definition);
    });

    it.only('should handle environment with no credentials field', async () => {
      const environmentName = 'minimal';
      const data = {};
      const definition = generateEnvironmentSettingsDefinition(environmentName, data);

      expect(definition).toContain('export const minimal = registerEnvironmentSettings({');
      expect(definition).toContain('credentials: {}');
      expect(definition).toContain('});');

      await expectEnvironmentSettingsDefinitionSnapshots(environmentName, data, definition);
    });

    it.only('should handle credentials without optional fields', async () => {
      const environmentName = 'minimal';
      const minimalCredData = {
        credentials: {
          api_key: {
            id: 'api-key',
            type: 'memory',
            credentialStoreId: 'memory-default',
            retrievalParams: {
              key: 'API_KEY',
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition(environmentName, minimalCredData);

      expect(definition).toContain("'api_key': {");
      expect(definition).toContain("id: 'api-key',");
      expect(definition).toContain('type: CredentialStoreType.memory,');
      expect(definition).not.toContain('name:');
      expect(definition).not.toContain('description:');

      await expectEnvironmentSettingsDefinitionSnapshots(
        environmentName,
        minimalCredData,
        definition
      );
    });

    it.only('should handle complex retrieval params', async () => {
      const environmentName = 'complex';
      const complexData = {
        credentials: {
          complex_cred: {
            id: 'complex-cred',
            type: 'keychain',
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

      await expectEnvironmentSettingsDefinitionSnapshots(environmentName, complexData, definition);
    });
  });

  describe('generateEnvironmentIndexImports', () => {
    it('should generate imports for multiple environments', () => {
      const imports = generateEnvironmentIndexImports(['development', 'production']);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toBe("import { createEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { development } from './development.env';");
      expect(imports[2]).toBe("import { production } from './production.env';");
    });

    it('should handle single environment', () => {
      const imports = generateEnvironmentIndexImports(['development']);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toBe("import { createEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(imports[1]).toBe("import { development } from './development.env';");
    });

    // it('should handle different code styles', () => {
    //   const imports = generateEnvironmentIndexImports(['development'], {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(imports[0]).toBe('import { createEnvironmentSettings } from "@inkeep/agents-sdk"');
    //   expect(imports[1]).toBe('import { development } from "./development.env"');
    // });
  });

  describe('generateEnvironmentIndexDefinition', () => {
    it.only('should generate index definition for multiple environments', async () => {
      const environments = ['development', 'production'];
      const definition = generateEnvironmentIndexDefinition(environments);

      expect(definition).toContain('export const envSettings = createEnvironmentSettings({');
      expect(definition).toContain('  development,');
      expect(definition).toContain('  production');
      expect(definition).toContain('});');
      expect(definition).not.toContain('production,'); // No trailing comma on last item

      await expectEnvironmentIndexDefinitionSnapshots(environments, definition);
    });

    it.only('should generate index definition for single environment', async () => {
      const environments = ['development'];
      const definition = generateEnvironmentIndexDefinition(environments);

      expect(definition).toContain('export const envSettings = createEnvironmentSettings({');
      expect(definition).toContain('  development');
      expect(definition).toContain('});');
      expect(definition).not.toContain('development,'); // No trailing comma

      await expectEnvironmentIndexDefinitionSnapshots(environments, definition);
    });

    it.only('should handle empty environments array', async () => {
      const environments: string[] = [];
      const definition = generateEnvironmentIndexDefinition(environments);

      expect(definition).toBe('export const envSettings = createEnvironmentSettings({\n});');

      await expectEnvironmentIndexDefinitionSnapshots(environments, definition);
    });
  });

  describe('generateEnvironmentSettingsFile', () => {
    it.only('should generate complete environment settings file', async () => {
      const environmentName = 'development';
      const file = generateEnvironmentSettingsFile(environmentName, developmentData);

      expect(file).toContain("import { registerEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { CredentialStoreType } from '@inkeep/agents-core';");
      expect(file).toContain('export const development = registerEnvironmentSettings({');
      expect(file).toContain('credentials: {');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);

      await expectEnvironmentSettingsFileSnapshots(environmentName, developmentData, file);
    });
  });

  describe('generateEnvironmentIndexFile', () => {
    it('should generate complete environment index file', () => {
      const file = generateEnvironmentIndexFile(['development', 'production']);

      expect(file).toContain("import { createEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(file).toContain("import { development } from './development.env';");
      expect(file).toContain("import { production } from './production.env';");
      expect(file).toContain('export const envSettings = createEnvironmentSettings({');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate environment settings code that compiles', async () => {
      generateEnvironmentSettingsFile('development', developmentData);

      // Extract just the definition (remove imports and export)
      const definition = generateEnvironmentSettingsDefinition('development', developmentData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const registerEnvironmentSettings = (config) => config;
        const CredentialStoreType = {
          memory: 'memory',
          env: 'env', 
          keychain: 'keychain'
        };
        
        ${definitionWithoutExport}
        
        return development;
      `;

      // Use eval to test the code compiles and runs
      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.credentials).toBeDefined();
      expect(result.credentials.stripe_api_key).toBeDefined();
      expect(result.credentials.stripe_api_key.id).toBe('stripe-api-key');
      expect(result.credentials.stripe_api_key.type).toBe('memory');
      expect(result.credentials.database_url).toBeDefined();
      expect(result.credentials.database_url.type).toBe('env');
    });

    it('should generate environment index code that compiles', () => {
      generateEnvironmentIndexFile(['development', 'production']);

      // Extract just the definition
      const definition = generateEnvironmentIndexDefinition(['development', 'production']);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const createEnvironmentSettings = (config) => config;
        const development = { name: 'development', credentials: {} };
        const production = { name: 'production', credentials: {} };
        
        ${definitionWithoutExport}
        
        return envSettings;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.development).toBeDefined();
      expect(result.production).toBeDefined();
    });

    it('should generate minimal environment settings that compile', () => {
      const minimalData = { credentials: {} };
      const definition = generateEnvironmentSettingsDefinition('minimal', minimalData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const registerEnvironmentSettings = (config) => config;
        
        ${definitionWithoutExport}
        
        return minimal;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result.credentials).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle null credentials', () => {
      const definition = generateEnvironmentSettingsDefinition('test', { credentials: null });

      expect(definition).toContain('credentials: {}');
    });

    it('should handle undefined credentials', () => {
      const definition = generateEnvironmentSettingsDefinition('test', { credentials: undefined });

      expect(definition).toContain('credentials: {}');
    });

    it('should handle credential with null properties', () => {
      const dataWithNulls = {
        credentials: {
          test_key: {
            id: 'test-key',
            name: null,
            type: 'memory',
            credentialStoreId: 'memory-default',
            description: undefined,
            retrievalParams: {
              key: 'TEST_KEY',
              fallback: null,
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition('test', dataWithNulls);

      expect(definition).toContain("id: 'test-key',");
      expect(definition).toContain('type: CredentialStoreType.memory,');
      expect(definition).toContain("key: 'TEST_KEY'");
      expect(definition).not.toContain('name:');
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('fallback:');
    });

    it('should handle special characters in credential keys', () => {
      const specialData = {
        credentials: {
          'api-key_v2': {
            id: 'api-key-v2',
            type: 'env',
            credentialStoreId: 'env-default',
            retrievalParams: {
              key: 'API_KEY_V2',
            },
          },
        },
      };

      const definition = generateEnvironmentSettingsDefinition('special', specialData);

      expect(definition).toContain("'api-key_v2': {");
      expect(definition).toContain("id: 'api-key-v2',");
    });

    it('should handle empty environments array for index', () => {
      const file = generateEnvironmentIndexFile([]);

      expect(file).toContain("import { createEnvironmentSettings } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const envSettings = createEnvironmentSettings({');
      expect(file).toContain('});');
    });
  });
});
