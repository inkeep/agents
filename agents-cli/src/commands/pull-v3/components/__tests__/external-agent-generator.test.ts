/**
 * Unit tests for external agent generator
 */

import { describe, it, expect } from 'vitest';
import { 
  generateExternalAgentDefinition,
  generateExternalAgentImports,
  generateExternalAgentFile
} from '../external-agent-generator';

describe('External Agent Generator', () => {
  const basicExternalAgentData = {
    name: 'Weather API Agent',
    description: 'External agent for weather information and forecasting',
    baseUrl: 'https://api.weather.com/v1/agents/weather'
  };

  const complexExternalAgentData = {
    name: 'Complex External Agent',
    description: 'A complex external agent with credential references and advanced configuration',
    baseUrl: 'https://external-system.example.com/agents/complex',
    credentialReference: {
      id: 'weather-api-credentials',
      name: 'Weather API Credentials',
      description: 'API credentials for weather service'
    }
  };

  describe('generateExternalAgentImports', () => {
    it('should generate basic imports', () => {
      const imports = generateExternalAgentImports('weather-agent', basicExternalAgentData);
      
      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { externalAgent } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateExternalAgentImports('test-agent', basicExternalAgentData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      });
      
      expect(imports[0]).toBe('import { externalAgent } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateExternalAgentDefinition', () => {
    it('should generate basic external agent definition', () => {
      const definition = generateExternalAgentDefinition('weather-agent', basicExternalAgentData);
      
      expect(definition).toContain('export const weatherAgent = externalAgent({');
      expect(definition).toContain("id: 'weather-agent',");
      expect(definition).toContain("name: 'Weather API Agent',");
      expect(definition).toContain("description: 'External agent for weather information and forecasting',");
      expect(definition).toContain("baseUrl: 'https://api.weather.com/v1/agents/weather'");
      expect(definition).toContain('});');
      expect(definition).not.toContain('credentialReference:');
    });

    it('should generate external agent with credential reference object', () => {
      const definition = generateExternalAgentDefinition('complex-agent', complexExternalAgentData);
      
      expect(definition).toContain('export const complexAgent = externalAgent({');
      expect(definition).toContain('credentialReference: {');
      expect(definition).toContain("id: 'weather-api-credentials',");
      expect(definition).toContain("name: 'Weather API Credentials',");
      expect(definition).toContain("description: 'API credentials for weather service'");
      expect(definition).toContain('}');
      expect(definition).not.toContain('description: \'API credentials for weather service\','); // No trailing comma
    });

    it('should generate external agent with credential reference variable', () => {
      const dataWithCredRef = {
        ...basicExternalAgentData,
        credentialReference: 'myCredentials'
      };
      
      const definition = generateExternalAgentDefinition('cred-ref-agent', dataWithCredRef);
      
      expect(definition).toContain('export const credRefAgent = externalAgent({');
      expect(definition).toContain('credentialReference: myCredentials');
      expect(definition).not.toContain('credentialReference: {');
    });

    it('should handle external agent without optional fields', () => {
      const minimalData = {
        baseUrl: 'https://api.example.com/agent'
      };
      
      const definition = generateExternalAgentDefinition('minimal-agent', minimalData);
      
      expect(definition).toContain('export const minimalAgent = externalAgent({');
      expect(definition).toContain("id: 'minimal-agent',");
      expect(definition).toContain("name: 'minimal-agent',"); // Uses ID as fallback
      expect(definition).toContain("description: 'External agent minimal-agent',"); // Default description
      expect(definition).toContain("baseUrl: 'https://api.example.com/agent'");
      expect(definition).not.toContain('credentialReference:');
    });

    it('should use agent ID as name fallback', () => {
      const noNameData = {
        description: 'Test external agent',
        baseUrl: 'https://api.example.com/test'
      };
      
      const definition = generateExternalAgentDefinition('fallback-agent', noNameData);
      
      expect(definition).toContain("id: 'fallback-agent',");
      expect(definition).toContain("name: 'fallback-agent',");
      expect(definition).toContain("description: 'Test external agent',");
    });

    it('should handle camelCase conversion for variable names', () => {
      const definition = generateExternalAgentDefinition('my-complex-external-agent_v2', basicExternalAgentData);
      
      expect(definition).toContain('export const myComplexExternalAgentV2 = externalAgent({');
    });

    it('should handle multiline descriptions', () => {
      const multilineData = {
        name: 'Multiline Agent',
        description: 'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings\\nIt even contains newlines which should trigger multiline formatting',
        baseUrl: 'https://api.example.com/multiline'
      };
      
      const definition = generateExternalAgentDefinition('multiline-agent', multilineData);
      
      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('It even contains newlines');
    });

    it('should handle different code styles', () => {
      const definition = generateExternalAgentDefinition('styled-agent', basicExternalAgentData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      });
      
      expect(definition).toContain('export const styledAgent = externalAgent({');
      expect(definition).toContain('id: "styled-agent",'); // Double quotes
      expect(definition).toContain('name: "Weather API Agent",');
      expect(definition).not.toContain(';'); // No semicolons except at the end
      expect(definition).toContain('})'); // No semicolon at the end
    });

    it('should handle empty string values', () => {
      const emptyStringData = {
        name: '',
        description: '',
        baseUrl: 'https://api.example.com/empty'
      };
      
      const definition = generateExternalAgentDefinition('empty-strings-agent', emptyStringData);
      
      expect(definition).toContain("name: '',");
      expect(definition).toContain("description: '',");
      expect(definition).toContain("baseUrl: 'https://api.example.com/empty'");
    });

    it('should handle null and undefined values gracefully', () => {
      const nullData = {
        name: 'Test External Agent',
        description: null,
        baseUrl: undefined,
        credentialReference: undefined
      };
      
      const definition = generateExternalAgentDefinition('null-values-agent', nullData);
      
      expect(definition).toContain("name: 'Test External Agent',");
      expect(definition).toContain("description: 'External agent null-values-agent'"); // Uses default, no comma on last line
      expect(definition).not.toContain('baseUrl:'); // Undefined baseUrl is omitted
      expect(definition).not.toContain('credentialReference:');
    });

    it('should handle partial credential reference objects', () => {
      const partialCredData = {
        name: 'Partial Cred Agent',
        description: 'Agent with partial credential reference',
        baseUrl: 'https://api.example.com/partial',
        credentialReference: {
          id: 'partial-cred'
          // Missing name and description
        }
      };
      
      const definition = generateExternalAgentDefinition('partial-cred-agent', partialCredData);
      
      expect(definition).toContain('credentialReference: {');
      expect(definition).toContain("id: 'partial-cred'");
      expect(definition).not.toContain('name: \'Full API Credentials\''); // Should not contain credential name
      expect(definition).not.toContain('description: \'Complete API credentials\''); // Should not contain credential description
      expect(definition).not.toContain("id: 'partial-cred',"); // No trailing comma on last property
    });
  });

  describe('generateExternalAgentFile', () => {
    it('should generate complete external agent file', () => {
      const file = generateExternalAgentFile('weather-agent', basicExternalAgentData);
      
      expect(file).toContain("import { externalAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const weatherAgent = externalAgent({');
      expect(file).toContain("baseUrl: 'https://api.weather.com/v1/agents/weather'");
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });

    it('should generate complex external agent file with all features', () => {
      const file = generateExternalAgentFile('complex-agent', complexExternalAgentData);
      
      expect(file).toContain("import { externalAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const complexAgent = externalAgent({');
      expect(file).toContain('credentialReference: {');
      expect(file).toContain("id: 'weather-api-credentials',");
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate external agent code that compiles', () => {
      const definition = generateExternalAgentDefinition('test-external-agent', basicExternalAgentData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const externalAgent = (config) => config;
        
        ${definitionWithoutExport}
        
        return testExternalAgent;
      `;
      
      let result;
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
      const definition = generateExternalAgentDefinition('complex-test-external-agent', complexExternalAgentData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const externalAgent = (config) => config;
        
        ${definitionWithoutExport}
        
        return complexTestExternalAgent;
      `;
      
      let result;
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

    it('should generate minimal external agent code that compiles', () => {
      const minimalData = { baseUrl: 'https://api.minimal.com/agent' };
      const definition = generateExternalAgentDefinition('minimal-test-external-agent', minimalData);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const externalAgent = (config) => config;
        
        ${definitionWithoutExport}
        
        return minimalTestExternalAgent;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('minimal-test-external-agent');
      expect(result.name).toBe('minimal-test-external-agent');
      expect(result.description).toBe('External agent minimal-test-external-agent');
      expect(result.baseUrl).toBe('https://api.minimal.com/agent');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in external agent IDs', () => {
      const definition = generateExternalAgentDefinition('external-agent-v2_final', basicExternalAgentData);
      
      expect(definition).toContain('export const externalAgentV2Final = externalAgent({');
      expect(definition).toContain("id: 'external-agent-v2_final',");
    });

    it('should handle external agent ID starting with numbers', () => {
      const definition = generateExternalAgentDefinition('2nd-generation-external-agent', basicExternalAgentData);
      
      expect(definition).toContain('export const _2ndGenerationExternalAgent = externalAgent({');
      expect(definition).toContain("id: '2nd-generation-external-agent',");
    });

    it('should handle complex credential reference with all properties', () => {
      const complexCredData = {
        name: 'Full Cred Agent',
        description: 'Agent with full credential reference',
        baseUrl: 'https://api.example.com/full',
        credentialReference: {
          id: 'full-credentials',
          name: 'Full API Credentials',
          description: 'Complete API credentials with all properties'
        }
      };
      
      const definition = generateExternalAgentDefinition('full-cred-agent', complexCredData);
      
      expect(definition).toContain('credentialReference: {');
      expect(definition).toContain("id: 'full-credentials',");
      expect(definition).toContain("name: 'Full API Credentials',");
      expect(definition).toContain("description: 'Complete API credentials with all properties'");
      expect(definition).not.toContain("description: 'Complete API credentials with all properties',"); // No trailing comma
      expect(definition).toContain('}');
    });

    it('should handle URLs with special characters', () => {
      const specialUrlData = {
        name: 'Special URL Agent',
        description: 'Agent with special characters in URL',
        baseUrl: 'https://api.example.com/v1/agents/special?param=value&other=123'
      };
      
      const definition = generateExternalAgentDefinition('special-url-agent', specialUrlData);
      
      expect(definition).toContain("baseUrl: 'https://api.example.com/v1/agents/special?param=value&other=123'");
    });
  });
});