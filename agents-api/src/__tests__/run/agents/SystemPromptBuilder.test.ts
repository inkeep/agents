import type { McpTool } from '@inkeep/agents-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SkillData, SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

// Helper to create mock McpTool
function createMockMcpTool(name: string, availableTools: any[]): McpTool {
  return {
    id: `tool-${name}`,
    name,
    tenantId: 'test-tenant',
    projectId: 'test-project',
    description: '',
    config: {
      type: 'mcp',
      mcp: { server: { url: 'http://example.com' } },
    },
    availableTools,
    status: 'healthy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('SystemPromptBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Generic Builder Functionality', () => {
    test('should successfully create builder with version config', () => {
      expect(() => new SystemPromptBuilder('v1', new PromptConfig())).not.toThrow();
    });

    test('should successfully load templates on first buildSystemPrompt call', () => {
      const builder = new SystemPromptBuilder('v1', new PromptConfig());
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
      };

      const result = builder.buildSystemPrompt(config);
      expect(result).toBeDefined();
      expect(builder.isLoaded()).toBe(true);
      expect(builder.getLoadedTemplates()).toHaveLength(4);
    });

    test('should handle invalid configuration', () => {
      const builder = new SystemPromptBuilder('v1', new PromptConfig());

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
      const builder = new SystemPromptBuilder('v2', new PromptConfig());
      expect(builder.isLoaded()).toBe(false);
    });
  });

  describe('V1 System Prompt Generation', () => {
    let builder: SystemPromptBuilder<SystemPromptV1>;

    beforeEach(() => {
      builder = new SystemPromptBuilder('v1', new PromptConfig());
    });

    test('should generate basic system prompt with no tools', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a helpful assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('You are a helpful assistant.');
      expect(result.prompt).toContain(
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
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('You are a knowledge assistant.');
      expect(result.prompt).toContain('<name>search_knowledge</name>');
      expect(result.prompt).toContain('Search the knowledge base for relevant information');
      expect(result.prompt).toContain('"type": "string"');
      expect(result.prompt).toContain('"type": "number"');
      expect(result.prompt).toContain('["query"]');
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
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('You are a multi-tool assistant.');
      expect(result.prompt).toContain('<name>tool_one</name>');
      expect(result.prompt).toContain('<name>tool_two</name>');
      expect(result.prompt).toContain('First tool');
      expect(result.prompt).toContain('Second tool');
    });

    const baseSkill = {
      subAgentSkillId: '',
      metadata: null,
      description: '',
      alwaysLoaded: true,
    } satisfies Partial<SkillData>;

    test('should include skills section in order when provided', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a skill-aware assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
        skills: [
          {
            ...baseSkill,
            id: 'second-skill',
            name: 'second-skill',
            content: 'Second content',
            index: 1,
          },
          {
            ...baseSkill,
            id: 'first-skill',
            name: 'first-skill',
            content: 'First content',
            index: 0,
          },
        ],
      };

      const { prompt } = builder.buildSystemPrompt(config);
      expect(prompt).toContain('<skills>');
      expect(prompt).toContain(
        '<skill mode="always" name="first-skill" description="">First content</skill>'
      );
      expect(prompt).toContain(
        '<skill mode="always" name="second-skill" description="">Second content</skill>'
      );
      expect(prompt.indexOf('first-skill')).toBeLessThan(prompt.indexOf('second-skill'));
    });

    test('should include on-demand skills outline and exclude their content', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a skill-aware assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
        skills: [
          {
            ...baseSkill,
            id: 'always-loaded-skill',
            name: 'always-loaded-skill',
            content: 'Always content',
            index: 0,
          },
          {
            ...baseSkill,
            id: 'on-demand-skill',
            name: 'on-demand-skill',
            content: 'On demand content',
            description: 'On demand description',
            alwaysLoaded: false,
            index: 1,
          },
        ],
      };

      const { prompt } = builder.buildSystemPrompt(config);
      expect(prompt).toContain(
        '<skill mode="on_demand" name="on-demand-skill" description="On demand description" />'
      );
      expect(prompt).not.toContain('On demand content');
    });

    test('should exclude skills that are not always loaded', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'You are a skill-aware assistant.',
        tools: [],
        dataComponents: [],
        artifacts: [],
        isThinkingPreparation: false,
        skills: [
          {
            id: 'always-loaded-skill',
            name: 'always-loaded-skill',
            content: 'Always content',
            description: 'Always description',
            metadata: null,
            subAgentSkillId: 'foo',
            index: 1,
            alwaysLoaded: true,
          },
          {
            id: 'on-demand-skill',
            name: 'on-demand-skill',
            content: 'On demand content',
            description: 'On demand description',
            metadata: null,
            subAgentSkillId: 'bar',
            index: 2,
            alwaysLoaded: false,
          },
        ],
      };

      const { prompt } = builder.buildSystemPrompt(config);
      expect(prompt).toContain(
        '<skill mode="always" name="always-loaded-skill" description="Always description">Always content</skill>'
      );
      expect(prompt).toContain(
        '<skill mode="on_demand" name="on-demand-skill" description="On demand description" />'
      );
      expect(prompt).not.toContain('On demand content');
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
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('<name>complex_tool</name>');
      expect(result.prompt).toContain('"type": "string"');
      expect(result.prompt).toContain('"type": "number"');
      expect(result.prompt).toContain('"type": "boolean"');
      expect(result.prompt).toContain('["name","count"]');
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
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('<name>optional_tool</name>');
      expect(result.prompt).toContain('<required>[]</required>');
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
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('<name>empty_tool</name>');
      expect(result.prompt).toContain('<type>object</type>');
      expect(result.prompt).toContain('<required>[]</required>');
    });

    test('should preserve XML structure and formatting', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
      };

      const result = builder.buildSystemPrompt(config);

      // Check that the XML structure is maintained
      expect(result.prompt).toMatch(/<system_message>/);
      expect(result.prompt).toMatch(/<\/system_message>/);
      expect(result.prompt).toMatch(/<agent_identity>/);
      expect(result.prompt).toMatch(/<core_instructions>/);
      expect(result.prompt).toMatch(/<behavioral_constraints>/);
      expect(result.prompt).toMatch(/<response_format>/);
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
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('Instructions with <special> & "characters" and \'quotes\'.');
      expect(result.prompt).toContain('Tool with <tags> & "quotes" and \'apostrophes\'.');
      expect(result.prompt).toContain('Use this tool from special-server server when appropriate.');
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
            createdAt: '2024-01-15T18:30:00.000Z',
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
            createdAt: '2024-01-15T19:30:00.000Z',
          },
        ],
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('<name>Test Documentation</name>');
      expect(result.prompt).toContain('<description>Test artifact for documentation</description>');
      expect(result.prompt).toContain('<name>API Reference</name>');
      expect(result.prompt).toContain('<description>API documentation</description>');
    });

    test('should handle empty artifacts array', () => {
      const config: SystemPromptV1 = {
        corePrompt: 'Test instructions',
        tools: [],
        dataComponents: [],
        artifacts: [],
      };

      const result = builder.buildSystemPrompt(config);

      expect(result).toBeDefined();
      expect(result.prompt).toContain('Test instructions');
      // Should not contain artifact sections when empty
      expect(result.prompt).not.toContain('<artifact>');
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
            createdAt: '2024-01-15T20:30:00.000Z',
          },
        ],
      };

      const result = builder.buildSystemPrompt(config);

      expect(result.prompt).toContain('<name>Incomplete Artifact</name>');
      expect(result.prompt).toContain('<description>Artifact without metadata</description>');
      expect(result).toBeDefined();
    });
  });
});
