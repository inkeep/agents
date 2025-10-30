/**
 * Unit tests for sub-agent generator
 */

import { describe, it, expect } from 'vitest';
import { 
  generateSubAgentDefinition,
  generateSubAgentImports,
  generateSubAgentFile
} from '../sub-agent-generator';

// Mock registry for tests
const mockRegistry = {
  formatReferencesForCode: (refs: string[], type: string, style: any, indent: number) => {
    if (!refs || refs.length === 0) return '[]';
    if (refs.length === 1) return `[${refs[0]}]`;
    
    const indentStr = '  '.repeat(indent);
    const items = refs.map(ref => `${indentStr}${ref}`).join(',\n');
    return `[\n${items}\n${indentStr.slice(2)}]`;
  },
  getVariableName: (id: string, type?: string) => {
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
  getImportsForFile: (filePath: string, components: any[]) => {
    // Mock implementation returns empty array
    return [];
  },
  get: (id: string, type: string) => {
    // Mock implementation - always return something truthy for any request
    return { id, type };
  }
};

describe('Sub-Agent Generator', () => {
  const basicSubAgentData = {
    name: 'Personal Assistant',
    description: 'A personalized AI assistant.',
    prompt: 'Hello! I\'m your personal assistant.',
    canUse: [{ toolId: 'calculateBMI' }, { toolId: 'weatherTool' }],
    canDelegateTo: ['coordinatesAgent', 'teamAgent'],
    dataComponents: ['taskList'],
    artifactComponents: ['citation']
  };

  const complexSubAgentData = {
    name: 'Advanced Assistant',
    description: 'An advanced AI assistant with complex capabilities and step limits.',
    prompt: 'I am an advanced assistant ready to help you with complex tasks.\nI can handle multiple types of requests.',
    canUse: [{ toolId: 'tool1' }, { toolId: 'tool2' }, { toolId: 'tool3' }],
    canDelegateTo: ['agent1', 'agent2'],
    canTransferTo: ['legacyAgent'],
    dataComponents: ['component1', 'component2'],
    artifactComponents: ['artifact1'],
    stopWhen: {
      stepCountIs: 20
    }
  };

  describe('generateSubAgentImports', () => {
    it('should generate basic imports', () => {
      const imports = generateSubAgentImports('personal-assistant', basicSubAgentData);
      
      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { subAgent } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateSubAgentImports('test-agent', basicSubAgentData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      });
      
      expect(imports[0]).toBe('import { subAgent } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateSubAgentDefinition', () => {
    it('should generate basic sub-agent definition', () => {
      const definition = generateSubAgentDefinition('personal-assistant', basicSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const personalAssistant = subAgent({');
      expect(definition).toContain("id: 'personal-assistant',");
      expect(definition).toContain("name: 'Personal Assistant',");
      expect(definition).toContain("description: 'A personalized AI assistant.',");
      expect(definition).toContain("prompt: 'Hello! I\\'m your personal assistant.',");
      expect(definition).toContain('canUse: () => [');
      expect(definition).toContain('calculateBMI,');
      expect(definition).toContain('weatherTool');
      expect(definition).toContain('canDelegateTo: () => [');
      expect(definition).toContain('coordinatesAgent,');
      expect(definition).toContain('teamAgent');
      expect(definition).toContain('dataComponents: () => [taskList]');
      expect(definition).toContain('artifactComponents: () => [citation]');
      expect(definition).toContain('});');
    });

    it('should generate sub-agent with stopWhen configuration', () => {
      const definition = generateSubAgentDefinition('advanced-assistant', complexSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const advancedAssistant = subAgent({');
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 20 // Max tool calls + LLM responses');
      expect(definition).toContain('}');
    });

    it('should handle single item arrays in single line format', () => {
      const singleItemData = {
        name: 'Single Item Agent',
        canUse: [{ toolId: 'onlyTool' }],
        dataComponents: ['onlyComponent']
      };
      
      const definition = generateSubAgentDefinition('single-item-agent', singleItemData, undefined, mockRegistry);
      
      expect(definition).toContain('canUse: () => [onlyTool]');
      expect(definition).toContain('dataComponents: () => [onlyComponent]');
      expect(definition).not.toContain('canUse: () => [\n'); // Single line format
    });

    it('should handle multiple items in multi-line format', () => {
      const definition = generateSubAgentDefinition('multi-item-agent', complexSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('canUse: () => [');
      expect(definition).toContain('  tool1,');
      expect(definition).toContain('  tool2,');
      expect(definition).toContain('  tool3'); // Last one without comma
      expect(definition).toContain(']');
      expect(definition).not.toContain('tool3,');
    });

    it('should handle sub-agent without optional fields', () => {
      const minimalData = {
        name: 'Minimal Agent'
      };
      
      const definition = generateSubAgentDefinition('minimal-agent', minimalData, undefined, mockRegistry);
      
      expect(definition).toContain('export const minimalAgent = subAgent({');
      expect(definition).toContain("id: 'minimal-agent',");
      expect(definition).toContain("name: 'Minimal Agent'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('prompt:');
      expect(definition).not.toContain('canUse:');
      expect(definition).not.toContain('canDelegateTo:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');
      expect(definition).not.toContain('stopWhen:');
    });

    it('should use agent ID as name fallback', () => {
      const noNameData = {};
      
      const definition = generateSubAgentDefinition('fallback-agent', noNameData, undefined, mockRegistry);
      
      expect(definition).toContain("id: 'fallback-agent',");
      expect(definition).toContain("name: 'fallback-agent'");
    });

    it('should handle camelCase conversion for variable names', () => {
      const definition = generateSubAgentDefinition('my-complex-sub-agent_v2', basicSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const myComplexSubAgentV2 = subAgent({');
    });

    it('should handle multiline prompts and descriptions', () => {
      const multilineData = {
        name: 'Multiline Agent',
        description: 'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings',
        prompt: 'This is a very long prompt that should be handled as a multiline string\nIt even contains newlines which should trigger multiline formatting'
      };
      
      const definition = generateSubAgentDefinition('multiline-agent', multilineData, undefined, mockRegistry);
      
      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('prompt: `This is a very long prompt');
      expect(definition).toContain('It even contains newlines');
    });

    it('should handle different code styles', () => {
      const definition = generateSubAgentDefinition('styled-agent', basicSubAgentData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      }, mockRegistry);
      
      expect(definition).toContain('export const styledAgent = subAgent({');
      expect(definition).toContain('id: "styled-agent",'); // Double quotes
      expect(definition).toContain('name: "Personal Assistant",');
      expect(definition).not.toContain(';'); // No semicolons except at the end
      expect(definition).toContain('})'); // No semicolon at the end
    });

    it('should handle empty arrays', () => {
      const emptyArraysData = {
        name: 'Empty Arrays Agent',
        canUse: [],
        canDelegateTo: [],
        dataComponents: [],
        artifactComponents: []
      };
      
      const definition = generateSubAgentDefinition('empty-arrays-agent', emptyArraysData, undefined, mockRegistry);
      
      expect(definition).toContain("name: 'Empty Arrays Agent'");
      expect(definition).not.toContain('canUse:'); // Empty arrays should be omitted
      expect(definition).not.toContain('canDelegateTo:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');
    });

    it('should handle canTransferTo (legacy support)', () => {
      const transferData = {
        name: 'Transfer Agent',
        canTransferTo: ['legacyAgent1', 'legacyAgent2']
      };
      
      const definition = generateSubAgentDefinition('transfer-agent', transferData, undefined, mockRegistry);
      
      expect(definition).toContain('canTransferTo: () => [');
      expect(definition).toContain('legacyAgent1,');
      expect(definition).toContain('legacyAgent2');
      expect(definition).not.toContain('legacyAgent2,');
    });

    it('should not generate stopWhen without stepCountIs', () => {
      const noStepCountData = {
        name: 'No Step Count Agent',
        stopWhen: {
          someOtherProperty: 10
        }
      };
      
      const definition = generateSubAgentDefinition('no-step-agent', noStepCountData, undefined, mockRegistry);
      
      expect(definition).not.toContain('stopWhen:');
    });

    it('should handle stopWhen with only stepCountIs', () => {
      const stepCountOnlyData = {
        name: 'Step Count Only Agent',
        stopWhen: {
          stepCountIs: 15,
          otherProperty: 'ignored'
        }
      };
      
      const definition = generateSubAgentDefinition('step-count-agent', stepCountOnlyData, undefined, mockRegistry);
      
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 15 // Max tool calls + LLM responses');
      expect(definition).toContain('}');
      expect(definition).not.toContain('otherProperty');
    });
  });

  describe('generateSubAgentFile', () => {
    it('should generate complete sub-agent file', () => {
      const file = generateSubAgentFile('personal-assistant', basicSubAgentData, undefined, mockRegistry);
      
      expect(file).toContain("import { subAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const personalAssistant = subAgent({');
      expect(file).toContain('canUse: () => [');
      expect(file).toContain('calculateBMI,');
      expect(file).toContain('weatherTool');
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });

    it('should generate complex sub-agent file with all features', () => {
      const file = generateSubAgentFile('advanced-assistant', complexSubAgentData, undefined, mockRegistry);
      
      expect(file).toContain("import { subAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const advancedAssistant = subAgent({');
      expect(file).toContain('stopWhen: {');
      expect(file).toContain('canUse: () => [');
      expect(file).toContain('canDelegateTo: () => [');
      expect(file).toContain('canTransferTo: () => [');
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate sub-agent code that compiles', () => {
      const definition = generateSubAgentDefinition('test-sub-agent', basicSubAgentData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const subAgent = (config) => config;
        const calculateBMI = { type: 'functionTool' };
        const weatherTool = { type: 'mcpTool' };
        const coordinatesAgent = { type: 'subAgent' };
        const teamAgent = { type: 'subAgent' };
        const taskList = { type: 'dataComponent' };
        const citation = { type: 'artifactComponent' };
        
        ${definitionWithoutExport}
        
        return testSubAgent;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('test-sub-agent');
      expect(result.name).toBe('Personal Assistant');
      expect(result.canUse).toBeDefined();
      expect(typeof result.canUse).toBe('function');
      expect(result.canUse()).toHaveLength(2);
      expect(result.canDelegateTo()).toHaveLength(2);
    });

    it('should generate complex sub-agent code that compiles', () => {
      const definition = generateSubAgentDefinition('complex-test-sub-agent', complexSubAgentData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const subAgent = (config) => config;
        const tool1 = { type: 'tool' };
        const tool2 = { type: 'tool' };
        const tool3 = { type: 'tool' };
        const agent1 = { type: 'subAgent' };
        const agent2 = { type: 'subAgent' };
        const legacyAgent = { type: 'subAgent' };
        const component1 = { type: 'dataComponent' };
        const component2 = { type: 'dataComponent' };
        const artifact1 = { type: 'artifactComponent' };
        
        ${definitionWithoutExport}
        
        return complexTestSubAgent;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('complex-test-sub-agent');
      expect(result.stopWhen).toBeDefined();
      expect(result.stopWhen.stepCountIs).toBe(20);
      expect(result.canUse()).toHaveLength(3);
      expect(result.canDelegateTo()).toHaveLength(2);
      expect(result.canTransferTo()).toHaveLength(1);
      expect(result.dataComponents()).toHaveLength(2);
      expect(result.artifactComponents()).toHaveLength(1);
    });

    it('should generate minimal sub-agent code that compiles', () => {
      const minimalData = { name: 'Minimal Test Agent' };
      const definition = generateSubAgentDefinition('minimal-test-sub-agent', minimalData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const subAgent = (config) => config;
        
        ${definitionWithoutExport}
        
        return minimalTestSubAgent;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('minimal-test-sub-agent');
      expect(result.name).toBe('Minimal Test Agent');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in sub-agent IDs', () => {
      const definition = generateSubAgentDefinition('sub-agent-v2_final', basicSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const subAgentV2Final = subAgent({');
      expect(definition).toContain("id: 'sub-agent-v2_final',");
    });

    it('should handle sub-agent ID starting with numbers', () => {
      const definition = generateSubAgentDefinition('2nd-generation-sub-agent', basicSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const _2ndGenerationSubAgent = subAgent({');
      expect(definition).toContain("id: '2nd-generation-sub-agent',");
    });

    it('should handle empty string values', () => {
      const emptyStringData = {
        name: '',
        description: '',
        prompt: ''
      };
      
      const definition = generateSubAgentDefinition('empty-strings-sub-agent', emptyStringData, undefined, mockRegistry);
      
      expect(definition).toContain("name: '',");
      expect(definition).toContain("description: '',");
      expect(definition).toContain("prompt: ''"); // No trailing comma on last property
    });

    it('should handle null and undefined values gracefully', () => {
      const nullData = {
        name: 'Test Sub Agent',
        description: null,
        prompt: undefined,
        canUse: null,
        canDelegateTo: undefined,
        dataComponents: null,
        artifactComponents: undefined
      };
      
      const definition = generateSubAgentDefinition('null-values-sub-agent', nullData, undefined, mockRegistry);
      
      expect(definition).toContain("name: 'Test Sub Agent'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('prompt:');
      expect(definition).not.toContain('canUse:');
      expect(definition).not.toContain('canDelegateTo:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');
    });

    it('should handle large number of tools/agents with proper formatting', () => {
      const manyToolsData = {
        name: 'Many Tools Agent',
        canUse: [{ toolId: 'tool1' }, { toolId: 'tool2' }, { toolId: 'tool3' }, { toolId: 'tool4' }, { toolId: 'tool5' }, { toolId: 'tool6' }],
        canDelegateTo: ['agent1', 'agent2', 'agent3', 'agent4']
      };
      
      const definition = generateSubAgentDefinition('many-tools-sub-agent', manyToolsData, undefined, mockRegistry);
      
      expect(definition).toContain('canUse: () => [');
      expect(definition).toContain('  tool1,');
      expect(definition).toContain('  tool2,');
      expect(definition).toContain('  tool6'); // Last one without comma
      expect(definition).not.toContain('tool6,');
      
      expect(definition).toContain('canDelegateTo: () => [');
      expect(definition).toContain('  agent1,');
      expect(definition).toContain('  agent4'); // Last one without comma
      expect(definition).not.toContain('agent4,');
    });

    it('should handle mixed array and reference types', () => {
      const mixedData = {
        name: 'Mixed Types Agent',
        canUse: [{ toolId: 'stringTool' }],
        dataComponents: ['stringComponent']
      };
      
      const definition = generateSubAgentDefinition('mixed-types-sub-agent', mixedData, undefined, mockRegistry);
      
      expect(definition).toContain('canUse: () => [stringTool]');
      expect(definition).toContain('dataComponents: () => [stringComponent]');
    });
  });
});