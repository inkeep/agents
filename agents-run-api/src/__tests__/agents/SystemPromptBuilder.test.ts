import { readFile } from 'node:fs/promises';
import type { McpTool } from '@inkeep/agents-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SystemPromptBuilder } from '../../agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../agents/types';
import { V1Config } from '../../agents/versions/V1Config';

// Mock the file system
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockReadFile = vi.mocked(readFile);

// Helper to create mock McpTool
function createMockMcpTool(name: string, availableTools: any[]): McpTool {
  return {
    id: `tool-${name}`,
    name,
    config: { mcp: { server: { url: 'http://example.com' } } },
    availableTools,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as McpTool;
}

describe('SystemPromptBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Generic Builder Functionality', () => {
    test('should successfully create builder with version config', () => {
      expect(() => new SystemPromptBuilder('v1', new V1Config())).not.toThrow();
    });

    test('should successfully load templates on first buildSystemPrompt call', async () => {
      mockReadFile.mockResolvedValueOnce('Mock system prompt template');
      mockReadFile.mockResolvedValueOnce('Mock tool template');
      mockReadFile.mockResolvedValueOnce('Mock data component template');
      mockReadFile.mockResolvedValueOnce('Mock artifact template');
      mockReadFile.mockResolvedValueOnce('Mock thinking preparation template');

      const builder = new SystemPromptBuilder('v1', new V1Config());
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      await builder.buildSystemPrompt(config);
      expect(mockReadFile).toHaveBeenCalledTimes(5);
    });

    test('should throw error when templates fail to load', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const builder = new SystemPromptBuilder('v1', new V1Config());
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      await expect(builder.buildSystemPrompt(config)).rejects.toThrow(
        'Template loading failed: Error: File not found'
      );
    });

    test('should throw error when system prompt template is missing', async () => {
      // Mock successful tool template load but system prompt missing
      mockReadFile.mockResolvedValueOnce(''); // system-prompt.xml (empty content)
      mockReadFile.mockResolvedValueOnce('Mock tool template'); // tool.xml
      mockReadFile.mockResolvedValueOnce('Mock data component template'); // data-component.xml
      mockReadFile.mockResolvedValueOnce('Mock artifact template'); // artifact.xml
      mockReadFile.mockResolvedValueOnce('Mock thinking preparation template'); // information-gathering.xml

      const builder = new SystemPromptBuilder('v1', new V1Config());
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      // This should succeed since we're loading templates successfully
      // The V1Config assembly logic will handle missing templates
      await expect(builder.buildSystemPrompt(config)).rejects.toThrow(
        'System prompt template not loaded'
      );
    });

    test('should throw error when tool template is missing', async () => {
      mockReadFile.mockResolvedValueOnce('Mock system prompt template');
      mockReadFile.mockResolvedValueOnce(''); // tool.xml (empty content)
      mockReadFile.mockResolvedValueOnce('Mock data component template'); // data-component.xml
      mockReadFile.mockResolvedValueOnce('Mock artifact template'); // artifact.xml
      mockReadFile.mockResolvedValueOnce('Mock thinking preparation template'); // information-gathering.xml

      const builder = new SystemPromptBuilder('v1', new V1Config());
      const mockTool = createMockMcpTool('test-server', [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {},
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      await expect(builder.buildSystemPrompt(config)).rejects.toThrow('Tool template not loaded');
    });

    test('should handle version parameter correctly', () => {
      const builder = new SystemPromptBuilder('v2', new V1Config());
      expect(builder.isLoaded()).toBe(false);
    });
  });

  describe('V1 System Prompt Generation', () => {
    let builder: SystemPromptBuilder<SystemPromptV1>;

    beforeEach(() => {
      builder = new SystemPromptBuilder('v1', new V1Config());

      // Mock successful template loading
      mockReadFile.mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('system-prompt.xml')) {
          return Promise.resolve(`<system_message>
<agent_identity>
You are a helpful AI assistant designed to help users with their tasks efficiently and accurately.
</agent_identity>

<core_instructions>
{{CORE_INSTRUCTIONS}}
</core_instructions>

{{ARTIFACTS_SECTION}}

{{TOOLS_SECTION}}

{{INFORMATION_GATHERING_INSTRUCTIONS}}

<behavioral_constraints>
- Always be helpful, harmless, and honest
- Follow instructions carefully and completely
- Ask for clarification when instructions are ambiguous
- Provide accurate and relevant information
</behavioral_constraints>

<response_format>
Provide clear, well-structured responses. Use appropriate formatting and be concise while ensuring completeness.
</response_format>
</system_message>`);
        }
        if (pathStr.includes('tool.xml')) {
          return Promise.resolve(`<tool>
  <name>{{TOOL_NAME}}</name>
  <description>{{TOOL_DESCRIPTION}}</description>
  <parameters_schema>
    {{TOOL_PARAMETERS_SCHEMA}}
  </parameters_schema>
  <usage_guidelines>{{TOOL_USAGE_GUIDELINES}}</usage_guidelines>
</tool>`);
        }
        if (pathStr.includes('data-component.xml')) {
          return Promise.resolve(`<data-component>
  <name>{{COMPONENT_NAME}}</name>
  <description>{{COMPONENT_DESCRIPTION}}</description>
  <props>
    <schema>
      {{COMPONENT_PROPS_SCHEMA}}
    </schema>
  </props>
</data-component>`);
        }
        if (pathStr.includes('artifact.xml')) {
          return Promise.resolve(`<artifact id="{{ARTIFACT_ID}}" task-id="{{TASK_ID}}">
  <name>{{ARTIFACT_NAME}}</name>
  <description>{{ARTIFACT_DESCRIPTION}}</description>
</artifact>`);
        }
        if (pathStr.includes('thinking-preparation.xml')) {
          return Promise.resolve(`<thinking_preparation_mode>
  CRITICAL INSTRUCTIONS:
  - Prepare your approach for complex reasoning
  - Consider what tools and information you need
  - Plan your strategy before taking action
  - Use systematic thinking and step-by-step planning
</thinking_preparation_mode>`);
        }
        return Promise.reject(new Error('Unknown template'));
      });
    });

    test('should generate basic system prompt with no tools', async () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain(
        '<available_tools description="No tools are currently available"></available_tools>'
      );
    });

    test('should generate system prompt with single tool', async () => {
      const mockTool = createMockMcpTool('knowledge-server', [
        {
          name: 'search_knowledge',
          description: 'Search the knowledge base for relevant information',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
              },
            },
            required: ['query'],
          },
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'You are a knowledge assistant.',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('You are a knowledge assistant.');
      expect(result).toContain('<name>search_knowledge</name>');
      expect(result).toContain('Search the knowledge base for relevant information');
      expect(result).toContain('"type": "string"');
      expect(result).toContain('"type": "number"');
      expect(result).toContain('["query"]');
    });

    test('should generate system prompt with multiple tools', async () => {
      const mockTool = createMockMcpTool('multi-server', [
        {
          name: 'tool_one',
          description: 'First tool',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'tool_two',
          description: 'Second tool',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'You are a multi-tool assistant.',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('You are a multi-tool assistant.');
      expect(result).toContain('<name>tool_one</name>');
      expect(result).toContain('<name>tool_two</name>');
      expect(result).toContain('First tool');
      expect(result).toContain('Second tool');
    });

    test('should handle tools with complex parameter schemas', async () => {
      const mockTool = createMockMcpTool('complex-server', [
        {
          name: 'complex_tool',
          description: 'A tool with complex parameters',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The name parameter',
              },
              count: {
                type: 'number',
                description: 'The count parameter',
              },
              enabled: {
                type: 'boolean',
                description: 'Whether the feature is enabled',
              },
            },
            required: ['name', 'count'],
          },
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'You are an assistant with complex tools.',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('<name>complex_tool</name>');
      expect(result).toContain('"type": "string"');
      expect(result).toContain('"type": "number"');
      expect(result).toContain('"type": "boolean"');
      expect(result).toContain('["name","count"]');
    });

    test('should handle tools with no required parameters', async () => {
      const mockTool = createMockMcpTool('optional-server', [
        {
          name: 'optional_tool',
          description: 'A tool with optional parameters',
          inputSchema: {
            type: 'object',
            properties: {
              optionalParam: {
                type: 'string',
                description: 'An optional parameter',
              },
            },
            required: [],
          },
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'You are an assistant.',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('<name>optional_tool</name>');
      expect(result).toContain('<required>[]</required>');
    });

    test('should handle tools with empty parameter schema', async () => {
      const mockTool = createMockMcpTool('simple-server', [
        {
          name: 'empty_tool',
          description: 'A tool with no parameters',
          inputSchema: undefined,
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'You are an assistant.',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('<name>empty_tool</name>');
      expect(result).toContain('<type>object</type>');
      expect(result).toContain('<required>[]</required>');
    });

    test('should preserve XML structure and formatting', async () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      // Check that the XML structure is maintained
      expect(result).toMatch(/<system_message>/);
      expect(result).toMatch(/<\/system_message>/);
      expect(result).toMatch(/<agent_identity>/);
      expect(result).toMatch(/<core_instructions>/);
      expect(result).toMatch(/<behavioral_constraints>/);
      expect(result).toMatch(/<response_format>/);
    });

    test('should handle special characters in instructions and descriptions', async () => {
      const mockTool = createMockMcpTool('special-server', [
        {
          name: 'special_tool',
          description: 'Tool with <tags> & "quotes" and \'apostrophes\'.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ]);

      const config: SystemPromptV1 = {
        corePrompt: 'Instructions with <special> & "characters" and \'quotes\'.',
        tools: [mockTool],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('Instructions with <special> & "characters" and \'quotes\'.');
      expect(result).toContain('Tool with <tags> & "quotes" and \'apostrophes\'.');
      expect(result).toContain('Use this tool from special-server server when appropriate.');
    });

    test('should include artifacts in system prompt', async () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [
          {
            artifactId: 'test-artifact-1',
            name: 'Test Documentation',
            description: 'Test artifact for documentation',
            parts: [
              {
                kind: 'data',
                data: { title: 'Test Doc', content: 'Test content' },
              },
            ],
            metadata: {
              aiMetadata: {
                url: 'https://example.com/test',
                title: 'Test Document',
                type: 'documentation',
              },
            },
          },
          {
            artifactId: 'test-artifact-2',
            name: 'API Reference',
            description: 'API documentation',
            parts: [
              {
                kind: 'data',
                data: { endpoints: ['GET /users', 'POST /users'] },
              },
            ],
            metadata: {
              aiMetadata: {
                url: 'https://api.example.com/docs',
                title: 'API Docs',
                type: 'api',
              },
            },
          },
        ],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('<name>Test Documentation</name>');
      expect(result).toContain('<description>Test artifact for documentation</description>');
      expect(result).toContain('<name>API Reference</name>');
      expect(result).toContain('<description>API documentation</description>');
    });

    test('should handle empty artifacts array', async () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toBeDefined();
      expect(result).toContain('Test instructions');
      // Should not contain artifact sections when empty
      expect(result).not.toContain('<artifact>');
    });

    test('should handle artifacts with missing metadata gracefully', async () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [
          {
            artifactId: 'incomplete-artifact',
            name: 'Incomplete Artifact',
            description: 'Artifact without metadata',
            parts: [
              {
                kind: 'text',
                text: 'Some text content',
              },
            ],
            // No metadata field
          },
        ],
        isThinkingPreparation: false,
      };

      const result = await builder.buildSystemPrompt(config);

      expect(result).toContain('<name>Incomplete Artifact</name>');
      expect(result).toContain('<description>Artifact without metadata</description>');
      expect(result).toBeDefined();
    });
  });
});
