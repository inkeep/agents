/**
 * Unit tests for credential generator
 */

import { describe, expect, it } from 'vitest';
import {
  generateCredentialDefinition,
  generateCredentialFile,
  generateCredentialImports,
} from '../credential-generator';

describe('Credential Generator', () => {
  const testCredentialData = {
    id: 'inkeep-api-key',
    name: 'Inkeep API Key',
    type: 'memory',
    credentialStoreId: 'memory-default',
    description: 'API key for Inkeep search and context services',
    retrievalParams: {
      key: 'INKEEP_API_KEY',
    },
  };

  const envCredentialData = {
    id: 'database-url',
    name: 'Database URL',
    type: 'env',
    credentialStoreId: 'env-production',
    description: 'Database connection URL for production environment',
    retrievalParams: {
      key: 'DATABASE_URL',
      fallback: 'postgresql://localhost:5432/app',
    },
  };

  const keychainCredentialData = {
    id: 'slack-token',
    name: 'Slack Token',
    type: 'keychain',
    credentialStoreId: 'keychain-main',
    description: 'Slack bot token stored in OS keychain',
    retrievalParams: {
      service: 'slack-bot',
      account: 'my-workspace',
    },
  };

  describe('generateCredentialImports', () => {
    it('should generate correct imports', () => {
      const imports = generateCredentialImports('inkeep-api-key', testCredentialData);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { credential } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateCredentialImports('inkeep-api-key', testCredentialData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    ',
      });

      expect(imports[0]).toBe('import { credential } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateCredentialDefinition', () => {
    it('should generate correct definition with all properties', () => {
      const definition = generateCredentialDefinition('inkeep-api-key', testCredentialData);

      expect(definition).toContain('export const inkeepApiKey = credential({');
      expect(definition).toContain("id: 'inkeep-api-key',");
      expect(definition).toContain("type: 'memory',");
      expect(definition).toContain("credentialStoreId: 'memory-default',");
      expect(definition).toContain(
        "description: 'API key for Inkeep search and context services',"
      );
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("'key': 'INKEEP_API_KEY'");
      expect(definition).toContain('});');
    });

    it('should handle credential ID to camelCase conversion', () => {
      const definition = generateCredentialDefinition('database-connection-url', {
        name: 'Database Connection URL',
        type: 'env',
        credentialStoreId: 'env-default',
      });

      expect(definition).toContain('export const databaseConnectionUrl = credential({');
      expect(definition).toContain("id: 'database-connection-url',");
    });

    it('should handle credential with all required fields', () => {
      const definition = generateCredentialDefinition('my-credential', {
        name: 'My Credential',
        type: 'memory',
        credentialStoreId: 'memory-default',
      });

      expect(definition).toContain('export const myCredential = credential({');
      expect(definition).toContain("type: 'memory',");
    });

    it('should handle different credential store types', () => {
      const envDef = generateCredentialDefinition('env-cred', {
        name: 'Env Cred',
        type: 'env',
        credentialStoreId: 'env-default',
      });
      expect(envDef).toContain("credentialStoreId: 'env-default',");

      const keychainDef = generateCredentialDefinition('keychain-cred', {
        name: 'Keychain Cred',
        type: 'keychain',
        credentialStoreId: 'keychain-default',
      });
      expect(keychainDef).toContain("credentialStoreId: 'keychain-default',");

      const memoryDef = generateCredentialDefinition('memory-cred', {
        name: 'Memory Cred',
        type: 'memory',
        credentialStoreId: 'memory-default',
      });
      expect(memoryDef).toContain("credentialStoreId: 'memory-default',");
    });

    it('should handle env credential with complex retrieval params', () => {
      const definition = generateCredentialDefinition('database-url', envCredentialData);

      expect(definition).toContain('export const databaseUrl = credential({');
      expect(definition).toContain("type: 'env',");
      expect(definition).toContain("credentialStoreId: 'env-production',");
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("'key': 'DATABASE_URL',");
      expect(definition).toContain("'fallback': 'postgresql://localhost:5432/app'");
    });

    it('should handle keychain credential with service and account', () => {
      const definition = generateCredentialDefinition('slack-token', keychainCredentialData);

      expect(definition).toContain('export const slackToken = credential({');
      expect(definition).toContain("type: 'keychain',");
      expect(definition).toContain("credentialStoreId: 'keychain-main',");
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("'service': 'slack-bot',");
      expect(definition).toContain("'account': 'my-workspace'");
    });

    it('should provide default retrieval params when not specified', () => {
      const definition = generateCredentialDefinition('openai-api-key', {
        name: 'OpenAI API Key',
        type: 'memory',
        credentialStoreId: 'memory-default',
      });

      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("'key': 'OPENAI_API_KEY'"); // Auto-generated from ID
    });

    it('should throw error for missing required fields', () => {
      expect(() => {
        generateCredentialDefinition('minimal', {});
      }).toThrow("Missing required fields for credential 'minimal': name, type, credentialStoreId");
    });

    it('should handle multiline descriptions', () => {
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information about the credential';
      const dataWithLongDesc = {
        name: 'Long Description Credential',
        type: 'env',
        credentialStoreId: 'env-production',
        description: longDescription,
      };

      const definition = generateCredentialDefinition('long-desc', dataWithLongDesc);

      expect(definition).toContain(`description: \`${longDescription}\``);
    });

    it('should handle nested retrieval params', () => {
      const complexCredential = {
        name: 'Complex Credential',
        type: 'keychain',
        credentialStoreId: 'keychain-main',
        retrievalParams: {
          service: 'oauth-service',
          account: 'user@example.com',
          config: {
            timeout: 5000,
            retries: 3,
          },
        },
      };

      const definition = generateCredentialDefinition('complex', complexCredential);

      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("'service': 'oauth-service',");
      expect(definition).toContain("'account': 'user@example.com',");
      expect(definition).toContain("'config': {");
      expect(definition).toContain("'timeout': 5000,");
      expect(definition).toContain("'retries': 3");
    });

    it('should handle different data types in retrieval params', () => {
      const mixedParamsCredential = {
        name: 'Mixed Params Credential',
        type: 'env',
        credentialStoreId: 'env-default',
        retrievalParams: {
          key: 'API_KEY',
          port: 3000,
          enabled: true,
          timeout: 30.5,
        },
      };

      const definition = generateCredentialDefinition('mixed', mixedParamsCredential);

      expect(definition).toContain("'key': 'API_KEY',");
      expect(definition).toContain("'port': 3000,");
      expect(definition).toContain("'enabled': true,");
      expect(definition).toContain("'timeout': 30.5");
    });
  });

  describe('generateCredentialFile', () => {
    it('should generate complete file with imports and definition', () => {
      const file = generateCredentialFile('inkeep-api-key', testCredentialData);

      expect(file).toContain("import { credential } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const inkeepApiKey = credential({');
      expect(file).toContain("id: 'inkeep-api-key',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate code that compiles and creates a working credential', async () => {
      const file = generateCredentialFile('inkeep-api-key', testCredentialData);

      // Extract just the credential definition (remove imports and export)
      const definition = generateCredentialDefinition('inkeep-api-key', testCredentialData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      // Mock the dependencies and test compilation
      const moduleCode = `
        // Mock the imports for testing
        const credential = (config) => config;
        
        ${definitionWithoutExport}
        
        return inkeepApiKey;
      `;

      // Use eval to test the code compiles and runs
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      // Verify the resulting object has the correct structure
      expect(result).toBeDefined();
      expect(result.id).toBe('inkeep-api-key');
      expect(result.type).toBe('memory');
      expect(result.credentialStoreId).toBe('memory-default');
      expect(result.description).toBe('API key for Inkeep search and context services');
      expect(result.retrievalParams).toBeDefined();
      expect(result.retrievalParams.key).toBe('INKEEP_API_KEY');
    });

    it('should generate code for env credential that compiles', () => {
      const file = generateCredentialFile('database-url', envCredentialData);

      // Should have credential import
      expect(file).toContain('import { credential }');

      // Test compilation
      const definition = generateCredentialDefinition('database-url', envCredentialData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const credential = (config) => config;
        
        ${definitionWithoutExport}
        
        return databaseUrl;
      `;

      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result.id).toBe('database-url');
      expect(result.type).toBe('env');
      expect(result.credentialStoreId).toBe('env-production');
      expect(result.retrievalParams.key).toBe('DATABASE_URL');
      expect(result.retrievalParams.fallback).toBe('postgresql://localhost:5432/app');
    });

    it('should generate code for keychain credential that compiles', () => {
      const definition = generateCredentialDefinition('slack-token', keychainCredentialData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const credential = (config) => config;
        
        ${definitionWithoutExport}
        
        return slackToken;
      `;

      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result.id).toBe('slack-token');
      expect(result.type).toBe('keychain');
      expect(result.credentialStoreId).toBe('keychain-main');
      expect(result.retrievalParams.service).toBe('slack-bot');
      expect(result.retrievalParams.account).toBe('my-workspace');
    });

    it('should throw error for minimal credential with missing fields', () => {
      expect(() => {
        generateCredentialDefinition('minimal-cred', {});
      }).toThrow(
        "Missing required fields for credential 'minimal-cred': name, type, credentialStoreId"
      );
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty credential data', () => {
      expect(() => {
        generateCredentialDefinition('empty', {});
      }).toThrow("Missing required fields for credential 'empty': name, type, credentialStoreId");
    });

    it('should handle special characters in credential ID', () => {
      const definition = generateCredentialDefinition('api-key_v2', {
        name: 'API Key V2',
        type: 'env',
        credentialStoreId: 'env-default',
      });

      expect(definition).toContain('export const apiKeyV2 = credential({');
      expect(definition).toContain("id: 'api-key_v2',");
    });

    it('should handle credential ID starting with number', () => {
      const definition = generateCredentialDefinition('2023-api-key', {
        name: '2023 API Key',
        type: 'memory',
        credentialStoreId: 'memory-default',
      });

      expect(definition).toContain('export const _2023ApiKey = credential({');
    });

    it('should handle null and undefined values gracefully', () => {
      const credentialData = {
        name: 'Null Test Credential',
        type: 'env',
        credentialStoreId: 'env-default',
        description: null,
        retrievalParams: {
          key: 'API_KEY',
          fallback: undefined,
        },
      };

      const definition = generateCredentialDefinition('null-test', credentialData);

      expect(definition).toContain('export const nullTest = credential({');
      expect(definition).not.toContain('description:');
      expect(definition).toContain("'key': 'API_KEY'");
      expect(definition).not.toContain('fallback');
    });

    it('should handle empty retrieval params object', () => {
      const credentialData = {
        name: 'Empty Params Credential',
        type: 'memory',
        credentialStoreId: 'memory-default',
        retrievalParams: {},
      };

      const definition = generateCredentialDefinition('empty-params', credentialData);

      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain('  }');
    });
  });
});
