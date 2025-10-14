import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedPatterns } from '../../codegen/pattern-analyzer';
import { generatePlan } from '../../codegen/plan-builder';

// Mock the generateTextWithPlaceholders function
vi.mock('../../commands/pull.llm-generate', () => ({
  generateTextWithPlaceholders: vi.fn(),
  getTypeDefinitions: vi.fn(() => 'type definitions'),
}));

import { generateTextWithPlaceholders } from '../../commands/pull.llm-generate';

const mockGenerateTextWithPlaceholders = generateTextWithPlaceholders as any;

describe('plan-builder placeholder optimization', () => {
  const mockCreateModel = vi.fn((config: ModelSettings) => ({ id: 'test-model', ...config }));

  const mockProjectData: FullProjectDefinition = {
    id: 'test-project',
    name: 'Test Project',
    description: 'Test project description',
    agents: [
      {
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgentId: 'test-sub-agent',
        subAgentIds: ['test-sub-agent'],
      },
    ],
    subAgents: [
      {
        id: 'test-sub-agent',
        name: 'Test Sub Agent',
        description: 'Test sub agent description',
        instructions: 'Test instructions',
        toolIds: ['test-tool'],
        canDelegateToSubAgentIds: [],
        dataComponentIds: [],
        artifactComponentIds: [],
        credentialIds: [],
      },
    ],
    tools: [
      {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'Test tool description',
        type: 'function',
        definition: {
          type: 'function',
          name: 'test-function',
          description: 'A test function',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ],
    dataComponents: [],
    artifactComponents: [],
    credentials: [],
  };

  const mockPatterns: DetectedPatterns = {
    fileStructure: {
      agentsLocation: 'agents',
      toolsLocation: 'inline',
      dataComponentsLocation: 'data-components',
      artifactComponentsLocation: 'artifact-components',
      environmentsLocation: 'environments',
    },
    namingConventions: {
      fileNaming: 'kebab-case',
      variableNaming: 'camelCase',
      importStyle: 'named',
    },
    codeStyle: {
      indentation: '  ',
      quotes: 'single',
      semicolons: true,
      trailingCommas: true,
    },
    examples: {
      sampleAgentFile: `import { agent, subAgent, functionTool } from '@inkeep/agents-sdk';

const testSubAgent = subAgent({
  id: 'test-sub-agent',
  name: 'Test Sub Agent',
  description: 'Test sub agent with very long description that should be compressed with placeholders for optimal token usage',
  prompt: 'This is a very long prompt that should definitely be replaced with a placeholder during the planning phase to save tokens',
  canUse: () => [testTool],
  canDelegateTo: () => [],
  dataComponents: () => []
});

export const testAgent = agent({
  id: 'test-agent',
  name: 'Test Agent',
  defaultSubAgent: testSubAgent,
  subAgents: () => [testSubAgent]
});`,
      sampleToolFile: `import { functionTool } from '@inkeep/agents-sdk';

export const testTool = functionTool({
  name: 'test-tool',
  description: 'Test tool with very long description that should be compressed',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input parameter'
      }
    },
    required: ['input']
  },
  execute: async (params) => {
    return { result: 'success' };
  }
});`,
      sampleImports: [
        "import { agent, subAgent } from '@inkeep/agents-sdk';",
        "import { functionTool } from '@inkeep/agents-sdk';",
      ],
      mappings: [
        {
          id: 'test-agent',
          variableName: 'testAgent',
          entityType: 'agent',
        },
        {
          id: 'test-sub-agent',
          variableName: 'testSubAgent',
          entityType: 'subAgent',
        },
      ],
    },
  };

  const mockModelSettings: ModelSettings = {
    model: 'anthropic/claude-sonnet-4',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the LLM response with a valid file plan
    mockGenerateTextWithPlaceholders.mockResolvedValue(`{
  "files": [
    {
      "path": "agents/test-agent.ts",
      "type": "agent",
      "entities": [
        {
          "id": "test-sub-agent",
          "variableName": "testSubAgent",
          "entityType": "subAgent",
          "exportName": "testSubAgent"
        },
        {
          "id": "test-agent",
          "variableName": "testAgent",
          "entityType": "agent",
          "exportName": "testAgent"
        }
      ],
      "dependencies": [],
      "inlineContent": [
        {
          "id": "test-tool",
          "variableName": "testTool",
          "entityType": "tool",
          "exportName": "testTool"
        }
      ]
    },
    {
      "path": "index.ts",
      "type": "index",
      "entities": [
        {
          "id": "test-project",
          "variableName": "testProject",
          "entityType": "project",
          "exportName": "testProject"
        }
      ],
      "dependencies": [
        {
          "variableName": "testAgent",
          "fromPath": "./agents/test-agent",
          "entityType": "agent"
        }
      ]
    }
  ]
}`);
  });

  it('should call generateTextWithPlaceholders with combined projectData and patterns', async () => {
    await generatePlan(mockProjectData, mockPatterns, mockModelSettings, mockCreateModel);

    // Verify generateTextWithPlaceholders was called
    expect(mockGenerateTextWithPlaceholders).toHaveBeenCalled();

    // Get the call arguments
    const callArgs = mockGenerateTextWithPlaceholders.mock.calls[0];
    const [model, promptData, promptTemplate, options, debug] = callArgs;

    // Verify model was created correctly
    expect(model.id).toBe('test-model');

    // Verify promptData contains both projectData and patterns
    expect(promptData).toHaveProperty('projectData');
    expect(promptData).toHaveProperty('patterns');
    expect(promptData.projectData).toEqual(mockProjectData);
    expect(promptData.patterns).toEqual(mockPatterns);

    // Verify prompt template contains {{DATA}} placeholder
    expect(promptTemplate).toContain('{{DATA}}');
    expect(promptTemplate).toContain('DATA (PROJECT AND PATTERNS):');

    // Verify options
    expect(options.temperature).toBe(0.1);
    expect(options.maxOutputTokens).toBe(8000);

    // Verify debug flag is false
    expect(debug).toBe(false);
  });

  it('should include variable mappings in the prompt template', async () => {
    await generatePlan(mockProjectData, mockPatterns, mockModelSettings, mockCreateModel);

    const callArgs = mockGenerateTextWithPlaceholders.mock.calls[0];
    const [, , promptTemplate] = callArgs;

    // Verify variable mappings are included
    expect(promptTemplate).toContain('VARIABLE NAME MAPPINGS');
    expect(promptTemplate).toContain('AGENTS:');
    // Note: SUBAGENTS may be empty if there are no standalone subAgents (they're part of agents)
    expect(promptTemplate).toContain('TOOLS:');
  });

  it('should include critical rules about tool types in prompt', async () => {
    await generatePlan(mockProjectData, mockPatterns, mockModelSettings, mockCreateModel);

    const callArgs = mockGenerateTextWithPlaceholders.mock.calls[0];
    const [, , promptTemplate] = callArgs;

    // Verify critical rules are present
    expect(promptTemplate).toContain('CRITICAL RULES');
    expect(promptTemplate).toContain('TOOL TYPES - VERY IMPORTANT');
    expect(promptTemplate).toContain('Function Tools');
    expect(promptTemplate).toContain('MCP Tools');
    expect(promptTemplate).toContain('inlineContent');
  });

  it('should parse LLM response and return generation plan', async () => {
    const result = await generatePlan(
      mockProjectData,
      mockPatterns,
      mockModelSettings,
      mockCreateModel
    );

    // Verify plan structure
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('variableRegistry');
    expect(result).toHaveProperty('patterns');
    expect(result).toHaveProperty('metadata');

    // Verify files were parsed correctly
    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('agents/test-agent.ts');
    expect(result.files[0].type).toBe('agent');
    expect(result.files[0].inlineContent).toHaveLength(1);
    expect(result.files[1].path).toBe('index.ts');
    expect(result.files[1].type).toBe('index');

    // Verify variable registry was populated
    expect(result.variableRegistry.agents.has('test-agent')).toBe(true);
    expect(result.variableRegistry.subAgents.has('test-sub-agent')).toBe(true);
    // Note: Function tools are not registered separately, they're inline content
    // Only MCP tools would be in the tools registry

    // Verify metadata
    expect(result.metadata.totalFiles).toBe(2);
  });

  it('should handle patterns with large code examples that benefit from placeholders', async () => {
    const patternsWithLargeExamples: DetectedPatterns = {
      ...mockPatterns,
      examples: {
        ...mockPatterns.examples,
        sampleAgentFile: 'x'.repeat(5000), // Very large file content
        sampleToolFile: 'y'.repeat(5000), // Very large file content
      },
    };

    await generatePlan(
      mockProjectData,
      patternsWithLargeExamples,
      mockModelSettings,
      mockCreateModel
    );

    const callArgs = mockGenerateTextWithPlaceholders.mock.calls[0];
    const [, promptData] = callArgs;

    // Verify large examples are included in the data for placeholder processing
    expect(promptData.patterns.examples.sampleAgentFile).toHaveLength(5000);
    expect(promptData.patterns.examples.sampleToolFile).toHaveLength(5000);
  });

  it('should register existing variables from pattern mappings before generating plan', async () => {
    await generatePlan(mockProjectData, mockPatterns, mockModelSettings, mockCreateModel);

    const result = await generatePlan(
      mockProjectData,
      mockPatterns,
      mockModelSettings,
      mockCreateModel
    );

    // Verify that variables from pattern mappings are registered
    expect(result.variableRegistry.agents.get('test-agent')).toBe('testAgent');
    expect(result.variableRegistry.subAgents.get('test-sub-agent')).toBe('testSubAgent');
  });

  it('should use the correct model settings', async () => {
    const customModelSettings: ModelSettings = {
      model: 'anthropic/claude-opus-4',
    };

    await generatePlan(mockProjectData, mockPatterns, customModelSettings, mockCreateModel);

    // Verify createModel was called with custom settings
    expect(mockCreateModel).toHaveBeenCalledWith(customModelSettings);
  });

  it('should handle empty patterns gracefully', async () => {
    const emptyPatterns: DetectedPatterns = {
      fileStructure: {
        agentsLocation: 'agents',
        toolsLocation: 'separate',
        dataComponentsLocation: 'data-components',
        artifactComponentsLocation: 'artifact-components',
        environmentsLocation: 'environments',
      },
      namingConventions: {
        fileNaming: 'kebab-case',
        variableNaming: 'camelCase',
        importStyle: 'named',
      },
      codeStyle: {
        indentation: '  ',
        quotes: 'single',
        semicolons: true,
        trailingCommas: true,
      },
      examples: {
        sampleAgentFile: undefined,
        sampleToolFile: undefined,
        sampleImports: [],
        mappings: [],
      },
    };

    const result = await generatePlan(
      mockProjectData,
      emptyPatterns,
      mockModelSettings,
      mockCreateModel
    );

    // Should still generate a plan
    expect(result.files).toBeDefined();
    expect(result.variableRegistry).toBeDefined();
  });

  it('should fallback to default plan if LLM response is invalid', async () => {
    // Mock invalid LLM response
    mockGenerateTextWithPlaceholders.mockResolvedValue('invalid json response');

    const result = await generatePlan(
      mockProjectData,
      mockPatterns,
      mockModelSettings,
      mockCreateModel
    );

    // Should still return a plan with default structure
    expect(result.files).toBeDefined();
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path === 'index.ts')).toBe(true);
  });

  it('should combine all entities from project data', async () => {
    const complexProjectData: FullProjectDefinition = {
      ...mockProjectData,
      dataComponents: [
        {
          id: 'weather-forecast',
          name: 'Weather Forecast',
          description: 'Weather forecast component',
          props: { type: 'object', properties: {} },
        },
      ],
      artifactComponents: [
        {
          id: 'weather-chart',
          name: 'Weather Chart',
          description: 'Weather chart component',
          props: { type: 'object', properties: {} },
        },
      ],
    };

    await generatePlan(complexProjectData, mockPatterns, mockModelSettings, mockCreateModel);

    const callArgs = mockGenerateTextWithPlaceholders.mock.calls[0];
    const [, promptData, promptTemplate] = callArgs;

    // Verify all entity types are included in promptData
    expect(promptData.projectData.dataComponents).toHaveLength(1);
    expect(promptData.projectData.artifactComponents).toHaveLength(1);

    // Verify prompt template includes data component mappings
    expect(promptTemplate).toContain('DATACOMPONENTS:');
    expect(promptTemplate).toContain('ARTIFACTCOMPONENTS:');
  });

  it('should not mutate original projectData and patterns', async () => {
    const originalProjectData = JSON.parse(JSON.stringify(mockProjectData));
    const originalPatterns = JSON.parse(JSON.stringify(mockPatterns));

    await generatePlan(mockProjectData, mockPatterns, mockModelSettings, mockCreateModel);

    // Verify data wasn't mutated
    expect(mockProjectData).toEqual(originalProjectData);
    expect(mockPatterns).toEqual(originalPatterns);
  });
});
