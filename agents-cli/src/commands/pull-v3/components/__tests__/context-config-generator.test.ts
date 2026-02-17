// biome-ignore-all lint/security/noGlobalEval: allow in test
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: allow in test
/**
 * Unit tests for context config generator
 */

import { generateContextConfigDefinition as generateContextConfigDefinitionV4 } from '../../../pull-v4/context-config-generator';
import type { ComponentRegistry } from '../../utils/component-registry';
import {
  generateContextConfigDefinition,
  generateContextConfigFile,
  generateFetchDefinitionDefinition,
  generateHeadersDefinition,
} from '../context-config-generator';

// Mock registry for tests
const mockRegistry = {
  getVariableName(id, _type) {
    // If already camelCase, return as-is, otherwise convert
    if (!/[-_]/.test(id)) {
      return id;
    }
    // Convert kebab-case or snake_case to camelCase
    return id
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^[0-9]/, '_$&');
  },
} satisfies Partial<ComponentRegistry>;

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
      url: 'https://api.example.com/users/${headers.toTemplate("user_id")}',
      method: 'GET',
      headers: {
        Authorization: 'Bearer ${headers.toTemplate("api_key")}',
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
    it('should generate correct headers definition', () => {
      const definition = generateHeadersDefinition('personalAgentHeaders', headersData);

      expect(definition).toContain('const personalAgentHeaders = headers({');
      expect(definition).toContain('schema: z.object({');
      expect(definition).toContain('"user_id": z.string()');
      expect(definition).toContain('"api_key": z.string()');
      expect(definition).toContain('});');
    });

    // it('should handle different code styles', () => {
    //   const definition = generateHeadersDefinition('test', headersData, {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(definition).toContain('const test = headers({');
    //   expect(definition).not.toContain(';');
    // });

    it('should handle camelCase conversion', () => {
      const definition = generateHeadersDefinition('personal-agent-headers', headersData);

      expect(definition).toContain('const personalAgentHeaders = headers({');
    });
  });

  describe('generateFetchDefinitionDefinition', () => {
    it('should generate correct fetch definition', () => {
      const definition = generateFetchDefinitionDefinition('userFetcher', fetchData);

      expect(definition).toContain('const userFetcher = fetchDefinition({');
      expect(definition).toContain("id: 'user-info',");
      expect(definition).toContain("name: 'User Information',");
      expect(definition).toContain("trigger: 'initialization',");
      expect(definition).toContain('fetchConfig: {');
      expect(definition).toContain(
        'url: \'https://api.example.com/users/${headers.toTemplate("user_id")}\','
      );
      expect(definition).toContain("method: 'GET',");
      expect(definition).toContain('responseSchema: z.object({');
      expect(definition).toContain("defaultValue: 'Unable to fetch user information'");
      expect(definition).toContain('});');
    });

    it('should handle minimal fetch definition', () => {
      const minimalData = {
        id: 'simple-fetch',
        fetchConfig: {
          url: 'https://api.example.com/data',
          method: 'GET',
        },
      };

      const definition = generateFetchDefinitionDefinition('simpleFetch', minimalData);

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

      const definition = generateFetchDefinitionDefinition('complexFetch', complexData);

      expect(definition).toContain('fetchConfig: {');
      expect(definition).toContain("'Content-Type': 'application/json',");
      expect(definition).toContain("Authorization: 'Bearer token'");
      expect(definition).toContain('body: {');
      expect(definition).toContain("query: 'test',");
      expect(definition).toContain('limit: 10');
    });
  });

  describe('generateContextConfigDefinition', () => {
    it.only('should generate correct context config definition', async () => {
      const contextConfigId = 'personalAgentContext';
      const definition = generateContextConfigDefinition(
        contextConfigId,
        contextData,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('const personalAgentContext = contextConfig({');
      expect(definition).toContain('headers: personalAgentHeaders,');
      expect(definition).toContain('contextVariables: {');
      expect(definition).toContain('user: userFetcher');
      expect(definition).toContain('});');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({ contextConfigId, ...contextData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });

    it.only('should handle context config without headers', async () => {
      const dataWithoutHeaders = {
        contextVariables: {
          config: 'someConfig',
          data: 'someData',
        },
      };

      const contextConfigId = 'simpleContext';
      const definition = generateContextConfigDefinition(
        contextConfigId,
        dataWithoutHeaders,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('const simpleContext = contextConfig({');
      expect(definition).not.toContain('headers:');
      expect(definition).toContain('contextVariables: {');
      expect(definition).toContain('config: someConfig,');
      expect(definition).toContain('data: someData');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({
        contextConfigId,
        ...dataWithoutHeaders,
      });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });

    it.only('should handle context config without contextVariables', async () => {
      const dataWithoutVariables = {
        headers: 'myHeaders',
      };

      const contextConfigId = 'headerOnlyContext';
      const definition = generateContextConfigDefinition(
        contextConfigId,
        dataWithoutVariables,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('const headerOnlyContext = contextConfig({');
      expect(definition).toContain('headers: myHeaders');
      expect(definition).not.toContain('contextVariables:');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({
        contextConfigId,
        ...dataWithoutVariables,
      });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });

    it.only('should handle empty context config', async () => {
      const contextConfigId = 'emptyContext';
      const definition = generateContextConfigDefinition(
        contextConfigId,
        {},
        undefined,
        mockRegistry
      );

      expect(definition).toContain('const emptyContext = contextConfig({');
      expect(definition).toContain('});');
      expect(definition).not.toContain('headers:');
      expect(definition).not.toContain('contextVariables:');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({ contextConfigId });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });
  });

  // describe('generateContextConfigImports', () => {
  // it('should generate basic imports', () => {
  //   // Use data that has schemas to trigger zod import
  //   const dataWithSchemas = {
  //     headers: 'personalAgentHeaders',
  //     headersSchema: { type: 'object' }, // This will trigger zod import
  //     contextVariables: {
  //       user: 'userFetcher',
  //     },
  //   };
  //   const imports = generateContextConfigImports('test', dataWithSchemas);
  //
  //   // Since contextData has headers, it generates a combined import
  //   expect(imports).toContain("import { headers, contextConfig } from '@inkeep/agents-core';");
  //   expect(imports).toContain("import { z } from 'zod';");
  // });
  // it('should include headers import when needed', () => {
  //   const dataWithHeaders = {
  //     headers: 'myHeaders',
  //     headersSchema: { type: 'object' },
  //   };
  //
  //   const imports = generateContextConfigImports('test', dataWithHeaders);
  //
  //   expect(imports).toContain("import { headers, contextConfig } from '@inkeep/agents-core';");
  // });
  // it('should include fetchDefinition import when needed', () => {
  //   const dataWithFetch = {
  //     contextVariables: {
  //       user: {
  //         fetchConfig: { url: 'test' },
  //         responseSchema: { type: 'object' },
  //       },
  //     },
  //   };
  //
  //   const imports = generateContextConfigImports('test', dataWithFetch);
  //
  //   expect(imports).toContain(
  //     "import { fetchDefinition, contextConfig } from '@inkeep/agents-core';"
  //   );
  // });
  // it('should handle different code styles', () => {
  //   const imports = generateContextConfigImports('test', contextData, {
  //     quotes: 'double',
  //     semicolons: false,
  //     indentation: '    ',
  //   });
  //
  //   expect(imports[0]).toContain('import { headers, contextConfig } from "');
  //   expect(imports[0]).not.toContain(';');
  // });
  // });

  describe('generateContextConfigFile', () => {
    it.only('should generate complete context config file', async () => {
      const fullContextData = {
        headers: 'personalAgentHeaders',
        headersSchema: headersData.schema,
        contextVariables: {
          user: fetchData,
        },
      };

      const contextConfigId = 'personalAgentContext';
      const file = generateContextConfigFile(
        contextConfigId,
        fullContextData,
        undefined,
        mockRegistry
      );

      expect(file).toContain(
        "import { headers, fetchDefinition, contextConfig } from '@inkeep/agents-core';"
      );
      expect(file).toContain("import { z } from 'zod';");
      expect(file).toContain('const personalAgentHeaders = headers({');
      expect(file).toContain('const user = fetchDefinition({');
      expect(file).toContain('const personalAgentContext = contextConfig({');
      expect(file).toContain('export { personalAgentContext, personalAgentHeaders, user };');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*const/s);
      expect(file.endsWith('\n')).toBe(true);

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({
        contextConfigId,
        ...fullContextData,
      });
      await expect(file).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });

    it.only('should generate simple context config file', async () => {
      const simpleData = {
        contextVariables: {
          config: 'someValue',
        },
      };

      const contextConfigId = 'simpleContext';
      const file = generateContextConfigFile(contextConfigId, simpleData, undefined, mockRegistry);

      expect(file).toContain("import { contextConfig } from '@inkeep/agents-core';");
      expect(file).toContain('const simpleContext = contextConfig({');
      expect(file).toContain('export { simpleContext };');
      expect(file).not.toContain('headers');
      expect(file).not.toContain('fetchDefinition');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({ contextConfigId, ...simpleData });
      await expect(file).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });
  });

  describe('compilation tests', () => {
    it('should generate headers code that compiles', () => {
      const definition = generateHeadersDefinition('testHeaders', headersData);
      const definitionWithoutConst = definition.replace('const ', '');

      const moduleCode = `
        const headers = (config) => config;
        const z = {
          object: (schema) => ({ type: 'object', schema }),
          string: () => ({ type: 'string' })
        };
        
        const ${definitionWithoutConst}
        
        return testHeaders;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.schema).toBeDefined();
    });

    it('should generate fetch definition code that compiles', () => {
      const definition = generateFetchDefinitionDefinition('testFetch', fetchData);
      const definitionWithoutConst = definition.replace('const ', '');

      const moduleCode = `
        const fetchDefinition = (config) => config;
        const createChainable = (type) => ({
          type,
          optional: () => createChainable(type + '_optional'),
          describe: (desc) => createChainable(type + '_described')
        });
        const z = {
          object: (schema) => createChainable('object'),
          string: () => createChainable('string')
        };
        
        const ${definitionWithoutConst}
        
        return testFetch;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.id).toBe('user-info');
      expect(result.name).toBe('User Information');
      expect(result.fetchConfig).toBeDefined();
      expect(result.fetchConfig.url).toBeDefined();
    });

    it.only('should generate context config code that compiles', async () => {
      const contextConfigId = 'testContext';
      const definition = generateContextConfigDefinition(
        contextConfigId,
        contextData,
        undefined,
        mockRegistry
      );
      const definitionWithoutConst = definition.replace('const ', '');

      const moduleCode = `
        const contextConfig = (config) => config;
        const personalAgentHeaders = { type: 'headers' };
        const userFetcher = { type: 'fetcher' };
        
        const ${definitionWithoutConst}
        
        return testContext;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.headers).toBeDefined();
      expect(result.contextVariables).toBeDefined();
      expect(result.contextVariables.user).toBeDefined();

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({ contextConfigId, ...contextData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });
  });

  describe('edge cases', () => {
    // it('should handle special characters in IDs', () => {
    //   const definition = generateContextConfigDefinition(
    //     'context-config_v2',
    //     contextData,
    //     undefined,
    //     mockRegistry
    //   );
    //
    //   expect(definition).toContain('const contextConfigV2 = contextConfig({');
    // });

    it.only('should handle empty schemas', async () => {
      const emptySchemaData = {
        schema: {},
      };
      const contextConfigId = 'emptyHeaders';
      const definition = generateHeadersDefinition(contextConfigId, emptySchemaData);

      expect(definition).toContain('const emptyHeaders = headers({');
      expect(definition).toContain('schema: z.any()');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({
        contextConfigId,
        ...emptySchemaData,
      });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });

    it.only('should handle fetch definition with null and undefined values', async () => {
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
      const definition = generateFetchDefinitionDefinition('test', dataWithNulls);

      expect(definition).toContain("id: 'test',");
      expect(definition).toContain('fetchConfig: {');
      expect(definition).not.toContain('name:');
      expect(definition).not.toContain('trigger:');
      expect(definition).not.toContain('defaultValue:');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateContextConfigDefinitionV4({ contextConfigId, ...dataWithNulls });
      expect(definitionV4).toContain('fetchConfig: {');
      await expect(definition).toMatchFileSnapshot(`__snapshots__/context-config/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(
        `__snapshots__/context-config/${testName}-v4.txt`
      );
    });
  });
});
