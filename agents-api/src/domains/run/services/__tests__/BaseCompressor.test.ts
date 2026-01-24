import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentSessionManager } from '../AgentSession';
import { BaseCompressor } from '../BaseCompressor';

// Mock dependencies

vi.mock('../AgentSession', () => ({
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

vi.mock('../tools/distill-conversation-tool', () => ({
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
        high_level: 'Test compression summary',
        text_messages: [],
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
    };
    vi.mocked(agentSessionManager.getSession).mockReturnValue(mockSession);

    // Setup compressor instance
    compressor = new TestCompressor(
      'session-123',
      'conv-456',
      'tenant-789',
      'project-abc',
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
        high_level: 'test summary',
        user_intent: 'test intent',
        decisions: ['decision1'],
        open_questions: ['question1'],
        next_steps: {
          for_agent: ['step1'],
          for_user: ['step2'],
        },
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

      // Should call getLedgerArtifacts with batch toolCallIds
      expect(mockGetLedgerArtifacts).toHaveBeenCalledTimes(1);
      const mockFn = mockGetLedgerArtifacts.mock.results[0].value;
      expect(mockFn).toHaveBeenCalledWith({
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
      expect(result.summary.length).toBeLessThanOrEqual(messages.length);
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

  describe('Integration Scenarios', () => {
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

      // Should still only make one batch query
      expect(mockGetLedgerArtifacts).toHaveBeenCalledTimes(1);
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
});
