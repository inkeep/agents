// biome-ignore-all lint/security/noGlobalEval: allow in test
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: allow in test
/**
 * Unit tests for context config generator
 */

import { generateContextConfigDefinition as originalGenerateContextConfigDefinition } from '../../../pull-v4/context-config-generator';
import { expectSnapshots } from '../../../pull-v4/utils';

function generateContextConfigDefinition(
  ...args: Parameters<typeof originalGenerateContextConfigDefinition>
): string {
  return originalGenerateContextConfigDefinition(...args).getFullText();
}

describe('Context Config Generator', () => {
  const headersData = {
    schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        api_key: { type: 'string' },
      },
      required: ['user_id', 'api_key'],
    },
  };

  const fetchData = {
    id: 'user-info',
    name: 'User Information',
    trigger: 'initialization',
    fetchConfig: {
      url: 'https://api.example.com/users/${headersSchema.toTemplate("user_id")}',
      method: 'GET',
      headers: {
        Authorization: 'Bearer ${headersSchema.toTemplate("api_key")}',
      },
      transform: 'user',
    },
    responseSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
    defaultValue: 'Unable to fetch user information',
  };

  const contextData = {
    headers: 'personalAgentHeaders',
    contextVariables: {
      user: 'userFetcher',
    },
  };

  describe('generateHeadersDefinition', () => {
    it('should generate correct headers definition', async () => {
      const definition = generateContextConfigDefinition({
        contextConfigId: 'personalAgentHeaders',
        ...headersData,
      });

      expect(definition).toContain('const personalAgentHeaders = headers({');
      expect(definition).toContain('schema: z.object({');
      expect(definition).toContain('"user_id": z.string()');
      expect(definition).toContain('"api_key": z.string()');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });
  });

  describe('generateFetchDefinitionDefinition', () => {
    it('should generate correct fetch definition', async () => {
      const definition = generateContextConfigDefinition({
        contextConfigId: 'userFetcher',
        ...fetchData,
      });

      expect(definition).toContain('const userFetcher = fetchDefinition({');
      expect(definition).toContain("id: 'user-info',");
      expect(definition).toContain("name: 'User Information',");
      expect(definition).toContain("trigger: 'initialization',");
      expect(definition).toContain('fetchConfig: {');
      expect(definition).toContain(
        `url: \`https://api.example.com/users/\${headersSchema.toTemplate("user_id")}\`,`
      );
      expect(definition).toContain("method: 'GET',");
      expect(definition).toContain('responseSchema: z.object({');
      expect(definition).toContain("defaultValue: 'Unable to fetch user information'");
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle minimal fetch definition', () => {
      const minimalData = {
        id: 'simple-fetch',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      const definition = generateContextConfigDefinition({
        contextConfigId: 'simpleFetch',
        ...minimalData,
      });

      expect(definition).toContain('const simpleFetch = fetchDefinition({');
      expect(definition).toContain("id: 'simple-fetch',");
      expect(definition).toContain('fetchConfig: {');
      expect(definition).toContain("url: 'https://api.example.com/data',");
      expect(definition).toContain("method: 'GET'");
      expect(definition).not.toContain('name:');
      expect(definition).not.toContain('trigger:');
      expect(definition).not.toContain('responseSchema:');
      expect(definition).not.toContain('defaultValue:');
    });

    it('should handle complex fetchConfig with nested objects', () => {
      const complexData = {
        id: 'complex-fetch',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
          },
          body: {
            query: 'test',
            limit: 10,
          },
        },
      };

      const definition = generateContextConfigDefinition({
        contextConfigId: 'complexFetch',
        ...complexData,
      });

      expect(definition).toContain('fetchConfig: {');
      expect(definition).toContain("'Content-Type': 'application/json',");
      expect(definition).toContain("Authorization: 'Bearer token'");
      expect(definition).toContain('body: {');
      expect(definition).toContain("query: 'test',");
      expect(definition).toContain('limit: 10');
    });
  });

  describe('generateContextConfigDefinition', () => {
    it('should generate correct context config definition', async () => {
      const contextConfigId = 'personalAgentContext';
      const definition = generateContextConfigDefinition({
        contextConfigId,
        ...contextData,
      });

      expect(definition).toContain('const personalAgentContext = contextConfig({');
      expect(definition).toContain('headers: personalAgentHeaders,');
      expect(definition).toContain('contextVariables: {');
      expect(definition).toContain('user: userFetcher');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should handle context config without headers', async () => {
      const dataWithoutHeaders = {
        contextVariables: {
          config: 'someConfig',
          data: 'someData',
        },
      };

      const contextConfigId = 'simpleContext';
      const definition = generateContextConfigDefinition({
        contextConfigId,
        ...dataWithoutHeaders,
      });

      expect(definition).toContain('const simpleContext = contextConfig({');
      expect(definition).not.toContain('headers:');
      expect(definition).toContain('contextVariables: {');
      expect(definition).toContain('config: someConfig,');
      expect(definition).toContain('data: someData');
      await expectSnapshots(definition);
    });

    it('should handle context config without contextVariables', async () => {
      const dataWithoutVariables = {
        headers: 'myHeaders',
      };

      const contextConfigId = 'headerOnlyContext';
      const definition = generateContextConfigDefinition({
        contextConfigId,
        ...dataWithoutVariables,
      });

      expect(definition).toContain('const headerOnlyContext = contextConfig({');
      expect(definition).toContain('headers: myHeaders');
      expect(definition).not.toContain('contextVariables:');
      await expectSnapshots(definition);
    });

    it('should handle empty context config', async () => {
      const contextConfigId = 'emptyContext';
      const definition = generateContextConfigDefinition({ contextConfigId });

      expect(definition).toContain('const emptyContext = contextConfig({');
      expect(definition).toContain('});');
      expect(definition).not.toContain('headers:');
      expect(definition).not.toContain('contextVariables:');
      await expectSnapshots(definition);
    });
  });

  describe('generateContextConfigFile', () => {
    it('should generate complete context config file', async () => {
      const fullContextData = {
        headers: 'personalAgentHeaders',
        headersSchema: headersData.schema,
        contextVariables: {
          user: fetchData,
        },
      };

      const contextConfigId = 'personalAgentContext';
      const file = generateContextConfigDefinition({
        contextConfigId,
        ...fullContextData,
      });

      expect(file).toContain(
        "import { headers, fetchDefinition, contextConfig } from '@inkeep/agents-core';"
      );
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('const personalAgentHeaders = headers({');
      expect(file).toContain('const userInfo = fetchDefinition({');
      expect(file).toContain('export const personalAgentContext = contextConfig({');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*const/s);
      expect(file.endsWith('\n')).toBe(true);
      await expectSnapshots(file);
    });

    it('should generate simple context config file', async () => {
      const simpleData = {
        contextVariables: {
          config: 'someValue',
        },
      };

      const contextConfigId = 'simpleContext';
      const file = generateContextConfigDefinition({ contextConfigId, ...simpleData });

      expect(file).toContain("import { contextConfig } from '@inkeep/agents-core';");
      expect(file).toContain('export const simpleContext = contextConfig({');
      expect(file).not.toContain('headers');
      expect(file).not.toContain('fetchDefinition');
      await expectSnapshots(file);
    });
  });

  describe('edge cases', () => {
    it('should handle empty schemas', async () => {
      const emptySchemaData = {
        schema: {},
      };
      const contextConfigId = 'emptyHeaders';
      const definition = generateContextConfigDefinition({ contextConfigId, ...emptySchemaData });

      expect(definition).toContain('const emptyHeaders = headers({');
      expect(definition).toContain('schema: z.any()');
      await expectSnapshots(definition);
    });

    it('should handle fetch definition with null and undefined values', async () => {
      const dataWithNulls = {
        id: 'test',
        name: null,
        trigger: undefined,
        fetchConfig: {
          url: 'test',
          method: 'GET',
        },
        defaultValue: null,
      };
      const contextConfigId = 'test';
      const definition = generateContextConfigDefinition({ contextConfigId, ...dataWithNulls });

      expect(definition).toContain("id: 'test',");
      expect(definition).toContain('fetchConfig: {');
      expect(definition).not.toContain('name:');
      expect(definition).not.toContain('trigger:');
      expect(definition).not.toContain('defaultValue:');
      await expectSnapshots(definition);
    });
  });
});
