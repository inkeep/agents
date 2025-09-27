import type { McpTool } from '@inkeep/agents-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SystemPromptBuilder } from '../../agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../agents/types';
import { Phase1Config } from '../../agents/versions/v1/Phase1Config';

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
      expect(() => new SystemPromptBuilder('v1', new Phase1Config())).not.toThrow();
    });

    test('should successfully load templates on first buildSystemPrompt call', () => {
      const builder = new SystemPromptBuilder('v1', new Phase1Config());
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = builder.buildSystemPrompt(config);
      expect(result).toBeDefined();
      expect(builder.isLoaded()).toBe(true);
      expect(builder.getLoadedTemplates()).toHaveLength(5);
    });

    test('should handle invalid configuration', () => {
      const builder = new SystemPromptBuilder('v1', new Phase1Config());

      expect(() => builder.buildSystemPrompt(null as any)).toThrow(
        'Configuration object is required'
      );
      expect(() => builder.buildSystemPrompt(undefined as any)).toThrow(
        'Configuration object is required'
      );
      expect(() => builder.buildSystemPrompt('invalid' as any)).toThrow(
        'Configuration must be an object'
      );
    });

    test('should handle version parameter correctly', () => {
      const builder = new SystemPromptBuilder('v2', new Phase1Config());
      expect(builder.isLoaded()).toBe(false);
    });
  });

  describe('V1 System Prompt Generation', () => {
    let builder: SystemPromptBuilder<SystemPromptV1>;

    beforeEach(() => {
      builder = new SystemPromptBuilder('v1', new Phase1Config());
    });

    test('should generate basic system prompt with no tools', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain(
        '<available_tools description="No tools are currently available"></available_tools>'
      );
    });

    test('should generate system prompt with single tool', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('You are a knowledge assistant.');
      expect(result).toContain('<name>search_knowledge</name>');
      expect(result).toContain('Search the knowledge base for relevant information');
      expect(result).toContain('"type": "string"');
      expect(result).toContain('"type": "number"');
      expect(result).toContain('["query"]');
    });

    test('should generate system prompt with multiple tools', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('You are a multi-tool assistant.');
      expect(result).toContain('<name>tool_one</name>');
      expect(result).toContain('<name>tool_two</name>');
      expect(result).toContain('First tool');
      expect(result).toContain('Second tool');
    });

    test('should handle tools with complex parameter schemas', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('<name>complex_tool</name>');
      expect(result).toContain('"type": "string"');
      expect(result).toContain('"type": "number"');
      expect(result).toContain('"type": "boolean"');
      expect(result).toContain('["name","count"]');
    });

    test('should handle tools with no required parameters', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('<name>optional_tool</name>');
      expect(result).toContain('<required>[]</required>');
    });

    test('should handle tools with empty parameter schema', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('<name>empty_tool</name>');
      expect(result).toContain('<type>object</type>');
      expect(result).toContain('<required>[]</required>');
    });

    test('should preserve XML structure and formatting', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = builder.buildSystemPrompt(config);

      // Check that the XML structure is maintained
      expect(result).toMatch(/<system_message>/);
      expect(result).toMatch(/<\/system_message>/);
      expect(result).toMatch(/<agent_identity>/);
      expect(result).toMatch(/<core_instructions>/);
      expect(result).toMatch(/<behavioral_constraints>/);
      expect(result).toMatch(/<response_format>/);
    });

    test('should handle special characters in instructions and descriptions', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('Instructions with <special> & "characters" and \'quotes\'.');
      expect(result).toContain('Tool with <tags> & "quotes" and \'apostrophes\'.');
      expect(result).toContain('Use this tool from special-server server when appropriate.');
    });

    test('should include artifacts in system prompt', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('<name>Test Documentation</name>');
      expect(result).toContain('<description>Test artifact for documentation</description>');
      expect(result).toContain('<name>API Reference</name>');
      expect(result).toContain('<description>API documentation</description>');
    });

    test('should handle empty artifacts array', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
      };

      const result = builder.buildSystemPrompt(config);

      expect(result).toBeDefined();
      expect(result).toContain('Test instructions');
      // Should not contain artifact sections when empty
      expect(result).not.toContain('<artifact>');
    });

    test('should handle artifacts with missing metadata gracefully', () => {
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

      const result = builder.buildSystemPrompt(config);

      expect(result).toContain('<name>Incomplete Artifact</name>');
      expect(result).toContain('<description>Artifact without metadata</description>');
      expect(result).toBeDefined();
    });
  });
});
