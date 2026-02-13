// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for project generator
 */
import { generateProjectDefinition as generateProjectDefinitionV4 } from '../../../pull-v4/project-generator';
import type { ComponentRegistry } from '../../utils/component-registry';
import {
  generateProjectDefinition,
  generateProjectFile,
  generateProjectImports,
} from '../project-generator';

// Mock registry for tests
const mockRegistry = {
  formatReferencesForCode(refs, _type, _style, indent) {
    if (!refs || refs.length === 0) return '[]';
    if (refs.length === 1) return `[${refs[0]}]`;

    const indentStr = '  '.repeat(indent);
    const items = refs.map((ref) => `${indentStr}${ref}`).join(',\n');
    return `[\n${items}\n${indentStr.slice(2)}]`;
  },
} satisfies Partial<ComponentRegistry>;

describe('Project Generator', () => {
  const basicProjectData = {
    name: 'Customer Support System',
    description: 'Multi-agent customer support system with escalation capabilities',
    models: {
      base: { model: 'gpt-4o-mini' },
      structuredOutput: { model: 'gpt-4o' },
      summarizer: { model: 'gpt-4o-mini' },
    },
    agents: ['supportAgent', 'escalationAgent'],
  } as const;

  const complexProjectData = {
    name: 'Enterprise AI Platform',
    description:
      'Comprehensive enterprise AI platform with multiple specialized agents and shared resources',
    models: {
      base: { model: 'gpt-4o', temperature: 0.7 },
      structuredOutput: { model: 'gpt-4o', temperature: 0.3 },
      summarizer: { model: 'gpt-4o-mini', temperature: 0.5 },
    },
    stopWhen: {
      transferCountIs: 15,
      stepCountIs: 100,
    },
    agents: ['primaryAgent', 'analyticsAgent', 'reportingAgent'],
    tools: ['dataAnalysisTool', 'reportGeneratorTool'],
    externalAgents: ['legacySystemAgent', 'partnerApiAgent'],
    dataComponents: ['userProfile', 'transactionHistory'],
    artifactComponents: ['dashboardComponent', 'reportComponent'],
    credentialReferences: ['databaseCredentials', 'apiKeyCredentials'],
  } as const;

  describe('generateProjectImports', () => {
    it('should generate basic imports', () => {
      const imports = generateProjectImports(basicProjectData);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toBe("import { project } from '@inkeep/agents-sdk';");
    });

    // it('should handle different code styles', () => {
    //   const imports = generateProjectImports(basicProjectData, {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(imports[0]).toBe('import { project } from "@inkeep/agents-sdk"');
    // });
  });

  describe('generateProjectDefinition', () => {
    it.only('should generate basic project definition', async () => {
      const projectId = 'customer-support-project';

      const definition = generateProjectDefinition(
        projectId,
        basicProjectData,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('export const customerSupportProject = project({');
      expect(definition).toContain("id: 'customer-support-project',");
      expect(definition).toContain("name: 'Customer Support System',");
      expect(definition).toContain(
        "description: 'Multi-agent customer support system with escalation capabilities',"
      );
      expect(definition).toContain('models: {');
      expect(definition).toContain("model: 'gpt-4o-mini'");
      expect(definition).toContain("model: 'gpt-4o'");
      expect(definition).toContain('agents: () => [');
      expect(definition).toContain('supportAgent,');
      expect(definition).toContain('escalationAgent');
      expect(definition).toContain('});');
      expect(definition).not.toContain('escalationAgent,'); // No trailing comma

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...basicProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should generate complex project with all features', async () => {
      const projectId = 'enterprise-platform';
      const definition = generateProjectDefinition(
        projectId,
        complexProjectData,
        undefined,
        mockRegistry
      );

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

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...complexProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle single item arrays in single line format', async () => {
      const singleItemData = {
        name: 'Single Agent Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        agents: ['onlyAgent'],
      };
      const projectId = 'single-agent-project';
      const definition = generateProjectDefinition(
        projectId,
        singleItemData,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('agents: () => [onlyAgent]');
      expect(definition).not.toContain('agents: () => [\n'); // Single line format

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...singleItemData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle multiple items in multi-line format', async () => {
      const projectId = 'multi-item-project';
      const definition = generateProjectDefinition(
        projectId,
        complexProjectData,
        undefined,
        mockRegistry
      );

      expect(definition).toContain('agents: () => [');
      expect(definition).toContain('  primaryAgent,');
      expect(definition).toContain('  analyticsAgent,');
      expect(definition).toContain('  reportingAgent'); // Last one without comma
      expect(definition).toContain(']');
      expect(definition).not.toContain('reportingAgent,');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...complexProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should throw error for missing models field', () => {
      const projectId = 'minimal-project';
      const minimalData = {
        name: 'Minimal Project',
      };

      expect(() => {
        generateProjectDefinition(projectId, minimalData);
      }).toThrow("Missing required fields for project 'minimal-project': models, models.base");
      expect(() => {
        generateProjectDefinitionV4({ projectId, ...minimalData });
      }).toThrow(
        new Error(`Missing required fields for project:
✖ Invalid input: expected object, received undefined
  → at models`)
      );
    });

    it.only('should throw error for missing required fields', () => {
      const noNameData = {};
      const projectId = 'fallback-project';
      expect(() => {
        generateProjectDefinition(projectId, noNameData);
      }).toThrow(
        "Missing required fields for project 'fallback-project': name, models, models.base"
      );
      expect(() => {
        // @ts-expect-error
        generateProjectDefinitionV4({ projectId });
      }).toThrowError(
        new Error(`Missing required fields for project:
✖ Invalid input: expected string, received undefined
  → at name
✖ Invalid input: expected object, received undefined
  → at models`)
      );
    });

    it.only('should handle camelCase conversion for variable names', async () => {
      const projectId = 'my-complex-project_v2';
      const definition = generateProjectDefinition(projectId, basicProjectData);

      expect(definition).toContain('export const myComplexProjectV2 = project({');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...basicProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle multiline descriptions', async () => {
      const projectId = 'multiline-project';
      const multilineData = {
        name: 'Complex Project',
        description:
          'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings\nIt even contains newlines which should trigger multiline formatting',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
      };

      const definition = generateProjectDefinition(projectId, multilineData);

      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('It even contains newlines');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...multilineData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    // it('should handle different code styles', async () => {
    //   const projectId = 'styled-project';
    //   const definition = generateProjectDefinition(projectId, basicProjectData, {
    //     quotes: 'double',
    //     semicolons: false,
    //     indentation: '    ',
    //   });
    //
    //   expect(definition).toContain('export const styledProject = project({');
    //   expect(definition).toContain('id: "styled-project",'); // Double quotes
    //   expect(definition).toContain('name: "Customer Support System",');
    //   expect(definition).not.toContain(';'); // No semicolons except at the end
    //   expect(definition).toContain('})'); // No semicolon at the end
    // });

    it.only('should handle empty arrays', async () => {
      const projectId = 'empty-arrays-project';
      const emptyArraysData = {
        name: 'Empty Arrays Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        agents: [],
        tools: [],
        dataComponents: [],
        artifactComponents: [],
      };

      const definition = generateProjectDefinition(projectId, emptyArraysData);

      expect(definition).toContain("name: 'Empty Arrays Project'");
      expect(definition).not.toContain('agents:'); // Empty arrays should be omitted
      expect(definition).not.toContain('tools:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...emptyArraysData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle stopWhen with only transferCountIs', async () => {
      const projectId = 'transfer-only-project';
      const transferOnlyData = {
        name: 'Transfer Only Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        stopWhen: {
          transferCountIs: 5,
        },
      };

      const definition = generateProjectDefinition(projectId, transferOnlyData);

      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 5 // Max transfers for agents'); // No trailing comma when it's the only property
      expect(definition).toContain('}');
      expect(definition).not.toContain('stepCountIs');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...transferOnlyData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle stopWhen with only stepCountIs', async () => {
      const projectId = 'step-only-project';
      const stepOnlyData = {
        name: 'Step Only Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        stopWhen: {
          stepCountIs: 50,
        },
      };

      const definition = generateProjectDefinition(projectId, stepOnlyData);

      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 50 // Max steps for sub-agents');
      expect(definition).toContain('}');
      expect(definition).not.toContain('transferCountIs');
      expect(definition).not.toContain('stepCountIs: 50,'); // No trailing comma

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...stepOnlyData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle complex models with temperature settings', async () => {
      const projectId = 'complex-models-project';
      const complexModelsData = {
        name: 'Complex Models Project',
        models: {
          base: { model: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
          structuredOutput: { model: 'gpt-4o', temperature: 0.3 },
          summarizer: { model: 'gpt-4o-mini' },
        },
      };

      const definition = generateProjectDefinition(projectId, complexModelsData);

      expect(definition).toContain('models: {');
      expect(definition).toContain('base: {');
      expect(definition).toContain("model: 'gpt-4o',");
      expect(definition).toContain('temperature: 0.7,');
      expect(definition).toContain('maxTokens: 4096');
      expect(definition).toContain('structuredOutput: {');
      expect(definition).toContain('temperature: 0.3');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...complexModelsData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });
  });

  describe('generateProjectFile', () => {
    it.only('should generate complete project file', async () => {
      const projectId = 'customer-support-project';
      const file = generateProjectFile(projectId, basicProjectData);

      expect(file).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const customerSupportProject = project({');
      expect(file).toContain("name: 'Customer Support System',");

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);

      const definitionV4 = generateProjectDefinitionV4({ projectId, ...basicProjectData });
      const testName = expect.getState().currentTestName;
      await expect(file).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should generate complex project file with all features', async () => {
      const projectId = 'enterprise-platform';
      const file = generateProjectFile(projectId, complexProjectData);

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

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...complexProjectData });
      await expect(file).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });
  });

  describe('compilation tests', () => {
    it.only('should generate project code that compiles', async () => {
      const projectId = 'test-project';
      const definition = generateProjectDefinition(
        projectId,
        basicProjectData,
        undefined,
        mockRegistry
      );
      const definitionWithoutExport = definition.replace('export const ', 'const ');

      const moduleCode = `
        const project = (config) => config;
        const supportAgent = { type: 'agent' };
        const escalationAgent = { type: 'agent' };
        
        ${definitionWithoutExport}
        
        return testProject;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.id).toBe('test-project');
      expect(result.name).toBe('Customer Support System');
      expect(result.description).toBe(
        'Multi-agent customer support system with escalation capabilities'
      );
      expect(result.models).toBeDefined();
      expect(result.models.base.model).toBe('gpt-4o-mini');
      expect(result.agents).toBeDefined();
      expect(typeof result.agents).toBe('function');
      expect(result.agents()).toHaveLength(2);

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...basicProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should generate complex project code that compiles', async () => {
      const projectId = 'complex-test-project';
      const definition = generateProjectDefinition(
        projectId,
        complexProjectData,
        undefined,
        mockRegistry
      );
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

      let result: any;
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

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...complexProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should throw error for minimal project without required fields', () => {
      const projectId = 'minimal-test-project';
      const minimalData = { name: 'Minimal Test Project' };

      expect(() => generateProjectDefinition(projectId, minimalData)).toThrow(
        `Missing required fields for project '${projectId}': models, models.base`
      );
      expect(() => generateProjectDefinitionV4({ projectId, ...minimalData })).toThrow(
        new Error(`Missing required fields for project:
✖ Invalid input: expected object, received undefined
  → at models`)
      );
    });
  });

  describe('edge cases', () => {
    it.only('should handle special characters in project IDs', async () => {
      const projectId = 'project-v2_final';
      const definition = generateProjectDefinition(projectId, basicProjectData);

      expect(definition).toContain('export const projectV2Final = project({');
      expect(definition).toContain(`id: '${projectId}',`);

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...basicProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should handle project ID starting with numbers', async () => {
      const projectId = '2nd-generation-project';
      const definition = generateProjectDefinition(projectId, basicProjectData);

      expect(definition).toContain('export const _2ndGenerationProject = project({');
      expect(definition).toContain(`id: '${projectId}',`);

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...basicProjectData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should throw error for empty string name', () => {
      const projectId = 'empty-strings-project';
      const emptyStringData = {
        name: '',
        description: '',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
      };

      expect(() => generateProjectDefinition(projectId, emptyStringData)).toThrow(
        `Missing required fields for project '${projectId}': name`
      );
      expect(() => generateProjectDefinitionV4({ projectId, ...emptyStringData })).toThrow(
        new Error(`Missing required fields for project:
✖ Too small: expected string to have >=1 characters
  → at name`)
      );
    });

    it.only('should throw error for null models values', () => {
      const projectId = 'null-values-project';
      const nullData = {
        name: 'Test Project',
        description: null,
        models: undefined,
        agents: null,
        tools: undefined,
      };

      expect(() => generateProjectDefinition(projectId, nullData)).toThrow(
        `Missing required fields for project '${projectId}': models, models.base`
      );
      expect(() => generateProjectDefinitionV4({ projectId, ...nullData })).toThrow(
        new Error(`Missing required fields for project:
✖ Invalid input: expected string, received null
  → at description
✖ Invalid input: expected object, received undefined
  → at models
✖ Invalid input: expected array, received null
  → at agents`)
      );
    });

    // it('should handle large number of agents with proper formatting', () => {
    //   const manyAgentsData = {
    //     name: 'Many Agents Project',
    //     models: {
    //       base: { model: 'gpt-4o-mini' },
    //     },
    //     agents: ['agent1', 'agent2', 'agent3', 'agent4', 'agent5', 'agent6'],
    //   };
    //
    //   const definition = generateProjectDefinition(
    //     'many-agents-project',
    //     manyAgentsData,
    //     undefined,
    //     mockRegistry
    //   );
    //
    //   expect(definition).toContain('agents: () => [');
    //   expect(definition).toContain('  agent1,');
    //   expect(definition).toContain('  agent2,');
    //   expect(definition).toContain('  agent6'); // Last one without comma
    //   expect(definition).not.toContain('agent6,');
    // });

    it.only('should handle mixed array types', async () => {
      const projectId = 'mixed-types-project';
      const mixedData = {
        name: 'Mixed Types Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        agents: ['stringAgent'],
        tools: ['stringTool'],
      };

      const definition = generateProjectDefinition(projectId, mixedData, undefined, mockRegistry);

      expect(definition).toContain('agents: () => [stringAgent]');
      expect(definition).toContain('tools: () => [stringTool]');

      const testName = expect.getState().currentTestName;
      const definitionV4 = generateProjectDefinitionV4({ projectId, ...mixedData });
      await expect(definition).toMatchFileSnapshot(`__snapshots__/project/${testName}.txt`);
      await expect(definitionV4).toMatchFileSnapshot(`__snapshots__/project/${testName}-v4.txt`);
    });

    it.only('should throw error for missing name only', () => {
      const projectId = 'missing-name';
      const data = {
        models: { base: { model: 'gpt-4o-mini' } },
      };
      expect(() => generateProjectDefinition(projectId, data)).toThrow(
        `Missing required fields for project '${projectId}': name`
      );
      expect(() => generateProjectDefinitionV4({ projectId, ...data })).toThrow(
        new Error(`Missing required fields for project:
✖ Invalid input: expected string, received undefined
  → at name`)
      );
    });

    it.only('should throw error for models without base', () => {
      const projectId = 'missing-base';
      const data = {
        name: 'Test Project',
        models: { structuredOutput: { model: 'gpt-4o' } },
      };
      expect(() => generateProjectDefinition(projectId, data)).toThrow(
        `Missing required fields for project '${projectId}': models.base`
      );
      expect(() => generateProjectDefinitionV4({ projectId, ...data })).toThrow(
        new Error(`Missing required fields for project:
✖ Invalid input: expected object, received undefined
  → at models.base`)
      );
    });
  });
});
