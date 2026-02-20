// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for project generator
 */
import { generateProjectDefinition as originalGenerateProjectDefinition } from '../../../pull-v4/project-generator';
import { expectSnapshots } from '../../../pull-v4/utils';

function generateProjectDefinition(
  ...args: Parameters<typeof originalGenerateProjectDefinition>
): string {
  return originalGenerateProjectDefinition(...args).getFullText();
}

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

  describe('generateProjectDefinition', () => {
    it('should generate basic project definition', async () => {
      const projectId = 'customer-support-project';

      const definition = generateProjectDefinition({
        projectId,
        ...basicProjectData,
      });

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
      expect(definition).toContain('escalationAgent,');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should generate complex project with all features', async () => {
      const projectId = 'enterprise-platform';
      const definition = generateProjectDefinition({
        projectId,
        ...complexProjectData,
      });

      expect(definition).toContain('export const enterprisePlatform = project({');
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 15,');
      expect(definition).toContain('stepCountIs: 100,');
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
      await expectSnapshots(definition);
    });

    it('should handle single item arrays in single line format', async () => {
      const singleItemData = {
        name: 'Single Agent Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        agents: ['onlyAgent'],
      };
      const projectId = 'single-agent-project';
      const definition = generateProjectDefinition({
        projectId,
        ...singleItemData,
      });

      expect(definition).toContain('agents: () => [onlyAgent]');
      expect(definition).not.toContain('agents: () => [\n'); // Single line format
      await expectSnapshots(definition);
    });

    it('should handle multiple items in multi-line format', async () => {
      const projectId = 'multi-item-project';
      const definition = generateProjectDefinition({
        projectId,
        ...complexProjectData,
      });

      expect(definition).toContain('agents: () => [primaryAgent, analyticsAgent, reportingAgent],');
      await expectSnapshots(definition);
    });

    it('should throw error for missing models field', () => {
      const projectId = 'minimal-project';
      const minimalData = {
        name: 'Minimal Project',
      };

      expect(() => {
        generateProjectDefinition({ projectId, ...minimalData });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Invalid input: expected object, received undefined
  → at models`)
      );
    });

    it('should throw error for missing required fields', () => {
      const projectId = 'fallback-project';
      expect(() => {
        generateProjectDefinition({ projectId });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Invalid input: expected string, received undefined
  → at name
✖ Invalid input: expected object, received undefined
  → at models`)
      );
    });

    it('should handle camelCase conversion for variable names', async () => {
      const projectId = 'my-complex-project_v2';
      const definition = generateProjectDefinition({ projectId, ...basicProjectData });

      expect(definition).toContain('export const myComplexProjectV2 = project({');
      await expectSnapshots(definition);
    });

    it('should handle multiline descriptions', async () => {
      const projectId = 'multiline-project';
      const multilineData = {
        name: 'Complex Project',
        description:
          'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings\nIt even contains newlines which should trigger multiline formatting',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
      };

      const definition = generateProjectDefinition({ projectId, ...multilineData });

      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('It even contains newlines');
      await expectSnapshots(definition);
    });

    it('should handle empty arrays', async () => {
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

      const definition = generateProjectDefinition({ projectId, ...emptyArraysData });

      expect(definition).toContain("name: 'Empty Arrays Project'");
      expect(definition).not.toContain('agents:'); // Empty arrays should be omitted
      expect(definition).not.toContain('tools:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');
      await expectSnapshots(definition);
    });

    it('should handle stopWhen with only transferCountIs', async () => {
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

      const definition = generateProjectDefinition({ projectId, ...transferOnlyData });

      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 5,');
      expect(definition).toContain('}');
      expect(definition).not.toContain('stepCountIs');
      await expectSnapshots(definition);
    });

    it('should handle stopWhen with only stepCountIs', async () => {
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

      const definition = generateProjectDefinition({ projectId, ...stepOnlyData });

      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 50,');
      expect(definition).toContain('}');
      expect(definition).not.toContain('transferCountIs');
      await expectSnapshots(definition);
    });

    it('should handle complex models with temperature settings', async () => {
      const projectId = 'complex-models-project';
      const complexModelsData = {
        name: 'Complex Models Project',
        models: {
          base: { model: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
          structuredOutput: { model: 'gpt-4o', temperature: 0.3 },
          summarizer: { model: 'gpt-4o-mini' },
        },
      };

      const definition = generateProjectDefinition({ projectId, ...complexModelsData });

      expect(definition).toContain('models: {');
      expect(definition).toContain('base: {');
      expect(definition).toContain("model: 'gpt-4o',");
      expect(definition).toContain('temperature: 0.7,');
      expect(definition).toContain('maxTokens: 4096');
      expect(definition).toContain('structuredOutput: {');
      expect(definition).toContain('temperature: 0.3');
      await expectSnapshots(definition);
    });
  });

  describe('compilation tests', () => {
    it('should generate project code that compiles', async () => {
      const projectId = 'test-project';
      const definition = generateProjectDefinition({
        projectId,
        ...basicProjectData,
      });
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
      await expectSnapshots(definition);
    });

    it('should generate complex project code that compiles', async () => {
      const projectId = 'complex-test-project';
      const definition = generateProjectDefinition({
        projectId,
        ...complexProjectData,
      });
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
      await expectSnapshots(definition);
    });

    it('should throw error for minimal project without required fields', () => {
      const projectId = 'minimal-test-project';
      const minimalData = { name: 'Minimal Test Project' };

      expect(() => {
        generateProjectDefinition({ projectId, ...minimalData });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Invalid input: expected object, received undefined
  → at models`)
      );
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty string name', () => {
      const projectId = 'empty-strings-project';
      const emptyStringData = {
        name: '',
        description: '',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
      };

      expect(() => {
        generateProjectDefinition({ projectId, ...emptyStringData });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Too small: expected string to have >=1 characters
  → at name`)
      );
    });

    it('should throw error for null models values', () => {
      const projectId = 'null-values-project';
      const nullData = {
        name: 'Test Project',
        description: null,
        models: undefined,
        agents: null,
        tools: undefined,
      };

      expect(() => {
        generateProjectDefinition({ projectId, ...nullData });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Invalid input: expected string, received null
  → at description
✖ Invalid input: expected object, received undefined
  → at models
✖ Invalid input: expected array, received null
  → at agents`)
      );
    });

    it('should handle mixed array types', async () => {
      const projectId = 'mixed-types-project';
      const mixedData = {
        name: 'Mixed Types Project',
        models: {
          base: { model: 'gpt-4o-mini' },
        },
        agents: ['stringAgent'],
        tools: ['stringTool'],
      };

      const definition = generateProjectDefinition({
        projectId,
        ...mixedData,
      });

      expect(definition).toContain('agents: () => [stringAgent]');
      expect(definition).toContain('tools: () => [stringTool]');
      await expectSnapshots(definition);
    });

    it('should throw error for missing name only', () => {
      const projectId = 'missing-name';
      const data = {
        models: { base: { model: 'gpt-4o-mini' } },
      };
      expect(() => {
        generateProjectDefinition({ projectId, ...data });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Invalid input: expected string, received undefined
  → at name`)
      );
    });

    it('should throw error for models without base', () => {
      const projectId = 'missing-base';
      const data = {
        name: 'Test Project',
        models: { structuredOutput: { model: 'gpt-4o' } },
      };
      expect(() => {
        generateProjectDefinition({ projectId, ...data });
      }).toThrow(
        new Error(`Validation failed for project:
✖ Invalid input: expected object, received undefined
  → at models.base`)
      );
    });
  });
});
