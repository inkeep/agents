import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveToolResultTool } from '../../agents/artifactTools';
import { parseEmbeddedJson } from '../../agents/generateTaskHandler';
import { toolSessionManager } from '../../agents/ToolSessionManager';

// Mock the ai package's tool function
vi.mock('ai', () => ({
  tool: (config: any) => ({
    ...config,
    execute: config.execute,
  }),
}));

// Mock JMESPath
vi.mock('jmespath', () => ({
  default: {
    search: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock nanoid for predictable IDs
vi.mock('nanoid', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    nanoid: vi.fn(() => 'test-artifact-id'),
  };
});

// Mock ledger artifacts data layer
vi.mock('../../data/ledgerArtifacts.js', () => ({
  addLedgerArtifacts: vi.fn().mockResolvedValue(undefined),
}));

import jmespath from 'jmespath';

describe('Artifact Tools', () => {
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const contextId = 'test-context';
  const taskId = 'test-task';
  let sessionId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create session with correct parameters: tenantId, projectId, contextId, taskId
    sessionId = toolSessionManager.createSession(tenantId, projectId, contextId, taskId);
  });

  afterEach(() => {
    // Clean up all sessions
    if (sessionId) {
      toolSessionManager.endSession(sessionId);
    }
  });

  describe('JMESPath Expression Validation', () => {
    it('should validate JMESPath expressions', async () => {
      const saveToolResultTool = createSaveToolResultTool(sessionId);

      // Mock tool result data with embedded JSON
      const toolResult = {
        toolCallId: 'test-call-id',
        toolName: 'test-tool',
        result: {
          content: [
            {
              text: {
                content: JSON.stringify([
                  {
                    title: 'Web Sources',
                    type: 'documentation',
                    url: 'https://example.com/docs',
                  },
                  {
                    title: 'API Guide',
                    type: 'tutorial',
                    url: 'https://example.com/api',
                  },
                ]),
              },
            },
          ],
        },
        timestamp: Date.now(),
      };

      // Register the tool result
      toolSessionManager.recordToolResult(sessionId, toolResult);

      // Mock JMESPath to return valid results
      vi.mocked(jmespath.search).mockReturnValue([
        {
          title: 'Web Sources',
          type: 'documentation',
          url: 'https://example.com/docs',
        },
      ]);

      const result = await saveToolResultTool.execute({
        toolCallId: 'test-call-id',
        baseSelector: 'result.content[0].text.content[?title==`Web Sources`]',
        propSelectors: {
          url: 'url',
          title: 'title',
          type: 'type',
        },
        name: 'Web Sources Documentation',
        description: 'Documentation about web sources',
      });

      expect(result.saved).toBe(true);
      expect(result.artifacts).toBeDefined();
      expect(Object.keys(result.artifacts)).toHaveLength(1);

      // Verify JMESPath was called with parsed data
      expect(jmespath.search).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.objectContaining({
                  content: expect.arrayContaining([
                    expect.objectContaining({
                      title: 'Web Sources',
                      type: 'documentation',
                      url: 'https://example.com/docs',
                    }),
                  ]),
                }),
              }),
            ]),
          }),
        }),
        'result.content[0].text.content[?title==`Web Sources`]'
      );
    });

    it('should handle invalid JMESPath expressions gracefully', async () => {
      const saveToolResultTool = createSaveToolResultTool(sessionId);

      const toolResult = {
        toolCallId: 'invalid-call-id',
        toolName: 'test-tool',
        result: { data: 'test' },
        timestamp: Date.now(),
      };

      toolSessionManager.recordToolResult(sessionId, toolResult);

      // Mock JMESPath to throw error for invalid expression
      vi.mocked(jmespath.search).mockImplementation(() => {
        throw new Error('Invalid JMESPath expression');
      });

      const result = await saveToolResultTool.execute({
        toolCallId: 'invalid-call-id',
        baseSelector: 'result.invalid[expression',
        propSelectors: {},
        name: 'Test Artifact',
        description: 'Test description',
      });

      expect(result.saved).toBe(false);
      expect(result.error).toBe('[toolCallId: invalid-call-id] Invalid JMESPath expression');
    });

    it('should handle repeated field names in nested structures', async () => {
      const saveToolResultTool = createSaveToolResultTool(sessionId);

      // Mock complex nested data structure with repeated field names
      const complexData = {
        data: {
          responses: [
            {
              data: [
                { id: 1, type: 'tutorial', title: 'Guide 1' },
                { id: 2, type: 'documentation', title: 'Guide 2' },
              ],
            },
          ],
        },
      };

      const toolResult = {
        toolCallId: 'complex-call-id',
        toolName: 'test-tool',
        result: complexData,
        timestamp: Date.now(),
      };

      toolSessionManager.recordToolResult(sessionId, toolResult);

      // Mock JMESPath to return filtered results
      vi.mocked(jmespath.search).mockReturnValue([{ id: 1, type: 'tutorial', title: 'Guide 1' }]);

      const result = await saveToolResultTool.execute({
        toolCallId: 'complex-call-id',
        baseSelector: 'result.data.responses[0].data[?type==`tutorial`]',
        propSelectors: {
          id: 'id',
          type: 'type',
          title: 'title',
        },
        name: 'Tutorial Guides',
        description: 'Tutorial documentation',
      });

      expect(result.saved).toBe(true);
      expect(jmespath.search).toHaveBeenCalledWith(
        expect.objectContaining({
          result: complexData,
        }),
        'result.data.responses[0].data[?type==`tutorial`]'
      );
    });

    it('should handle missing tool results gracefully', async () => {
      const saveToolResultTool = createSaveToolResultTool(sessionId);

      const result = await saveToolResultTool.execute({
        toolCallId: 'nonexistent-call-id',
        baseSelector: 'result.data[?type==`test`]',
        propSelectors: {},
        name: 'Test Artifact',
        description: 'Test description',
      });

      expect(result.saved).toBe(false);
      expect(result.error).toBe('[toolCallId: nonexistent-call-id] Tool result not found');
    });

    it('should extract aiMetadata correctly', async () => {
      const saveToolResultTool = createSaveToolResultTool(sessionId);

      const toolResult = {
        toolCallId: 'metadata-call-id',
        toolName: 'test-tool',
        result: {
          documents: [
            {
              title: 'API Documentation',
              url: 'https://api.example.com/docs',
              record_type: 'api',
              content: 'API usage guide',
            },
          ],
        },
        timestamp: Date.now(),
      };

      toolSessionManager.recordToolResult(sessionId, toolResult);

      // Mock JMESPath for main selector
      vi.mocked(jmespath.search).mockImplementation((data, expr) => {
        if (expr === 'result.documents[?record_type==`api`]') {
          return [toolResult.result.documents[0]];
        }
        // For aiMetadata extraction
        if (expr === 'url') return 'https://api.example.com/docs';
        if (expr === 'title') return 'API Documentation';
        if (expr === 'record_type') return 'api';
        return null;
      });

      const result = await saveToolResultTool.execute({
        toolCallId: 'metadata-call-id',
        baseSelector: 'result.documents[?record_type==`api`]',
        propSelectors: {
          source_url: 'url',
          document_title: 'title',
          content_type: 'record_type',
        },
        name: 'API Documentation',
        description: 'API reference documentation',
      });

      expect(result.saved).toBe(true);
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts).toHaveLength(1);

      // Verify artifact was extracted correctly
      const artifact = result.artifacts[0];

      // Note: In the new implementation, name and description are generated asynchronously
      // The immediate response only contains artifactId, taskId, and summaryData
      expect(artifact.artifactId).toBeDefined();
      expect(artifact.taskId).toBeDefined();
      expect(artifact.summaryData).toBeDefined();
    });
  });

  describe('parseEmbeddedJson Function', () => {
    it('should parse embedded JSON strings correctly', () => {
      const testData = {
        content: [
          {
            text: {
              content: JSON.stringify([
                {
                  title: 'Web Sources',
                  type: 'documentation',
                  url: 'https://example.com/docs',
                },
                {
                  title: 'API Guide',
                  type: 'tutorial',
                  url: 'https://example.com/api',
                },
              ]),
            },
          },
        ],
      };

      const parsed = parseEmbeddedJson(testData);

      expect(parsed.content[0].text.content).toBeInstanceOf(Array);
      expect(parsed.content[0].text.content).toHaveLength(2);
      expect(parsed.content[0].text.content[0]).toMatchObject({
        title: 'Web Sources',
        type: 'documentation',
        url: 'https://example.com/docs',
      });
    });

    it('should handle nested JSON structures with repeated labels', () => {
      const complexData = {
        data: JSON.stringify({
          responses: [
            {
              data: JSON.stringify([
                { title: 'Doc 1', type: 'guide' },
                { title: 'Doc 2', type: 'tutorial' },
              ]),
            },
          ],
        }),
      };

      const parsed = parseEmbeddedJson(complexData);

      expect(parsed.data).toBeInstanceOf(Object);
      expect(parsed.data.responses).toBeInstanceOf(Array);
      expect(parsed.data.responses[0].data).toBeInstanceOf(Array);
      expect(parsed.data.responses[0].data).toHaveLength(2);
    });

    it('should preserve non-JSON strings unchanged', () => {
      const testData = {
        normalString: 'This is just text',
        number: 42,
        jsonString: '{"valid": "json"}',
        invalidJson: '{"invalid": json}',
      };

      const parsed = parseEmbeddedJson(testData);

      expect(parsed.normalString).toBe('This is just text');
      expect(parsed.number).toBe(42);
      expect(parsed.jsonString).toEqual({ valid: 'json' });
      expect(parsed.invalidJson).toBe('{"invalid": json}'); // Should remain unchanged
    });

    it('should handle deeply nested structures', () => {
      const deepData = {
        level1: JSON.stringify({
          level2: JSON.stringify({
            level3: JSON.stringify([
              { name: 'item1', value: 'data1' },
              { name: 'item2', value: 'data2' },
            ]),
          }),
        }),
      };

      const parsed = parseEmbeddedJson(deepData);

      expect(parsed.level1.level2.level3).toBeInstanceOf(Array);
      expect(parsed.level1.level2.level3).toHaveLength(2);
      expect(parsed.level1.level2.level3[0].name).toBe('item1');
    });
  });
});
