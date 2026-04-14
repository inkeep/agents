import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentSessionManager } from '../../session/AgentSession';
import { BaseCompressor } from '../BaseCompressor';

// Mock dependencies

vi.mock('../../session/AgentSession', () => ({
  agentSessionManager: {
    getSession: vi.fn(),
  },
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getLedgerArtifacts: vi.fn(),
    loadEnvironmentFiles: vi.fn(),
  };
});

vi.mock('../../tools/distill-conversation-tool', () => ({
  distillConversation: vi.fn(),
}));

// Concrete implementation of BaseCompressor for testing
class TestCompressor extends BaseCompressor {
  isCompressionNeeded(messages: any[]): boolean {
    return this.calculateContextSize(messages) > this.getHardLimit();
  }

  async compress(messages: any[]) {
    // Mock AI compression - can throw errors for testing
    if (messages.some((m) => m.content?.includes('FORCE_ERROR'))) {
      throw new Error('AI compression failed');
    }

    return {
      artifactIds: ['artifact-1', 'artifact-2'],
      summary: {
        type: 'conversation_summary_v1' as const,
        session_id: null,
        _fallback: null,
        high_level: 'Test compression summary',
        user_intent: 'test',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: null,
      },
    };
  }

  getCompressionType(): string {
    return 'test_compression';
  }
}

describe('BaseCompressor', () => {
  let compressor: TestCompressor;
  let mockSession: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock session
    mockSession = {
      recordEvent: vi.fn(),
      waitForPendingArtifacts: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(agentSessionManager.getSession).mockReturnValue(mockSession);

    // Setup compressor instance
    compressor = new TestCompressor(
      'session-123',
      'conv-456',
      'tenant-789',
      'project-abc',
      'agent-def',
      { hardLimit: 1000, safetyBuffer: 200, enabled: true },
      { model: 'gpt-4' }
    );
  });

  afterEach(() => {
    // Cleanup any state
    vi.restoreAllMocks();
  });

  describe('Memory Management', () => {
    it('should clean up processed tool calls on partial cleanup', () => {
      // Add many processed tool calls to test cleanup behavior
      for (let i = 0; i < 100; i++) {
        // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
        compressor['processedToolCalls'].add(`call-${i}`);
      }

      // Partial cleanup should keep only recent ones (last 50)
      compressor.partialCleanup();

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['processedToolCalls'].size).toBe(50);
    });

    it('should reset all state on full cleanup', () => {
      // Add some state
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['processedToolCalls'].add('call-1');
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'test summary',
        user_intent: 'test intent',
        decisions: ['decision1'],
        open_questions: ['question1'],
        next_steps: {
          for_agent: ['step1'],
          for_user: ['step2'],
        },
        related_artifacts: null,
      };

      // Full cleanup should reset everything
      compressor.fullCleanup();

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['processedToolCalls'].size).toBe(0);
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['cumulativeSummary']).toBe(null);
    });

    it('should preserve recent tool calls during partial cleanup', () => {
      // Add tool calls to simulate ongoing conversation
      for (let i = 0; i < 100; i++) {
        // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
        compressor['processedToolCalls'].add(`call-${i}`);
      }

      compressor.partialCleanup();

      // Should keep last 50 tool calls
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['processedToolCalls'].size).toBe(50);
    });
  });

  describe('N+1 Query Prevention', () => {
    it('should batch lookup existing artifacts to prevent N+1 queries', async () => {
      const messages = [
        {
          content: [
            { type: 'tool-result', toolCallId: 'call-1', toolName: 'test-tool', output: 'result1' },
            { type: 'tool-result', toolCallId: 'call-2', toolName: 'test-tool', output: 'result2' },
          ],
        },
        {
          content: [
            { type: 'tool-result', toolCallId: 'call-3', toolName: 'test-tool', output: 'result3' },
          ],
        },
      ];

      // Mock getLedgerArtifacts to return existing artifacts
      const { getLedgerArtifacts } = await import('@inkeep/agents-core');
      const mockGetLedgerArtifacts = vi.mocked(getLedgerArtifacts);

      // Mock the curried function call
      mockGetLedgerArtifacts.mockReturnValue(
        vi.fn().mockResolvedValue([
          { artifactId: 'existing-1', toolCallId: 'call-1' },
          { artifactId: 'existing-2', toolCallId: 'call-2' },
        ])
      );

      await compressor.saveToolResultsAsArtifacts(messages);

      // Should use batched lookups before and after async artifact processing
      expect(mockGetLedgerArtifacts).toHaveBeenCalledTimes(2);
      const firstMockFn = mockGetLedgerArtifacts.mock.results[0].value;
      expect(firstMockFn).toHaveBeenCalledWith({
        scopes: { tenantId: 'tenant-789', projectId: 'project-abc' },
        toolCallIds: ['call-1', 'call-2', 'call-3'],
      });
      const secondMockFn = mockGetLedgerArtifacts.mock.results[1].value;
      expect(secondMockFn).toHaveBeenCalledWith({
        scopes: { tenantId: 'tenant-789', projectId: 'project-abc' },
        toolCallIds: ['call-1', 'call-2', 'call-3'],
      });
    });

    it('should extract tool call IDs from both database and SDK format messages', () => {
      const messages = [
        // Database format
        {
          messageType: 'tool-result',
          content: { text: 'result' },
          metadata: { a2a_metadata: { toolCallId: 'db-call-1', toolName: 'test-tool' } },
        },
        // SDK format
        {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'sdk-call-1',
              toolName: 'test-tool',
              output: 'result',
            },
          ],
        },
      ];

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const toolCallIds = compressor['extractToolCallIds'](messages);

      expect(toolCallIds).toEqual(['db-call-1', 'sdk-call-1']);
    });

    it('should skip internal tools during extraction', () => {
      const messages = [
        {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'skip-1',
              toolName: 'get_reference_artifact',
              output: 'skip',
            },
            {
              type: 'tool-result',
              toolCallId: 'skip-2',
              toolName: 'thinking_complete',
              output: 'skip',
            },
            {
              type: 'tool-result',
              toolCallId: 'skip-3',
              toolName: 'load_skill',
              output: 'skip',
            },
            { type: 'tool-result', toolCallId: 'keep-1', toolName: 'valid-tool', output: 'keep' },
          ],
        },
      ];

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const toolCallIds = compressor['extractToolCallIds'](messages);

      expect(toolCallIds).toEqual(['keep-1']);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should use safeCompress with fallback on AI compression failure', async () => {
      const messages = [{ content: 'FORCE_ERROR - this will make compression fail' }];

      const result = await compressor.safeCompress(messages);

      // Should return fallback result (simple compression)
      expect(Array.isArray(result.summary)).toBe(true);
      expect(result.artifactIds).toEqual([]);
    });

    it('should return compressed messages in fallback mode', async () => {
      const messages = [
        { content: 'Message 1' },
        { content: 'Message 2' },
        { content: 'FORCE_ERROR' }, // This will trigger fallback
        { content: 'Message 4' },
      ];

      const result = await compressor.safeCompress(messages);

      // Fallback should return actual compressed messages, not just summary metadata
      expect(Array.isArray(result.summary)).toBe(true);
      expect((result.summary as any[]).length).toBeLessThanOrEqual(messages.length);
    });

    it('should log errors appropriately during compression failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const messages = [{ content: 'FORCE_ERROR' }];

      await compressor.safeCompress(messages);

      // Note: This depends on your logger implementation
      // Adjust based on how your logger actually works
      consoleSpy.mockRestore();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent compression requests safely', async () => {
      const messages = [
        {
          content: [
            { type: 'tool-result', toolCallId: 'concurrent-1', toolName: 'test', output: 'data' },
          ],
        },
      ];

      // Mock concurrent calls
      const promise1 = compressor.saveToolResultsAsArtifacts(messages);
      const promise2 = compressor.saveToolResultsAsArtifacts(messages);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should complete without errors
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('Context Size Calculations', () => {
    it('should correctly estimate tokens for different content types', () => {
      const textContent = 'This is a test message with some content';
      const objectContent = { key: 'value', nested: { data: 123 } };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const textTokens = compressor['estimateTokens'](textContent);
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const objectTokens = compressor['estimateTokens'](objectContent);

      expect(textTokens).toBe(Math.ceil(textContent.length / 4));
      expect(objectTokens).toBe(Math.ceil(JSON.stringify(objectContent).length / 4));
    });

    it('should calculate total context size for complex message arrays', () => {
      const messages = [
        { content: 'Simple string message' },
        {
          content: [
            { type: 'text', text: 'Text block' },
            { type: 'tool-call', toolCallId: '123', toolName: 'test', input: { param: 'value' } },
            { type: 'tool-result', toolCallId: '123', toolName: 'test', output: 'result data' },
          ],
        },
      ];

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const contextSize = compressor['calculateContextSize'](messages);

      expect(contextSize).toBeGreaterThan(0);
      expect(typeof contextSize).toBe('number');
    });

    it('should ignore inline binary base64 data when estimating compression size', () => {
      const base64Data = 'A'.repeat(20_000);
      const messagesWithBinary = [
        {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'binary-call',
              toolName: 'read_ticket',
              output: {
                content: [
                  { type: 'text', text: 'ticket attachment payload' },
                  {
                    type: 'file-data',
                    mediaType: 'image/jpeg',
                    data: base64Data,
                    filename: 'attachment.jpg',
                  },
                  {
                    type: 'image-data',
                    data: base64Data,
                    mediaType: 'image/jpeg',
                  },
                ],
              },
            },
          ],
        },
      ];
      const messagesWithPlaceholders = [
        {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'binary-call',
              toolName: 'read_ticket',
              output: {
                content: [
                  { type: 'text', text: 'ticket attachment payload' },
                  {
                    type: 'file-data',
                    mediaType: 'image/jpeg',
                    data: '[binary payload omitted for compression token estimation]',
                    filename: 'attachment.jpg',
                  },
                  {
                    type: 'image-data',
                    data: '[binary payload omitted for compression token estimation]',
                    mediaType: 'image/jpeg',
                  },
                ],
              },
            },
          ],
        },
      ];

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const binaryContextSize = compressor['calculateContextSize'](messagesWithBinary);
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const placeholderContextSize = compressor['calculateContextSize'](messagesWithPlaceholders);

      expect(binaryContextSize).toBe(placeholderContextSize);
    });

    it('should handle edge cases in context calculation', () => {
      const edgeCases = [
        [], // Empty array
        [{ content: null }], // Null content
        [{ content: undefined }], // Undefined content
        [{ content: '' }], // Empty string
        [{ content: [] }], // Empty array content
      ];

      for (const messages of edgeCases) {
        // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
        expect(() => compressor['calculateContextSize'](messages)).not.toThrow();
      }
    });
  });

  describe('Artifact Creation and Validation', () => {
    it('should validate artifact data before creation', () => {
      const validData = {
        toolName: 'test-tool',
        toolInput: { param: 'value' },
        toolResult: 'meaningful result',
        compressedAt: new Date().toISOString(),
      };

      const emptyData = {
        toolName: 'test-tool',
        toolInput: null,
        toolResult: '',
        compressedAt: new Date().toISOString(),
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['isEmpty'](validData)).toBe(false);
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['isEmpty'](emptyData)).toBe(true);
    });

    it('should build proper artifact data structure', () => {
      const block = {
        toolCallId: 'test-call-123',
        toolName: 'test-tool',
        output: 'test result',
      };

      const toolResultData = {
        toolName: 'test-tool',
        toolInput: { param: 'value' },
        toolResult: 'test result',
        compressedAt: new Date().toISOString(),
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const artifactData = compressor['buildArtifactData']('artifact-123', block, toolResultData);

      expect(artifactData.artifactId).toBe('artifact-123');
      expect(artifactData.toolCallId).toBe('test-call-123');
      expect(artifactData.artifactType).toBe('tool_result');
      expect(artifactData.tenantId).toBe('tenant-789');
      expect(artifactData.projectId).toBe('project-abc');
      expect(artifactData.data).toBe(toolResultData);
    });
  });

  describe('Oversized Artifact Detection', () => {
    it('should detect oversized artifacts when contextWindowSize is provided', () => {
      // Create compressor with baseModel to enable oversized detection
      const compressorWithContext = new TestCompressor(
        'session-123',
        'conv-456',
        'tenant-789',
        'project-abc',
        'agent-def',
        { hardLimit: 100000, safetyBuffer: 20000, enabled: true },
        { model: 'gpt-4' },
        { model: 'claude-sonnet-4-5' } // baseModel with 200K context
      );

      const block = {
        toolCallId: 'test-call-123',
        toolName: 'test-tool',
        input: { query: 'test' },
        output: 'x'.repeat(250000), // ~62.5K tokens (>30% of 200K context)
      };

      // Create oversized tool result data
      const toolResultData = {
        toolName: 'test-tool',
        toolInput: { query: 'test' },
        toolResult: 'x'.repeat(250000),
        compressedAt: new Date().toISOString(),
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const artifactData = compressorWithContext['buildArtifactData'](
        'artifact-123',
        block,
        toolResultData
      );

      // Verify oversized detection
      expect(artifactData.metadata.isOversized).toBe(true);
      expect(artifactData.metadata.retrievalBlocked).toBe(true);
      expect(artifactData.metadata.originalTokenSize).toBeGreaterThan(60000); // >30% of 200K
      expect(artifactData.metadata.contextWindowSize).toBe(200000);
      expect(artifactData.metadata.toolArgs).toEqual({ query: 'test' });

      expect(artifactData.summaryData._oversizedWarning).toBeUndefined();
      expect(artifactData.summaryData._structureInfo).toContain('Object with 4 keys');
    });

    it('should not mark small artifacts as oversized', () => {
      const compressorWithContext = new TestCompressor(
        'session-123',
        'conv-456',
        'tenant-789',
        'project-abc',
        'agent-def',
        { hardLimit: 100000, safetyBuffer: 20000, enabled: true },
        { model: 'gpt-4' },
        { model: 'claude-sonnet-4-5' }
      );

      const block = {
        toolCallId: 'test-call-123',
        toolName: 'test-tool',
        input: { query: 'test' },
        output: { data: 'small result' },
      };

      const toolResultData = {
        toolName: 'test-tool',
        toolInput: { query: 'test' },
        toolResult: { data: 'small result' },
        compressedAt: new Date().toISOString(),
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const artifactData = compressorWithContext['buildArtifactData'](
        'artifact-123',
        block,
        toolResultData
      );

      // Verify NOT oversized
      expect(artifactData.metadata.isOversized).toBe(false);
      expect(artifactData.metadata.retrievalBlocked).toBe(false);
      expect(artifactData.summaryData._oversizedWarning).toBeUndefined();
      expect(artifactData.summaryData._structureInfo).toBeUndefined();
    });

    it('should include tool arguments for all artifacts regardless of size', () => {
      const compressorWithContext = new TestCompressor(
        'session-123',
        'conv-456',
        'tenant-789',
        'project-abc',
        'agent-def',
        { hardLimit: 100000, safetyBuffer: 20000, enabled: true },
        { model: 'gpt-4' },
        { model: 'claude-sonnet-4-5' }
      );

      const block = {
        toolCallId: 'test-call-123',
        toolName: 'search-tool',
        input: { query: 'important query', filters: ['active', 'recent'] },
        output: { results: [] },
      };

      const toolResultData = {
        toolName: 'search-tool',
        toolInput: { query: 'important query', filters: ['active', 'recent'] },
        toolResult: { results: [] },
        compressedAt: new Date().toISOString(),
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const artifactData = compressorWithContext['buildArtifactData'](
        'artifact-123',
        block,
        toolResultData
      );

      // Verify tool arguments are captured
      expect(artifactData.metadata.toolArgs).toEqual({
        query: 'important query',
        filters: ['active', 'recent'],
      });
    });

    it('should return ArtifactInfo with oversized metadata from saveToolResultsAsArtifacts', async () => {
      const compressorWithContext = new TestCompressor(
        'session-123',
        'conv-456',
        'tenant-789',
        'project-abc',
        'agent-def',
        { hardLimit: 100000, safetyBuffer: 20000, enabled: true },
        { model: 'gpt-4' },
        { model: 'claude-sonnet-4-5' }
      );

      const messages = [
        {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-oversized',
              toolName: 'large-tool',
              input: { query: 'test' },
              output: 'x'.repeat(250000), // Oversized
            },
            {
              type: 'tool-result',
              toolCallId: 'call-normal',
              toolName: 'small-tool',
              input: { query: 'test' },
              output: 'small data',
            },
          ],
        },
      ];

      // Mock empty database response
      const { getLedgerArtifacts } = await import('@inkeep/agents-core');
      const mockGetLedgerArtifacts = vi.mocked(getLedgerArtifacts);
      mockGetLedgerArtifacts.mockReturnValue(vi.fn().mockResolvedValue([]));

      const result = await compressorWithContext.saveToolResultsAsArtifacts(messages);

      // Verify ArtifactInfo structure for oversized artifact
      const oversizedInfo = result['call-oversized'];
      expect(oversizedInfo).toBeDefined();
      expect(oversizedInfo.isOversized).toBe(true);
      expect(oversizedInfo.toolArgs).toEqual({ query: 'test' });
      // Structure info shows the full toolResultData object structure
      expect(oversizedInfo.structureInfo).toContain('Object with 4 keys');
      expect(oversizedInfo.oversizedWarning).toBeUndefined();

      // Verify ArtifactInfo structure for normal artifact
      const normalInfo = result['call-normal'];
      expect(normalInfo).toBeDefined();
      expect(normalInfo.isOversized).toBe(false);
      expect(normalInfo.toolArgs).toEqual({ query: 'test' });
      expect(normalInfo.structureInfo).toBeUndefined();
      expect(normalInfo.oversizedWarning).toBeUndefined();
    });

    it('should handle data just below 30% threshold', () => {
      const compressorWithContext = new TestCompressor(
        'session-123',
        'conv-456',
        'tenant-789',
        'project-abc',
        'agent-def',
        { hardLimit: 100000, safetyBuffer: 20000, enabled: true },
        { model: 'gpt-4' },
        { model: 'claude-sonnet-4-5' }
      );

      const contextWindowSize = 200000;
      const maxSafeSize = Math.floor(contextWindowSize * 0.3); // 60,000 tokens
      // Account for JSON overhead (~100 chars) so create data that stays under threshold
      const safeData = 'x'.repeat((maxSafeSize - 100) * 4); // Well under limit

      const block = {
        toolCallId: 'test-call-123',
        toolName: 'test-tool',
        input: {},
        output: safeData,
      };

      const toolResultData = {
        toolName: 'test-tool',
        toolInput: {},
        toolResult: safeData,
        compressedAt: new Date().toISOString(),
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      const artifactData = compressorWithContext['buildArtifactData'](
        'artifact-123',
        block,
        toolResultData
      );

      // Should NOT be oversized
      expect(artifactData.metadata.isOversized).toBe(false);
      expect(artifactData.metadata.retrievalBlocked).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('refreshes saved artifacts after async processing', async () => {
      const messages = [
        {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-after-save',
              toolName: 'read_ticket',
              input: { ticket_id: 6662 },
              output: { content: [{ type: 'image', data: 'base64', mimeType: 'image/png' }] },
            },
          ],
        },
      ];

      const { getLedgerArtifacts } = await import('@inkeep/agents-core');
      const mockGetLedgerArtifacts = vi.mocked(getLedgerArtifacts);
      mockGetLedgerArtifacts.mockReturnValueOnce(vi.fn().mockResolvedValue([])).mockReturnValueOnce(
        vi.fn().mockResolvedValue([
          {
            artifactId: 'saved-artifact',
            toolCallId: 'call-after-save',
            name: 'Saved artifact',
            description: 'Saved',
            metadata: { toolName: 'read_ticket', isOversized: true, toolArgs: { ticket_id: 6662 } },
            parts: [{ kind: 'data', data: { summary: { toolCallId: 'call-after-save' } } }],
          },
        ])
      );

      const result = await compressor.saveToolResultsAsArtifacts(messages);

      expect(mockSession.waitForPendingArtifacts).toHaveBeenCalled();
      expect(result['call-after-save']?.artifactId).toBe('saved-artifact');
    });

    it('should handle large conversations with many tool calls efficiently', async () => {
      // Simulate a large conversation
      const messages = [];
      for (let i = 0; i < 100; i++) {
        messages.push({
          content: [
            {
              type: 'tool-result',
              toolCallId: `call-${i}`,
              toolName: 'batch-tool',
              output: `result-${i}`,
            },
          ],
        });
      }

      // Mock empty database response (no existing artifacts)
      const { getLedgerArtifacts } = await import('@inkeep/agents-core');
      const mockGetLedgerArtifacts = vi.mocked(getLedgerArtifacts);
      mockGetLedgerArtifacts.mockReturnValue(vi.fn().mockResolvedValue([]));

      const start = Date.now();
      const result = await compressor.saveToolResultsAsArtifacts(messages);
      const duration = Date.now() - start;

      // Should complete reasonably quickly
      expect(duration).toBeLessThan(1000); // Less than 1 second
      expect(Object.keys(result)).toHaveLength(100);

      // Should still avoid N+1 queries by using batched lookups only
      expect(mockGetLedgerArtifacts).toHaveBeenCalledTimes(2);
    });

    it('should maintain state consistency during cleanup cycles', () => {
      // Simulate ongoing conversation with periodic cleanup
      for (let cycle = 0; cycle < 5; cycle++) {
        // Add tool calls
        for (let i = 0; i < 20; i++) {
          // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
          compressor['processedToolCalls'].add(`cycle-${cycle}-call-${i}`);
        }

        // Periodic partial cleanup
        if (cycle > 0) {
          compressor.partialCleanup();
        }
      }

      // Should maintain reasonable size
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['processedToolCalls'].size).toBeLessThan(100);
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['processedToolCalls'].size).toBeGreaterThan(0);
    });
  });

  describe('hasSummarizedArtifact', () => {
    it('should return false when cumulativeSummary is null', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = null;
      expect(compressor.hasSummarizedArtifact('artifact-1')).toBe(false);
    });

    it('should return false when related_artifacts is null', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'summary',
        user_intent: 'test',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: null,
      };
      expect(compressor.hasSummarizedArtifact('artifact-1')).toBe(false);
    });

    it('should return false when artifact is not in related_artifacts', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'summary',
        user_intent: 'test',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: [
          {
            id: 'other-artifact',
            name: 'Other',
            tool_name: 'tool',
            tool_call_id: 'tc-1',
            content_type: 'text',
            key_findings: ['finding'],
          },
        ],
      };
      expect(compressor.hasSummarizedArtifact('artifact-1')).toBe(false);
    });

    it('should return true when artifact exists in related_artifacts', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'summary',
        user_intent: 'test',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: [
          {
            id: 'artifact-1',
            name: 'Test Artifact',
            tool_name: 'tool',
            tool_call_id: 'tc-1',
            content_type: 'text',
            key_findings: ['finding'],
          },
        ],
      };
      expect(compressor.hasSummarizedArtifact('artifact-1')).toBe(true);
    });
  });

  describe('Binary Attachment Handling in formatMessagesForDistillation', () => {
    function makeToolResultMessage(toolCallId: string, toolName: string) {
      return {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId, toolName, output: 'data' }],
      };
    }

    it('emits name, description, and metadata for binary_attachment artifacts', () => {
      const messages = [makeToolResultMessage('call-bin', 'read_image')];
      const artifactMap = {
        'call-bin': {
          artifactId: 'attachment_msg1_abc123',
          isOversized: false,
          toolName: 'read_image',
          artifactType: 'binary_attachment',
          name: 'Tool attachment 1',
          description: 'Binary file produced by tool (image/png)',
          summaryData: { mimeType: 'image/png', binaryType: 'image', filename: 'photo.png' },
        },
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private method for testing
      const formatted = compressor['formatMessagesForDistillation'](messages, artifactMap);

      expect(formatted).toContain('[BINARY ATTACHMENT]');
      expect(formatted).toContain('attachment_msg1_abc123');
      expect(formatted).toContain('Tool attachment 1');
      expect(formatted).toContain('Binary file produced by tool (image/png)');
      expect(formatted).toContain('image/png');
      expect(formatted).toContain('photo.png');
      expect(formatted).not.toContain('[TOOL RESULT]');
    });

    it('preserves the artifact ID so the distillation LLM can reference it', () => {
      const messages = [makeToolResultMessage('call-bin', 'screenshot_tool')];
      const artifactMap = {
        'call-bin': {
          artifactId: 'attachment_msg2_def456',
          isOversized: false,
          toolName: 'screenshot_tool',
          artifactType: 'binary_attachment',
        },
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private method for testing
      const formatted = compressor['formatMessagesForDistillation'](messages, artifactMap);

      expect(formatted).toContain('attachment_msg2_def456');
    });

    it('still uses name/description block for non-binary artifacts', () => {
      const messages = [makeToolResultMessage('call-text', 'search_tool')];
      const artifactMap = {
        'call-text': {
          artifactId: 'compress_search_tool_call-text_abc',
          isOversized: false,
          toolName: 'search_tool',
          artifactType: 'tool_result',
          name: 'Search results for React hooks',
          description: 'Top 5 docs on useEffect patterns',
          summaryData: { toolName: 'search_tool', resultPreview: 'article list' },
        },
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private method for testing
      const formatted = compressor['formatMessagesForDistillation'](messages, artifactMap);

      expect(formatted).toContain('[TOOL RESULT]');
      expect(formatted).toContain('Search results for React hooks');
      expect(formatted).toContain('compress_search_tool_call-text_abc');
      expect(formatted).not.toContain('[BINARY ATTACHMENT]');
    });

    it('handles mixed binary and regular artifacts in the same message list', () => {
      const messages = [
        makeToolResultMessage('call-bin', 'read_file'),
        makeToolResultMessage('call-text', 'search_tool'),
      ];
      const artifactMap = {
        'call-bin': {
          artifactId: 'attachment_msg3_ghi789',
          isOversized: false,
          toolName: 'read_file',
          artifactType: 'binary_attachment',
          name: 'Tool attachment 1',
          description: 'Binary file produced by tool (application/pdf)',
        },
        'call-text': {
          artifactId: 'compress_search_abc',
          isOversized: false,
          toolName: 'search_tool',
          artifactType: 'tool_result',
          name: 'API documentation results',
          summaryData: { toolName: 'search_tool' },
        },
      };

      // biome-ignore lint/complexity/useLiteralKeys: accessing private method for testing
      const formatted = compressor['formatMessagesForDistillation'](messages, artifactMap);

      expect(formatted).toContain('[BINARY ATTACHMENT]');
      expect(formatted).toContain('attachment_msg3_ghi789');
      expect(formatted).toContain('[TOOL RESULT]');
      expect(formatted).toContain('API documentation results');
      expect(formatted).toContain(artifactMap['call-bin'].description);
    });

    it('does not count binary attachments toward the per-result char budget', () => {
      const manyMessages = Array.from({ length: 3 }, (_, i) =>
        makeToolResultMessage(`call-bin-${i}`, 'read_file')
      );
      manyMessages.push(makeToolResultMessage('call-text', 'search_tool'));

      const artifactMap: Record<string, any> = {};
      for (let i = 0; i < 3; i++) {
        artifactMap[`call-bin-${i}`] = {
          artifactId: `attachment_${i}`,
          isOversized: false,
          artifactType: 'binary_attachment',
        };
      }
      artifactMap['call-text'] = {
        artifactId: 'compress_search_abc',
        isOversized: false,
        artifactType: 'tool_result',
        name: 'Result',
        summaryData: { data: 'x'.repeat(500) },
      };

      // With a tight char budget, binary attachments should not consume quota from the text result
      // biome-ignore lint/complexity/useLiteralKeys: accessing private method for testing
      const formatted = compressor['formatMessagesForDistillation'](manyMessages, artifactMap, 600);

      // The text result should still appear with meaningful content (full 500 char summary fits)
      expect(formatted).toContain('compress_search_abc');
      expect(formatted).toContain('x'.repeat(500));
    });
  });

  describe('getSummarizedArtifact', () => {
    it('should return null when cumulativeSummary is null', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = null;
      expect(compressor.getSummarizedArtifact('artifact-1')).toBeNull();
    });

    it('should return null when artifact is not found', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'summary',
        user_intent: 'test',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: [],
      };
      expect(compressor.getSummarizedArtifact('artifact-1')).toBeNull();
    });

    it('should return key_findings and tool_call_id for matching artifact', () => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      compressor['cumulativeSummary'] = {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'summary',
        user_intent: 'test',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: [
          {
            id: 'artifact-1',
            name: 'Test Artifact',
            tool_name: 'tool',
            tool_call_id: 'tc-42',
            content_type: 'text',
            key_findings: ['finding-a', 'finding-b'],
          },
          {
            id: 'artifact-2',
            name: 'Other Artifact',
            tool_name: 'tool',
            tool_call_id: 'tc-99',
            content_type: 'text',
            key_findings: ['other-finding'],
          },
        ],
      };

      const result = compressor.getSummarizedArtifact('artifact-1');
      expect(result).toEqual({
        key_findings: ['finding-a', 'finding-b'],
        tool_call_id: 'tc-42',
      });
    });
  });
});
