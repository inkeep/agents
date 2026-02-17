// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for credential generator
 */

import { describe, expect, it } from 'vitest';
import { generateCredentialDefinition as generateCredentialDefinitionV4 } from '../../../pull-v4/credential-generator';
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

  const expectCredentialDefinitionSnapshots = async (
    defentionData: Parameters<typeof generateCredentialDefinitionV4>[0],
    definition: string
  ) => {
    const testName = expect.getState().currentTestName;
    const definitionV4 = generateCredentialDefinitionV4(defentionData);
    await expect(definition).toMatchFileSnapshot(`__snapshots__/credential/${testName}.txt`);
    await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/credential/${testName}-v4.txt`);
  };

  describe('generateCredentialImports', () => {
    // it('should generate correct imports', () => {
    //   const imports = generateCredentialImports();
    //
    //   expect(imports).toHaveLength(1);
    //   expect(imports[0]).toBe("import { credential } from '@inkeep/agents-sdk';");
    // });
    // it('should handle different code styles', () => {
    //   const imports = generateCredentialImports({
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(imports[0]).toBe('import { credential } from "@inkeep/agents-sdk"');
    // });
  });

  describe('generateCredentialDefinition', () => {
    it.only('should generate correct definition with all properties', async () => {
      const credentialId = 'inkeep-api-key';
      const definition = generateCredentialDefinition(credentialId, testCredentialData);

      expect(definition).toContain('export const inkeepApiKey = credential({');
      expect(definition).toContain("id: 'inkeep-api-key',");
      expect(definition).toContain("type: 'memory',");
      expect(definition).toContain("credentialStoreId: 'memory-default',");
      expect(definition).toContain(
        "description: 'API key for Inkeep search and context services',"
      );
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("key: 'INKEEP_API_KEY'");
      expect(definition).toContain('});');

      await expectCredentialDefinitionSnapshots(
        { credentialId, ...testCredentialData },
        definition
      );
    });

    it.only('should handle credential ID to camelCase conversion', async () => {
      const credentialId = 'database-connection-url';
      const conversionData = {
        name: 'Database Connection URL',
        type: 'env',
        credentialStoreId: 'env-default',
      };
      const definition = generateCredentialDefinition(credentialId, conversionData);

      expect(definition).toContain('export const databaseConnectionUrl = credential({');
      expect(definition).toContain("id: 'database-connection-url',");

      await expectCredentialDefinitionSnapshots({ credentialId, ...conversionData }, definition);
    });

    it.only('should handle credential with all required fields', async () => {
      const credentialId = 'my-credential';
      const requiredFieldsData = {
        name: 'My Credential',
        type: 'memory',
        credentialStoreId: 'memory-default',
      };
      const definition = generateCredentialDefinition(credentialId, requiredFieldsData);

      expect(definition).toContain('export const myCredential = credential({');
      expect(definition).toContain("type: 'memory',");

      await expectCredentialDefinitionSnapshots(
        { credentialId, ...requiredFieldsData },
        definition
      );
    });

    it('should handle different credential store types', () => {
      const envDef = generateCredentialDefinition('env-cred', {
        name: 'Env Cred',
        type: 'env',
        credentialStoreId: 'env-default',
      });
      expect(envDef).toContain("credentialStoreId: 'env-default'");

      const keychainDef = generateCredentialDefinition('keychain-cred', {
        name: 'Keychain Cred',
        type: 'keychain',
        credentialStoreId: 'keychain-default',
      });
      expect(keychainDef).toContain("credentialStoreId: 'keychain-default'");

      const memoryDef = generateCredentialDefinition('memory-cred', {
        name: 'Memory Cred',
        type: 'memory',
        credentialStoreId: 'memory-default',
      });
      expect(memoryDef).toContain("credentialStoreId: 'memory-default'");
    });

    it.only('should handle env credential with complex retrieval params', async () => {
      const credentialId = 'database-url';
      const definition = generateCredentialDefinition(credentialId, envCredentialData);

      expect(definition).toContain('export const databaseUrl = credential({');
      expect(definition).toContain("type: 'env',");
      expect(definition).toContain("credentialStoreId: 'env-production',");
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("key: 'DATABASE_URL',");
      expect(definition).toContain("fallback: 'postgresql://localhost:5432/app'");

      await expectCredentialDefinitionSnapshots({ credentialId, ...envCredentialData }, definition);
    });

    it.only('should handle keychain credential with service and account', async () => {
      const credentialId = 'slack-token';
      const definition = generateCredentialDefinition(credentialId, keychainCredentialData);

      expect(definition).toContain('export const slackToken = credential({');
      expect(definition).toContain("type: 'keychain',");
      expect(definition).toContain("credentialStoreId: 'keychain-main',");
      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("service: 'slack-bot',");
      expect(definition).toContain("account: 'my-workspace'");

      await expectCredentialDefinitionSnapshots(
        { credentialId, ...keychainCredentialData },
        definition
      );
    });

    it.only('should not generate retrieval params when not specified', async () => {
      const credentialId = 'openai-api-key';
      const dataWithoutRetrievalParams = {
        name: 'OpenAI API Key',
        type: 'memory',
        credentialStoreId: 'memory-default',
      };
      const definition = generateCredentialDefinition(credentialId, dataWithoutRetrievalParams);

      expect(definition).not.toContain('retrievalParams: {');
      expect(definition).not.toContain("key: 'OPENAI_API_KEY'"); // Should not auto-generate

      await expectCredentialDefinitionSnapshots(
        { credentialId, ...dataWithoutRetrievalParams },
        definition
      );
    });

    it.only('should throw error for missing required fields', () => {
      expect(() => {
        generateCredentialDefinition('minimal', {});
      }).toThrow("Missing required fields for credential 'minimal': name, type, credentialStoreId");
      expect(() => {
        // @ts-expect-error -- test missing fields
        generateCredentialDefinitionV4({ credentialId: 'minimal' });
      }).toThrow(
        new Error(`Missing required fields for credential:
✖ Invalid input: expected string, received undefined
  → at name
✖ Invalid input: expected string, received undefined
  → at type
✖ Invalid input: expected string, received undefined
  → at credentialStoreId`)
      );
    });

    it.only('should handle multiline descriptions', async () => {
      const credentialId = 'long-desc';
      const longDescription =
        'This is a very long description that should be formatted as a multiline template literal because it exceeds the length threshold for regular strings and contains detailed information about the credential';
      const dataWithLongDesc = {
        name: 'Long Description Credential',
        type: 'env',
        credentialStoreId: 'env-production',
        description: longDescription,
      };

      const definition = generateCredentialDefinition(credentialId, dataWithLongDesc);

      expect(definition).toContain(`description: \`${longDescription}\``);

      await expectCredentialDefinitionSnapshots({ credentialId, ...dataWithLongDesc }, definition);
    });

    it.only('should handle nested retrieval params', async () => {
      const credentialId = 'complex';
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

      const definition = generateCredentialDefinition(credentialId, complexCredential);

      expect(definition).toContain('retrievalParams: {');
      expect(definition).toContain("service: 'oauth-service',");
      expect(definition).toContain("account: 'user@example.com',");
      expect(definition).toContain('config: {');
      expect(definition).toContain('timeout: 5000,');
      expect(definition).toContain('retries: 3');

      await expectCredentialDefinitionSnapshots({ credentialId, ...complexCredential }, definition);
    });

    it.only('should handle different data types in retrieval params', async () => {
      const credentialId = 'mixed';
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

      const definition = generateCredentialDefinition(credentialId, mixedParamsCredential);

      expect(definition).toContain("key: 'API_KEY',");
      expect(definition).toContain('port: 3000,');
      expect(definition).toContain('enabled: true,');
      expect(definition).toContain('timeout: 30.5');

      await expectCredentialDefinitionSnapshots(
        { credentialId, ...mixedParamsCredential },
        definition
      );
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in credential ID', async () => {
      const credentialId = 'api-key_v2';
      const specialCharactersData = {
        name: 'API Key V2',
        type: 'env',
        credentialStoreId: 'env-default',
      };
      const definition = generateCredentialDefinition(credentialId, specialCharactersData);

      expect(definition).toContain('export const apiKeyV2 = credential({');
      expect(definition).toContain("id: 'api-key_v2',");

      await expectCredentialDefinitionSnapshots({credentialId, ...specialCharactersData}, definition);
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
      expect(definition).toContain("key: 'API_KEY'");
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
