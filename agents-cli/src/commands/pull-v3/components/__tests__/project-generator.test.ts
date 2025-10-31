/**
 * Unit tests for project generator
 */

import { describe, it, expect } from 'vitest';
import { 
  generateProjectDefinition,
  generateProjectImports,
  generateProjectFile
} from '../project-generator';

// Mock registry for tests
const mockRegistry = {
  formatReferencesForCode: (refs: string[], type: string, style: any, indent: number) => {
    if (!refs || refs.length === 0) return '[]';
    if (refs.length === 1) return `[${refs[0]}]`;
    
    const indentStr = '  '.repeat(indent);
    const items = refs.map(ref => `${indentStr}${ref}`).join(',\n');
    return `[\n${items}\n${indentStr.slice(2)}]`;
  }
};

describe('Project Generator', () => {
  const basicProjectData = {
    name: 'Customer Support System',
    description: 'Multi-agent customer support system with escalation capabilities',
    models: {
      base: { model: 'gpt-4o-mini' },
      structuredOutput: { model: 'gpt-4o' },
      summarizer: { model: 'gpt-4o-mini' }
    },
    agents: ['supportAgent', 'escalationAgent']
  };

  const complexProjectData = {
    name: 'Enterprise AI Platform',
    description: 'Comprehensive enterprise AI platform with multiple specialized agents and shared resources',
    models: {
      base: { model: 'gpt-4o', temperature: 0.7 },
      structuredOutput: { model: 'gpt-4o', temperature: 0.3 },
      summarizer: { model: 'gpt-4o-mini', temperature: 0.5 }
    },
    stopWhen: {
      transferCountIs: 15,
      stepCountIs: 100
    },
    agents: ['primaryAgent', 'analyticsAgent', 'reportingAgent'],
    tools: ['dataAnalysisTool', 'reportGeneratorTool'],
    externalAgents: ['legacySystemAgent', 'partnerApiAgent'],
    dataComponents: ['userProfile', 'transactionHistory'],
    artifactComponents: ['dashboardComponent', 'reportComponent'],
    credentialReferences: ['databaseCredentials', 'apiKeyCredentials']
  };

  describe('generateProjectImports', () => {
    it('should generate basic imports', () => {
      const imports = generateProjectImports('customer-support-project', basicProjectData);
      
      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { project } from '@inkeep/agents-sdk';");
    });

    it('should handle different code styles', () => {
      const imports = generateProjectImports('test-project', basicProjectData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      });
      
      expect(imports[0]).toBe('import { project } from "@inkeep/agents-sdk"');
    });
  });

  describe('generateProjectDefinition', () => {
    it('should generate basic project definition', () => {
      const definition = generateProjectDefinition('customer-support-project', basicProjectData, undefined, mockRegistry);
      
      expect(definition).toContain('export const customerSupportProject = project({');
      expect(definition).toContain("id: 'customer-support-project',");
      expect(definition).toContain("name: 'Customer Support System',");
      expect(definition).toContain("description: 'Multi-agent customer support system with escalation capabilities',");
      expect(definition).toContain('models: {');
      expect(definition).toContain("model: 'gpt-4o-mini'");
      expect(definition).toContain("model: 'gpt-4o'");
      expect(definition).toContain('agents: () => [');
      expect(definition).toContain('supportAgent,');
      expect(definition).toContain('escalationAgent');
      expect(definition).toContain('});');
      expect(definition).not.toContain('escalationAgent,'); // No trailing comma
    });

    it('should generate complex project with all features', () => {
      const definition = generateProjectDefinition('enterprise-platform', complexProjectData, undefined, mockRegistry);
      
      expect(definition).toContain('export const enterprisePlatform = project({');
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 15, // Max transfers for agents');
      expect(definition).toContain('stepCountIs: 100 // Max steps for sub-agents');
      expect(definition).toContain('agents: () => [');
      expect(definition).toContain('tools: () => [');
      expect(definition).toContain('externalAgents: () => [');
      expect(definition).toContain('dataComponents: () => [');
      expect(definition).toContain('artifactComponents: () => [');
      expect(definition).toContain('credentialReferences: () => [');
      expect(definition).toContain('primaryAgent,');
      expect(definition).toContain('analyticsAgent,');
      expect(definition).toContain('reportingAgent');
      expect(definition).toContain('dataAnalysisTool,');
      expect(definition).toContain('reportGeneratorTool');
      expect(definition).not.toContain('reportGeneratorTool,'); // No trailing comma
    });

    it('should handle single item arrays in single line format', () => {
      const singleItemData = {
        name: 'Single Agent Project',
        models: {
          base: { model: 'gpt-4o-mini' }
        },
        agents: ['onlyAgent']
      };
      
      const definition = generateProjectDefinition('single-agent-project', singleItemData, undefined, mockRegistry);
      
      expect(definition).toContain('agents: () => [onlyAgent]');
      expect(definition).not.toContain('agents: () => [\n'); // Single line format
    });

    it('should handle multiple items in multi-line format', () => {
      const definition = generateProjectDefinition('multi-item-project', complexProjectData, undefined, mockRegistry);
      
      expect(definition).toContain('agents: () => [');
      expect(definition).toContain('  primaryAgent,');
      expect(definition).toContain('  analyticsAgent,');
      expect(definition).toContain('  reportingAgent'); // Last one without comma
      expect(definition).toContain(']');
      expect(definition).not.toContain('reportingAgent,');
    });

    it('should throw error for missing models field', () => {
      const minimalData = {
        name: 'Minimal Project'
      };
      
      expect(() => {
        generateProjectDefinition('minimal-project', minimalData);
      }).toThrow('Missing required fields for project \'minimal-project\': models, models.base');
    });

    it('should throw error for missing required fields', () => {
      const noNameData = {};
      
      expect(() => {
        generateProjectDefinition('fallback-project', noNameData);
      }).toThrow('Missing required fields for project \'fallback-project\': name, models, models.base');
    });

    it('should handle camelCase conversion for variable names', () => {
      const definition = generateProjectDefinition('my-complex-project_v2', basicProjectData);
      
      expect(definition).toContain('export const myComplexProjectV2 = project({');
    });

    it('should handle multiline descriptions', () => {
      const multilineData = {
        name: 'Complex Project',
        description: 'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings\\nIt even contains newlines which should trigger multiline formatting',
        models: {
          base: { model: 'gpt-4o-mini' }
        }
      };
      
      const definition = generateProjectDefinition('multiline-project', multilineData);
      
      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('It even contains newlines');
    });

    it('should handle different code styles', () => {
      const definition = generateProjectDefinition('styled-project', basicProjectData, {
        quotes: 'double',
        semicolons: false,
        indentation: '    '
      });
      
      expect(definition).toContain('export const styledProject = project({');
      expect(definition).toContain('id: "styled-project",'); // Double quotes
      expect(definition).toContain('name: "Customer Support System",');
      expect(definition).not.toContain(';'); // No semicolons except at the end
      expect(definition).toContain('})'); // No semicolon at the end
    });

    it('should handle empty arrays', () => {
      const emptyArraysData = {
        name: 'Empty Arrays Project',
        models: {
          base: { model: 'gpt-4o-mini' }
        },
        agents: [],
        tools: [],
        dataComponents: [],
        artifactComponents: []
      };
      
      const definition = generateProjectDefinition('empty-arrays-project', emptyArraysData);
      
      expect(definition).toContain("name: 'Empty Arrays Project'");
      expect(definition).not.toContain('agents:'); // Empty arrays should be omitted
      expect(definition).not.toContain('tools:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');
    });

    it('should handle stopWhen with only transferCountIs', () => {
      const transferOnlyData = {
        name: 'Transfer Only Project',
        models: {
          base: { model: 'gpt-4o-mini' }
        },
        stopWhen: {
          transferCountIs: 5
        }
      };
      
      const definition = generateProjectDefinition('transfer-only-project', transferOnlyData);
      
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 5 // Max transfers for agents'); // No trailing comma when it's the only property
      expect(definition).toContain('}');
      expect(definition).not.toContain('stepCountIs');
    });

    it('should handle stopWhen with only stepCountIs', () => {
      const stepOnlyData = {
        name: 'Step Only Project',
        models: {
          base: { model: 'gpt-4o-mini' }
        },
        stopWhen: {
          stepCountIs: 50
        }
      };
      
      const definition = generateProjectDefinition('step-only-project', stepOnlyData);
      
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 50 // Max steps for sub-agents');
      expect(definition).toContain('}');
      expect(definition).not.toContain('transferCountIs');
      expect(definition).not.toContain('stepCountIs: 50,'); // No trailing comma
    });

    it('should handle complex models with temperature settings', () => {
      const complexModelsData = {
        name: 'Complex Models Project',
        models: {
          base: { model: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
          structuredOutput: { model: 'gpt-4o', temperature: 0.3 },
          summarizer: { model: 'gpt-4o-mini' }
        }
      };
      
      const definition = generateProjectDefinition('complex-models-project', complexModelsData);
      
      expect(definition).toContain('models: {');
      expect(definition).toContain('base: {');
      expect(definition).toContain("model: 'gpt-4o',");
      expect(definition).toContain('temperature: 0.7,');
      expect(definition).toContain('maxTokens: 4096');
      expect(definition).toContain('structuredOutput: {');
      expect(definition).toContain('temperature: 0.3');
    });
  });

  describe('generateProjectFile', () => {
    it('should generate complete project file', () => {
      const file = generateProjectFile('customer-support-project', basicProjectData);
      
      expect(file).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const customerSupportProject = project({');
      expect(file).toContain("name: 'Customer Support System',");
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });

    it('should generate complex project file with all features', () => {
      const file = generateProjectFile('enterprise-platform', complexProjectData);
      
      expect(file).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const enterprisePlatform = project({');
      expect(file).toContain('stopWhen: {');
      expect(file).toContain('agents: () => [');
      expect(file).toContain('tools: () => [');
      expect(file).toContain('externalAgents: () => [');
      expect(file).toContain('dataComponents: () => [');
      expect(file).toContain('artifactComponents: () => [');
      expect(file).toContain('credentialReferences: () => [');
      
      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
    });
  });

  describe('compilation tests', () => {
    it('should generate project code that compiles', () => {
      const definition = generateProjectDefinition('test-project', basicProjectData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const project = (config) => config;
        const supportAgent = { type: 'agent' };
        const escalationAgent = { type: 'agent' };
        
        ${definitionWithoutExport}
        
        return testProject;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('test-project');
      expect(result.name).toBe('Customer Support System');
      expect(result.description).toBe('Multi-agent customer support system with escalation capabilities');
      expect(result.models).toBeDefined();
      expect(result.models.base.model).toBe('gpt-4o-mini');
      expect(result.agents).toBeDefined();
      expect(typeof result.agents).toBe('function');
      expect(result.agents()).toHaveLength(2);
    });

    it('should generate complex project code that compiles', () => {
      const definition = generateProjectDefinition('complex-test-project', complexProjectData, undefined, mockRegistry);
      const definitionWithoutExport = definition.replace('export const ', 'const ');
      
      const moduleCode = `
        const project = (config) => config;
        const primaryAgent = { type: 'agent' };
        const analyticsAgent = { type: 'agent' };
        const reportingAgent = { type: 'agent' };
        const dataAnalysisTool = { type: 'tool' };
        const reportGeneratorTool = { type: 'tool' };
        const legacySystemAgent = { type: 'externalAgent' };
        const partnerApiAgent = { type: 'externalAgent' };
        const userProfile = { type: 'dataComponent' };
        const transactionHistory = { type: 'dataComponent' };
        const dashboardComponent = { type: 'artifactComponent' };
        const reportComponent = { type: 'artifactComponent' };
        const databaseCredentials = { type: 'credential' };
        const apiKeyCredentials = { type: 'credential' };
        
        ${definitionWithoutExport}
        
        return complexTestProject;
      `;
      
      let result;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();
      
      expect(result).toBeDefined();
      expect(result.id).toBe('complex-test-project');
      expect(result.stopWhen).toBeDefined();
      expect(result.stopWhen.transferCountIs).toBe(15);
      expect(result.stopWhen.stepCountIs).toBe(100);
      expect(result.agents()).toHaveLength(3);
      expect(result.tools()).toHaveLength(2);
      expect(result.externalAgents()).toHaveLength(2);
      expect(result.dataComponents()).toHaveLength(2);
      expect(result.artifactComponents()).toHaveLength(2);
      expect(result.credentialReferences()).toHaveLength(2);
    });

    it('should throw error for minimal project without required fields', () => {
      const minimalData = { name: 'Minimal Test Project' };
      
      expect(() => {
        generateProjectDefinition('minimal-test-project', minimalData);
      }).toThrow('Missing required fields for project \'minimal-test-project\': models, models.base');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in project IDs', () => {
      const definition = generateProjectDefinition('project-v2_final', basicProjectData);
      
      expect(definition).toContain('export const projectV2Final = project({');
      expect(definition).toContain("id: 'project-v2_final',");
    });

    it('should handle project ID starting with numbers', () => {
      const definition = generateProjectDefinition('2nd-generation-project', basicProjectData);
      
      expect(definition).toContain('export const _2ndGenerationProject = project({');
      expect(definition).toContain("id: '2nd-generation-project',");
    });

    it('should throw error for empty string name', () => {
      const emptyStringData = {
        name: '',
        description: '',
        models: {
          base: { model: 'gpt-4o-mini' }
        }
      };
      
      expect(() => {
        generateProjectDefinition('empty-strings-project', emptyStringData);
      }).toThrow('Missing required fields for project \'empty-strings-project\': name');
    });

    it('should throw error for null models values', () => {
      const nullData = {
        name: 'Test Project',
        description: null,
        models: undefined,
        agents: null,
        tools: undefined
      };
      
      expect(() => {
        generateProjectDefinition('null-values-project', nullData);
      }).toThrow('Missing required fields for project \'null-values-project\': models, models.base');
    });

    it('should handle large number of agents with proper formatting', () => {
      const manyAgentsData = {
        name: 'Many Agents Project',
        models: {
          base: { model: 'gpt-4o-mini' }
        },
        agents: ['agent1', 'agent2', 'agent3', 'agent4', 'agent5', 'agent6']
      };
      
      const definition = generateProjectDefinition('many-agents-project', manyAgentsData, undefined, mockRegistry);
      
      expect(definition).toContain('agents: () => [');
      expect(definition).toContain('  agent1,');
      expect(definition).toContain('  agent2,');
      expect(definition).toContain('  agent6'); // Last one without comma
      expect(definition).not.toContain('agent6,');
    });

    it('should handle mixed array types', () => {
      const mixedData = {
        name: 'Mixed Types Project',
        models: {
          base: { model: 'gpt-4o-mini' }
        },
        agents: ['stringAgent'],
        tools: ['stringTool']
      };
      
      const definition = generateProjectDefinition('mixed-types-project', mixedData, undefined, mockRegistry);
      
      expect(definition).toContain('agents: () => [stringAgent]');
      expect(definition).toContain('tools: () => [stringTool]');
    });

    it('should throw error for missing name only', () => {
      expect(() => {
        generateProjectDefinition('missing-name', { 
          models: { base: { model: 'gpt-4o-mini' } }
        });
      }).toThrow('Missing required fields for project \'missing-name\': name');
    });

    it('should throw error for models without base', () => {
      expect(() => {
        generateProjectDefinition('missing-base', { 
          name: 'Test Project',
          models: { structuredOutput: { model: 'gpt-4o' } }
        });
      }).toThrow('Missing required fields for project \'missing-base\': models.base');
    });
  });
});