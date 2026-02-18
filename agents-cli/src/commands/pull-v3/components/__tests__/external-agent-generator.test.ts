// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for external agent generator
 */

import { generateExternalAgentDefinition as generateExternalAgentDefinitionV4 } from '../../../pull-v4/external-agent-generator';
import type { ComponentRegistry } from '../../utils/component-registry';
import {
  generateExternalAgentDefinition,
  generateExternalAgentFile,
  generateExternalAgentImports,
} from '../external-agent-generator';

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
  getImportsForFile(_filePath, _components) {
    // Mock implementation returns empty array
    return [];
  },
} satisfies Partial<ComponentRegistry>;

describe('External Agent Generator', () => {
  const basicExternalAgentData = {
    name: 'Weather API Agent',
    description: 'External agent for weather information and forecasting',
    baseUrl: 'https://api.weather.com/v1/agents/weather',
  };

  const complexExternalAgentData = {
    name: 'Complex External Agent',
    description: 'A complex external agent with credential references and advanced configuration',
    baseUrl: 'https://external-system.example.com/agents/complex',
    credentialReference: {
      id: 'weather-api-credentials',
      name: 'Weather API Credentials',
      description: 'API credentials for weather service',
    },
  };

  const expectExternalAgentDefinitionSnapshots = async (
    externalAgentId: string,
    externalAgentData: Omit<
      Parameters<typeof generateExternalAgentDefinitionV4>[0],
      'externalAgentId'
    >,
    definition: string
  ) => {
    const testName = expect.getState().currentTestName;
    await expect(definition).toMatchFileSnapshot(`__snapshots__/external-agent/${testName}.txt`);
    const definitionV4 = generateExternalAgentDefinitionV4({
      externalAgentId,
      ...externalAgentData,
    });
    await expect(definitionV4).toMatchFileSnapshot(
      `__snapshots__/external-agent/${testName}-v4.txt`
    );
  };

  describe('generateExternalAgentImports', () => {
    it('should generate basic imports', () => {
      const imports = generateExternalAgentImports('weather-agent', basicExternalAgentData);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { externalAgent } from '@inkeep/agents-sdk';");
    });

    // it('should handle different code styles', () => {
    //   const imports = generateExternalAgentImports('test-agent', basicExternalAgentData, {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(imports[0]).toBe('import { externalAgent } from "@inkeep/agents-sdk"');
    // });
  });

  describe('generateExternalAgentDefinition', () => {
    it.only('should generate basic external agent definition', async () => {
      const externalAgentId = 'weather-agent';
      const definition = generateExternalAgentDefinition(externalAgentId, basicExternalAgentData);

      expect(definition).toContain('export const weatherAgent = externalAgent({');
      expect(definition).toContain("id: 'weather-agent',");
      expect(definition).toContain("name: 'Weather API Agent',");
      expect(definition).toContain(
        "description: 'External agent for weather information and forecasting',"
      );
      expect(definition).toContain("baseUrl: 'https://api.weather.com/v1/agents/weather'");
      expect(definition).toContain('});');
      expect(definition).not.toContain('credentialReference:');

      await expectExternalAgentDefinitionSnapshots(
        externalAgentId,
        basicExternalAgentData,
        definition
      );
    });

    it.only('should generate external agent with credential reference object', async () => {
      const externalAgentId = 'complex-agent';
      const definition = generateExternalAgentDefinition(externalAgentId, complexExternalAgentData);

      expect(definition).toContain('export const complexAgent = externalAgent({');
      expect(definition).toContain('credentialReference: {');
      expect(definition).toContain("id: 'weather-api-credentials',");
      expect(definition).toContain("name: 'Weather API Credentials',");
      expect(definition).toContain("description: 'API credentials for weather service'");
      expect(definition).toContain('}');
      expect(definition).not.toContain("description: 'API credentials for weather service',"); // No trailing comma

      await expectExternalAgentDefinitionSnapshots(
        externalAgentId,
        complexExternalAgentData,
        definition
      );
    });

    it.only('should generate external agent with credential reference variable', async () => {
      const dataWithCredRef = {
        ...basicExternalAgentData,
        credentialReference: 'myCredentials',
      };
      const externalAgentId = 'cred-ref-agent';

      const definition = generateExternalAgentDefinition(
        externalAgentId,
        dataWithCredRef,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('export const credRefAgent = externalAgent({');
      expect(definition).toContain('credentialReference: myCredentials');
      expect(definition).not.toContain('credentialReference: {');

      await expectExternalAgentDefinitionSnapshots(externalAgentId, dataWithCredRef, definition);
    });

    it('should throw error for missing required fields', () => {
      const minimalData = {
        baseUrl: 'https://api.example.com/agent',
      };

      expect(() => {
        generateExternalAgentDefinition('minimal-agent', minimalData);
      }).toThrow("Missing required fields for external agent 'minimal-agent': name");
    });

    it('should throw error for missing name only', () => {
      const noNameData = {
        description: 'Test external agent',
        baseUrl: 'https://api.example.com/test',
      };

      expect(() => {
        generateExternalAgentDefinition('fallback-agent', noNameData);
      }).toThrow("Missing required fields for external agent 'fallback-agent': name");
    });

    it.only('should handle multiline descriptions', async () => {
      const externalAgentId = 'multiline-agent';
      const multilineData = {
        name: 'Multiline Agent',
        description:
          'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings\nIt even contains newlines which should trigger multiline formatting',
        baseUrl: 'https://api.example.com/multiline',
      };

      const definition = generateExternalAgentDefinition(externalAgentId, multilineData);

      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('It even contains newlines');

      await expectExternalAgentDefinitionSnapshots(externalAgentId, multilineData, definition);
    });

    // it('should handle different code styles', () => {
    //   const definition = generateExternalAgentDefinition('styled-agent', basicExternalAgentData, {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(definition).toContain('export const styledAgent = externalAgent({');
    //   expect(definition).toContain('id: "styled-agent",'); // Double quotes
    //   expect(definition).toContain('name: "Weather API Agent",');
    //   expect(definition).not.toContain(';'); // No semicolons except at the end
    //   expect(definition).toContain('})'); // No semicolon at the end
    // });

    it('should throw error for empty string required fields', () => {
      const emptyStringData = {
        name: '',
        description: '',
        baseUrl: 'https://api.example.com/empty',
      };

      expect(() => {
        generateExternalAgentDefinition('empty-strings-agent', emptyStringData);
      }).toThrow("Missing required fields for external agent 'empty-strings-agent': name");
    });

    it('should not throw error when name and baseUrl are provided (description is optional)', () => {
      const nullData = {
        name: 'Test External Agent',
        description: null,
        baseUrl: 'https://api.example.com/test',
      };

      expect(() => {
        generateExternalAgentDefinition('null-values-agent', nullData);
      }).not.toThrow();
    });

    it.only('should handle partial credential reference objects', async () => {
      const externalAgentId = 'partial-cred-agent';
      const partialCredData = {
        name: 'Partial Cred Agent',
        description: 'Agent with partial credential reference',
        baseUrl: 'https://api.example.com/partial',
        credentialReference: {
          id: 'partial-cred',
          // Missing name and description
        },
      };

      const definition = generateExternalAgentDefinition(externalAgentId, partialCredData);

      expect(definition).toContain('credentialReference: {');
      expect(definition).toContain("id: 'partial-cred'");
      expect(definition).not.toContain("name: 'Full API Credentials'"); // Should not contain credential name
      expect(definition).not.toContain("description: 'Complete API credentials'"); // Should not contain credential description
      expect(definition).not.toContain("id: 'partial-cred',"); // No trailing comma on last property

      await expectExternalAgentDefinitionSnapshots(externalAgentId, partialCredData, definition);
    });
  });

  describe('generateExternalAgentFile', () => {
    it.only('should generate complete external agent file', async () => {
      const externalAgentId = 'weather-agent';
      const file = generateExternalAgentFile(externalAgentId, basicExternalAgentData);

      expect(file).toContain("import { externalAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const weatherAgent = externalAgent({');
      expect(file).toContain("baseUrl: 'https://api.weather.com/v1/agents/weather'");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);

      await expectExternalAgentDefinitionSnapshots(
        externalAgentId,
        basicExternalAgentData,
        file.trimEnd()
      );
    });

    it.only('should generate complex external agent file with all features', async () => {
      const externalAgentId = 'complex-agent';
      const file = generateExternalAgentFile(externalAgentId, complexExternalAgentData);

      expect(file).toContain("import { externalAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const complexAgent = externalAgent({');
      expect(file).toContain('credentialReference: {');
      expect(file).toContain("id: 'weather-api-credentials',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);

      await expectExternalAgentDefinitionSnapshots(
        externalAgentId,
        complexExternalAgentData,
        file.trimEnd()
      );
    });
  });

  describe('compilation tests', () => {
    it('should generate external agent code that compiles', () => {
      const definition = generateExternalAgentDefinition(
        'test-external-agent',
        basicExternalAgentData
      );
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const externalAgent = (config) => config;
        
        ${definitionWithoutExport}
        
        return testExternalAgent;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.id).toBe('test-external-agent');
      expect(result.name).toBe('Weather API Agent');
      expect(result.description).toBe('External agent for weather information and forecasting');
      expect(result.baseUrl).toBe('https://api.weather.com/v1/agents/weather');
    });

    it('should generate complex external agent code that compiles', () => {
      const definition = generateExternalAgentDefinition(
        'complex-test-external-agent',
        complexExternalAgentData
      );
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const externalAgent = (config) => config;
        
        ${definitionWithoutExport}
        
        return complexTestExternalAgent;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.id).toBe('complex-test-external-agent');
      expect(result.credentialReference).toBeDefined();
      expect(result.credentialReference.id).toBe('weather-api-credentials');
      expect(result.credentialReference.name).toBe('Weather API Credentials');
      expect(result.credentialReference.description).toBe('API credentials for weather service');
    });

    it('should throw error when trying to generate minimal external agent without required fields', () => {
      const minimalData = { baseUrl: 'https://api.minimal.com/agent' };

      expect(() => {
        generateExternalAgentDefinition('minimal-test-external-agent', minimalData);
      }).toThrow("Missing required fields for external agent 'minimal-test-external-agent': name");
    });
  });

  describe('edge cases', () => {
    // it('should handle special characters in external agent IDs', () => {
    //   const definition = generateExternalAgentDefinition(
    //     'external-agent-v2_final',
    //     basicExternalAgentData
    //   );
    //
    //   expect(definition).toContain('export const externalAgentV2Final = externalAgent({');
    //   expect(definition).toContain("id: 'external-agent-v2_final',");
    // });

    // it('should handle external agent ID starting with numbers', () => {
    //   const definition = generateExternalAgentDefinition(
    //     '2nd-generation-external-agent',
    //     basicExternalAgentData
    //   );
    //
    //   expect(definition).toContain('export const _2ndGenerationExternalAgent = externalAgent({');
    //   expect(definition).toContain("id: '2nd-generation-external-agent',");
    // });

    it.only('should handle complex credential reference with all properties', async () => {
      const externalAgentId = 'full-cred-agent';
      const complexCredData = {
        name: 'Full Cred Agent',
        description: 'Agent with full credential reference',
        baseUrl: 'https://api.example.com/full',
        credentialReference: {
          id: 'full-credentials',
          name: 'Full API Credentials',
          description: 'Complete API credentials with all properties',
        },
      };

      const definition = generateExternalAgentDefinition(externalAgentId, complexCredData);

      expect(definition).toContain('credentialReference: {');
      expect(definition).toContain("id: 'full-credentials',");
      expect(definition).toContain("name: 'Full API Credentials',");
      expect(definition).toContain("description: 'Complete API credentials with all properties'");
      expect(definition).not.toContain(
        "description: 'Complete API credentials with all properties',"
      ); // No trailing comma
      expect(definition).toContain('}');

      await expectExternalAgentDefinitionSnapshots(externalAgentId, complexCredData, definition);
    });

    it.only('should handle URLs with special characters', async () => {
      const externalAgentId = 'special-url-agent';
      const specialUrlData = {
        name: 'Special URL Agent',
        description: 'Agent with special characters in URL',
        baseUrl: 'https://api.example.com/v1/agents/special?param=value&other=123',
      };

      const definition = generateExternalAgentDefinition(externalAgentId, specialUrlData);

      expect(definition).toContain(
        "baseUrl: 'https://api.example.com/v1/agents/special?param=value&other=123'"
      );

      await expectExternalAgentDefinitionSnapshots(externalAgentId, specialUrlData, definition);
    });

    it('should throw error for empty external agent data', () => {
      expect(() => {
        generateExternalAgentDefinition('empty-agent', {});
      }).toThrow("Missing required fields for external agent 'empty-agent': name, baseUrl");
    });

    it('should not throw error for missing description (now optional)', () => {
      const missingDescData = {
        name: 'Test Agent',
        baseUrl: 'https://api.example.com/test',
      };

      expect(() => {
        generateExternalAgentDefinition('missing-desc-agent', missingDescData);
      }).not.toThrow();
    });

    it('should throw error for missing baseUrl only', () => {
      const missingUrlData = {
        name: 'Test Agent',
        description: 'Test description',
      };

      expect(() => {
        generateExternalAgentDefinition('missing-url-agent', missingUrlData);
      }).toThrow("Missing required fields for external agent 'missing-url-agent': baseUrl");
    });
  });
});
