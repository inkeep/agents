import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressConversationIfNeeded, compressionLocks } from '../data/conversations';

// Mock the ConversationCompressor
vi.mock('../services/ConversationCompressor', () => ({
  ConversationCompressor: vi.fn().mockImplementation(() => ({
    isCompressionNeeded: vi.fn().mockReturnValue(true),
    safeCompress: vi.fn().mockResolvedValue({
      artifactIds: ['artifact-1'],
      summary: { compressed: true },
    }),
    partialCleanup: vi.fn(),
    fullCleanup: vi.fn(),
  })),
}));

// Mock database operations
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createMessage: vi.fn().mockReturnValue(() => Promise.resolve({ id: 'msg-123' })),
    generateId: vi.fn().mockReturnValue('generated-id'),
    loadEnvironmentFiles: vi.fn(),
  };
});

vi.mock('../data/db/dbClient', () => ({
  default: {},
}));

describe('Race Condition Prevention', () => {
  const mockParams = {
    conversationId: 'conv-123',
    tenantId: 'tenant-456',
    projectId: 'project-789',
    summarizerModel: { model: 'gpt-4' },
    streamRequestId: 'stream-abc',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clear any locks that might be set
    compressionLocks.clear();
  });

  it('should prevent concurrent compression for the same conversation', async () => {
    const messages = [
      { role: 'user', content: 'Test message 1' },
      { role: 'assistant', content: 'Test response 1' },
    ];

    // Start two concurrent compressions for the same conversation
    const compression1 = compressConversationIfNeeded(messages, mockParams);
    const compression2 = compressConversationIfNeeded(messages, mockParams);

    const [result1, result2] = await Promise.all([compression1, compression2]);

    // Both should complete, but the second should return original messages
    // due to the locking mechanism
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // The second call should have returned original messages without processing
    expect(result2).toEqual(messages);
  });

  it('should allow concurrent compression for different conversations', async () => {
    const messages = [{ role: 'user', content: 'Test message' }];

    const params1 = { ...mockParams, conversationId: 'conv-1' };
    const params2 = { ...mockParams, conversationId: 'conv-2' };

    // Start compressions for different conversations
    const compression1 = compressConversationIfNeeded(messages, params1);
    const compression2 = compressConversationIfNeeded(messages, params2);

    const [result1, result2] = await Promise.all([compression1, compression2]);

    // Both should process independently
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // Neither should return the original messages unchanged
    expect(result1).not.toEqual(messages);
    expect(result2).not.toEqual(messages);
  });

  it('should properly clean up locks after compression completes', async () => {
    const messages = [{ role: 'user', content: 'Test' }];

    // Verify no locks initially
    expect(compressionLocks.size).toBe(0);

    // Run compression
    await compressConversationIfNeeded(messages, mockParams);

    // Lock should be cleaned up after completion
    expect(compressionLocks.size).toBe(0);
  });

  it('should clean up locks even when compression fails', async () => {
    // Mock compression failure by importing and mocking the module
    const { ConversationCompressor } = await import('../services/ConversationCompressor');
    const MockedConversationCompressor = vi.mocked(ConversationCompressor);

    // Temporarily override the mock implementation to simulate failure
    MockedConversationCompressor.mockImplementationOnce(
      () =>
        ({
          isCompressionNeeded: vi.fn().mockReturnValue(true),
          safeCompress: vi.fn().mockRejectedValue(new Error('Compression failed')),
          partialCleanup: vi.fn(),
          cleanup: vi.fn(),
          fullCleanup: vi.fn(),
          getCompressionType: vi.fn().mockReturnValue('test'),
          compress: vi.fn().mockRejectedValue(new Error('Compression failed')),
          createConversationSummary: vi.fn(),
          processedToolCalls: new Set(),
          cumulativeSummary: null,
          getHardLimit: vi.fn().mockReturnValue(1000),
          getCompressionSummary: vi.fn().mockReturnValue(null),
          getState: vi.fn().mockReturnValue({}),
          saveToolResultsAsArtifacts: vi.fn().mockResolvedValue({}),
          estimateTokens: vi.fn().mockReturnValue(100),
          calculateContextSize: vi.fn().mockReturnValue(500),
          isEmpty: vi.fn().mockReturnValue(false),
          removeStructureHints: vi.fn().mockImplementation((obj) => obj),
          generateResultPreview: vi.fn().mockReturnValue('Preview'),
          recordCompressionEvent: vi.fn(),
          simpleCompressionFallback: vi.fn().mockResolvedValue({ artifactIds: [], summary: [] }),
        }) as any
    );

    const messages = [{ role: 'user', content: 'Test' }];

    try {
      await compressConversationIfNeeded(messages, mockParams);
    } catch (error) {
      // Expected to fail
    }

    // Lock should still be cleaned up even after failure
    expect(compressionLocks.size).toBe(0);
  });

  it('should handle rapid sequential compression requests properly', async () => {
    const messages = [{ role: 'user', content: 'Sequential test' }];

    // Make multiple sequential requests
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = await compressConversationIfNeeded(messages, {
        ...mockParams,
        conversationId: `conv-${i}`,
      });
      results.push(result);
    }

    // All should complete successfully
    expect(results).toHaveLength(5);
    results.forEach((result) => {
      expect(result).toBeDefined();
    });
  });

  it('should generate unique lock keys for different tenant/project combinations', async () => {
    const messages = [{ role: 'user', content: 'Multi-tenant test' }];

    // Different tenant/project combinations should not interfere
    const params1 = { ...mockParams, tenantId: 'tenant-1', projectId: 'project-1' };
    const params2 = { ...mockParams, tenantId: 'tenant-2', projectId: 'project-1' };
    const params3 = { ...mockParams, tenantId: 'tenant-1', projectId: 'project-2' };

    const compressions = await Promise.all([
      compressConversationIfNeeded(messages, params1),
      compressConversationIfNeeded(messages, params2),
      compressConversationIfNeeded(messages, params3),
    ]);

    // All should process independently
    compressions.forEach((result) => {
      expect(result).toBeDefined();
      expect(result).not.toEqual(messages); // Should be processed, not returned unchanged
    });
  });
});
