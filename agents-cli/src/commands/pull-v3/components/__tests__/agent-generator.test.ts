/**
 * Unit tests for agent generator
 */

import { describe, it, expect } from 'vitest';
import { 
  generateAgentDefinition,
  generateAgentImports,
  generateAgentFile
} from '../agent-generator';

// Mock registry for tests
const mockRegistry = {
  formatReferencesForCode: (refs: string[], type: string, style: any, indent: number) => {
    if (!refs || refs.length === 0) return '[]';
    
    // Convert refs to proper variable names
    const variableRefs = refs.map(ref => {
      if (typeof ref === 'string') {
        // Convert to camelCase if needed
        if (!/[-_]/.test(ref)) {
          return ref;
        }
        return ref
          .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
          .replace(/[^a-zA-Z0-9]/g, '')
          .replace(/^[0-9]/, '_$&');
      }
      return ref;
    });
    
    if (variableRefs.length === 1) return `[${variableRefs[0]}]`;
    
    const indentStr = '  '.repeat(indent);
    const items = variableRefs.map(ref => `${indentStr}${ref}`).join(',\n');
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
  getAllComponents: () => {
    // Mock implementation returns empty array
    return [];
  }
};

describe('Agent Generator', () => {
  const basicAgentData = {
    name: 'Personal Assistant Agent',
    description: 'A personalized AI assistant for managing tasks and information',
    defaultSubAgent: 'personalAssistant',
    subAgents: ['personalAssistant', 'coordinatesAgent'],
    contextConfig: 'personalAgentContext'
  };

  const complexAgentData = {
    name: 'Complex Personal Agent',
    description: 'A complex agent with status updates and transfer limits',
    defaultSubAgent: 'mainAssistant',
    subAgents: ['mainAssistant', 'helperAgent', 'coordinatorAgent'],
    contextConfig: 'complexAgentContext',
    stopWhen: {
      transferCountIs: 5
    },
    statusUpdates: {
      numEvents: 3,
      timeInSeconds: 15,
      statusComponents: ['toolSummary.config', 'progressUpdate.config'],
      prompt: 'Provide status updates on task progress and tool usage'
    }
  };

  describe('generateAgentImports', () => {
    it('should generate basic imports', () => {
      const imports = generateAgentImports('personal-agent', basicAgentData);
      
      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { agent } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateAgentImports('test-agent', basicAgentData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      });
      
      expect(imports[0]).toBe('import { agent } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateAgentDefinition', () => {
    it('should generate basic agent definition', () => {
      const definition = generateAgentDefinition('personal-agent', basicAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const personalAgent = agent({');
      expect(definition).toContain("id: 'personal-agent',");
      expect(definition).toContain("name: 'Personal Assistant Agent',");
      expect(definition).toContain("description: 'A personalized AI assistant for managing tasks and information',");
      expect(definition).toContain('defaultSubAgent: personalAssistant,');
      expect(definition).toContain('subAgents: () => [');
      expect(definition).toContain('personalAssistant,');
      expect(definition).toContain('coordinatesAgent');
      expect(definition).toContain('contextConfig: personalAgentContext');
      expect(definition).toContain('});');
      expect(definition).not.toContain('coordinatesAgent,'); // No trailing comma
    });

    it('should generate agent with status updates', () => {
      const definition = generateAgentDefinition('complex-agent', complexAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const complexAgent = agent({');
      expect(definition).toContain('statusUpdates: {');
      expect(definition).toContain('numEvents: 3,');
      expect(definition).toContain('timeInSeconds: 15,');
      expect(definition).toContain('statusComponents: [');
      expect(definition).toContain('toolSummary.config,');
      expect(definition).toContain('progressUpdate.config');
      expect(definition).toContain("prompt: 'Provide status updates on task progress and tool usage'");
      expect(definition).toContain('},');
      expect(definition).not.toContain('progressUpdate.config,'); // No trailing comma
    });

    it('should generate agent with stopWhen configuration', () => {
      const definition = generateAgentDefinition('transfer-limited-agent', complexAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 5 // Max transfers in one conversation');
      expect(definition).toContain('},');
    });

    it('should handle single sub-agent', () => {
      const singleSubAgentData = {
        ...basicAgentData,
        subAgents: ['onlyAgent']
      };
      
      const definition = generateAgentDefinition('single-agent', singleSubAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('subAgents: () => [onlyAgent]');
      expect(definition).not.toContain('subAgents: () => [\n'); // Single line format
    });

    it('should handle agent without optional fields', () => {
      const minimalData = {
        name: 'Minimal Agent'
      };
      
      const definition = generateAgentDefinition('minimal-agent', minimalData, undefined, mockRegistry);
      
      expect(definition).toContain('export const minimalAgent = agent({');
      expect(definition).toContain("id: 'minimal-agent',");
      expect(definition).toContain("name: 'Minimal Agent'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('defaultSubAgent:');
      expect(definition).not.toContain('subAgents:');
      expect(definition).not.toContain('contextConfig:');
      expect(definition).not.toContain('statusUpdates:');
      expect(definition).not.toContain('stopWhen:');
    });

    it('should use agent ID as name fallback', () => {
      const noNameData = {};
      
      const definition = generateAgentDefinition('fallback-agent', noNameData, undefined, mockRegistry);
      
      expect(definition).toContain("id: 'fallback-agent',");
      expect(definition).toContain("name: 'fallback-agent'");
    });

    it('should handle camelCase conversion for agent variable names', () => {
      const definition = generateAgentDefinition('my-complex-agent_v2', basicAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const myComplexAgentV2 = agent({');
    });

    it('should handle multiline descriptions and prompts', () => {
      const multilineData = {
        name: 'Test Agent',
        description: 'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings',
        statusUpdates: {
          numEvents: 2,
          timeInSeconds: 10,
          statusComponents: ['status.config'],
          prompt: 'This is a very long prompt that should be handled as a multiline string\nIt even contains newlines which should trigger multiline formatting'
        }
      };
      
      const definition = generateAgentDefinition('multiline-agent', multilineData, undefined, mockRegistry);
      
      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('prompt: `This is a very long prompt');
      expect(definition).toContain('It even contains newlines');
    });

    it('should handle different code styles', () => {
      const definition = generateAgentDefinition('styled-agent', basicAgentData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      }, mockRegistry);
      
      expect(definition).toContain('export const styledAgent = agent({');
      expect(definition).toContain('id: "styled-agent",'); // Double quotes
      expect(definition).toContain('name: "Personal Assistant Agent",');
      expect(definition).not.toContain(';'); // No semicolons except at the end
      expect(definition).toContain('})'); // No semicolon at the end
    });

    it('should handle empty statusComponents array', () => {
      const emptyStatusData = {
        ...complexAgentData,
        statusUpdates: {
          numEvents: 3,
          timeInSeconds: 15,
          statusComponents: [],
          prompt: 'Test prompt'
        }
      };
      
      const definition = generateAgentDefinition('empty-status-agent', emptyStatusData, undefined, mockRegistry);
      
      expect(definition).toContain('statusUpdates: {');
      expect(definition).toContain('numEvents: 3,');
      expect(definition).toContain('timeInSeconds: 15,');
      expect(definition).toContain("prompt: 'Test prompt'");
      expect(definition).not.toContain('statusComponents:'); // Empty array should be omitted
    });

    it('should handle statusUpdates without all optional fields', () => {
      const partialStatusData = {
        name: 'Partial Status Agent',
        statusUpdates: {
          numEvents: 5,
          statusComponents: ['summary.config']
        }
      };
      
      const definition = generateAgentDefinition('partial-status-agent', partialStatusData, undefined, mockRegistry);
      
      expect(definition).toContain('statusUpdates: {');
      expect(definition).toContain('numEvents: 5,');
      expect(definition).toContain('statusComponents: [summary.config]');
      expect(definition).not.toContain('timeInSeconds:');
      expect(definition).not.toContain('prompt:');
    });

    it('should not generate stopWhen without transferCountIs', () => {
      const noTransferCountData = {
        name: 'No Transfer Count Agent',
        stopWhen: {
          someOtherProperty: 10
        }
      };
      
      const definition = generateAgentDefinition('no-transfer-agent', noTransferCountData, undefined, mockRegistry);
      
      expect(definition).not.toContain('stopWhen:');
    });
  });

  describe('generateAgentFile', () => {
    it('should generate complete agent file', () => {
      const file = generateAgentFile('personal-agent', basicAgentData, undefined, mockRegistry);
      
      expect(file).toContain("import { agent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const personalAgent = agent({');
      expect(file).toContain('contextConfig: personalAgentContext');
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });

    it('should generate complex agent file with all features', () => {
      const file = generateAgentFile('complex-agent', complexAgentData, undefined, mockRegistry);
      
      expect(file).toContain("import { agent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const complexAgent = agent({');
      expect(file).toContain('statusUpdates: {');
      expect(file).toContain('stopWhen: {');
      expect(file).toContain('subAgents: () => [');
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate agent code that compiles', () => {
      const definition = generateAgentDefinition('test-agent', basicAgentData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const testAgent', 'const result');
      
      const moduleCode = `
        const agent = (config) => config;
        const personalAssistant = { type: 'subAgent' };
        const coordinatesAgent = { type: 'subAgent' };
        const personalAgentContext = { type: 'contextConfig' };
        
        ${definitionWithoutExport}
        
        return result;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('test-agent');
      expect(result.name).toBe('Personal Assistant Agent');
      // Note: result here refers to the agent definition, not the mock variables
    });

    it('should generate complex agent code that compiles', () => {
      const definition = generateAgentDefinition('complex-test-agent', complexAgentData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const complexTestAgent', 'const result');
      
      const moduleCode = `
        const agent = (config) => config;
        const mainAssistant = { type: 'subAgent' };
        const helperAgent = { type: 'subAgent' };
        const coordinatorAgent = { type: 'subAgent' };
        const complexAgentContext = { type: 'contextConfig' };
        const toolSummary = { config: 'toolSummaryConfig' };
        const progressUpdate = { config: 'progressUpdateConfig' };
        
        ${definitionWithoutExport}
        
        return result;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('complex-test-agent');
      expect(result.statusUpdates).toBeDefined();
      expect(result.statusUpdates.numEvents).toBe(3);
      expect(result.statusUpdates.timeInSeconds).toBe(15);
      expect(result.statusUpdates.statusComponents).toHaveLength(2);
      expect(result.statusUpdates.prompt).toBe('Provide status updates on task progress and tool usage');
      expect(result.stopWhen).toBeDefined();
      expect(result.stopWhen.transferCountIs).toBe(5);
    });

    it('should generate minimal agent code that compiles', () => {
      const minimalData = { name: 'Minimal Test Agent' };
      const definition = generateAgentDefinition('minimal-test-agent', minimalData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const minimalTestAgent', 'const result');
      
      const moduleCode = `
        const agent = (config) => config;
        
        ${definitionWithoutExport}
        
        return result;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('minimal-test-agent');
      expect(result.name).toBe('Minimal Test Agent');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in agent IDs', () => {
      const definition = generateAgentDefinition('agent-v2_final', basicAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const agentV2Final = agent({');
      expect(definition).toContain("id: 'agent-v2_final',");
    });

    it('should handle agent ID starting with numbers', () => {
      const definition = generateAgentDefinition('2nd-generation-agent', basicAgentData, undefined, mockRegistry);
      
      expect(definition).toContain('export const _2ndGenerationAgent = agent({');
      expect(definition).toContain("id: '2nd-generation-agent',");
    });

    it('should handle empty string values', () => {
      const emptyStringData = {
        name: '',
        description: '',
        defaultSubAgent: 'assistant'
      };
      
      const definition = generateAgentDefinition('empty-strings-agent', emptyStringData, undefined, mockRegistry);
      
      expect(definition).toContain("name: '',");
      expect(definition).toContain("description: '',");
      expect(definition).toContain('defaultSubAgent: assistant');
    });

    it('should handle null and undefined values gracefully', () => {
      const nullData = {
        name: 'Test Agent',
        description: null,
        defaultSubAgent: undefined,
        subAgents: null,
        contextConfig: undefined
      };
      
      const definition = generateAgentDefinition('null-values-agent', nullData, undefined, mockRegistry);
      
      expect(definition).toContain("name: 'Test Agent'");
      expect(definition).not.toContain('description:');
      expect(definition).not.toContain('defaultSubAgent:');
      expect(definition).not.toContain('subAgents:');
      expect(definition).not.toContain('contextConfig:');
    });

    it('should handle large number of subAgents with proper formatting', () => {
      const manySubAgentsData = {
        name: 'Many SubAgents Agent',
        subAgents: ['agent1', 'agent2', 'agent3', 'agent4', 'agent5', 'agent6']
      };
      
      const definition = generateAgentDefinition('many-sub-agents', manySubAgentsData, undefined, mockRegistry);
      
      expect(definition).toContain('subAgents: () => [');
      expect(definition).toContain('  agent1,');
      expect(definition).toContain('  agent2,');
      expect(definition).toContain('  agent6'); // Last one without comma
      expect(definition).not.toContain('agent6,');
    });
  });
});