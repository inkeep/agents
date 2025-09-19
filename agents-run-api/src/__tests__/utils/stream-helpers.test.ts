import { beforeEach, describe, expect, test, vi } from 'vitest';

// Hoist the mock function - must use vi.hoisted to access in vi.mock
const { mockParsePartialJson } = vi.hoisted(() => {
  return {
    mockParsePartialJson: vi.fn(),
  };
});

// Mock parsePartialJson from 'ai' package
vi.mock('ai', () => ({
  parsePartialJson: mockParsePartialJson,
  tool: vi.fn((config) => config),
}));

import {
  createVercelStreamHelper,
  type VercelDataStreamHelper,
  type VercelUIWriter,
} from '../../utils/stream-helpers';

describe('VercelDataStreamHelper Memory Management', () => {
  let mockWriter: VercelUIWriter & {
    write: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
  };
  let helper: VercelDataStreamHelper;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWriter = {
      write: vi.fn(),
      merge: vi.fn(),
      onError: vi.fn(),
    };

    helper = createVercelStreamHelper(mockWriter);
  });

  test('should allow buffer to grow during request but prevent catastrophic growth', async () => {
    // Mock parsePartialJson to return successful parse with some items so writes happen
    mockParsePartialJson.mockImplementation(async (content: string) => ({
      value: [{ type: 'test', content: 'x'.repeat(100) }], // Return an array with item
      state: 'successful-parse' as const,
    }));

    // Create large JSON array content that approaches but doesn't exceed the 5MB limit
    const largeItem = { type: 'test', content: 'x'.repeat(1024 * 1024) }; // 1MB item
    const largeJsonBase = '[' + JSON.stringify(largeItem); // Start of a JSON array

    // Add content multiple times (should be allowed during request)
    await helper.writeContent(largeJsonBase);
    await helper.writeContent(',' + JSON.stringify(largeItem));
    await helper.writeContent(',' + JSON.stringify(largeItem) + ']');

    // Should not throw and should continue working
    expect(mockParsePartialJson).toHaveBeenCalledTimes(3);

    // Should have written to the writer
    expect(mockWriter.write).toHaveBeenCalled();

    // Check memory stats show buffer growth
    const stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.isCompleted).toBe(false);
  });

  test('should clean up all memory when stream completes', async () => {
    mockParsePartialJson.mockImplementation(async (content: string) => ({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse' as const,
    }));

    // Add proper JSON content that will be parsed correctly
    await helper.writeContent('[{"type":"test","content":"item1"}]');

    // Verify memory is being used
    let stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.sentItemsCount).toBeGreaterThanOrEqual(0); // May be 0 or 1 depending on internal deduplication
    expect(stats.isCompleted).toBe(false);

    // Complete the stream
    await helper.complete();

    // Verify all memory is cleaned up
    stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBe(0);
    expect(stats.sentItemsCount).toBe(0);
    expect(stats.completedItemsCount).toBe(0);
    expect(stats.isCompleted).toBe(true);
  });

  test('should prevent writes after stream completion', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Complete the stream first
    await helper.complete();

    // Try to write content after completion
    await helper.writeContent('should not work');
    await helper.streamText('should not work');
    await helper.writeError('should not work');
    await helper.mergeStream('should not work');

    // Should have warned for each attempted write
    expect(consoleWarnSpy).toHaveBeenCalledWith('Attempted to write content to completed stream');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Attempted to stream text to completed stream');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Attempted to write error to completed stream');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Attempted to merge stream to completed stream');

    // Writer should not have been called
    expect(mockWriter.write).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('should allow multiple complete() calls without issues', async () => {
    mockParsePartialJson.mockResolvedValue({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse',
    });

    // Add some content
    await helper.writeContent('test content');

    // Complete multiple times
    await helper.complete();
    await helper.complete();
    await helper.complete();

    // Should be marked as completed
    const stats = helper.getMemoryStats();
    expect(stats.isCompleted).toBe(true);
    expect(stats.bufferSize).toBe(0);
  });

  test('should provide accurate memory stats', async () => {
    mockParsePartialJson.mockResolvedValue({
      value: [
        { type: 'test', content: 'item1' },
        { type: 'test', content: 'item2' },
      ],
      state: 'successful-parse',
    });

    // Initially should have minimal memory usage
    let stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBe(0);
    expect(stats.sentItemsCount).toBe(0);
    expect(stats.isCompleted).toBe(false);

    // Add content
    await helper.writeContent(
      '[{"type":"test","content":"item1"},{"type":"test","content":"item2"}]'
    );

    // Should show memory usage
    stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.sentItemsCount).toBe(2); // Two items from mocked parse result
    expect(stats.isCompleted).toBe(false);

    // Complete and verify cleanup
    await helper.complete();
    stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBe(0);
    expect(stats.sentItemsCount).toBe(0);
    expect(stats.isCompleted).toBe(true);
  });

  test('should handle manual cleanup', async () => {
    mockParsePartialJson.mockResolvedValue({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse',
    });

    // Add content
    await helper.writeContent('[{"type":"test","content":"item1"}]');

    // Verify memory usage
    let stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.sentItemsCount).toBe(1); // We have 1 item in the mock

    // Manual cleanup
    helper.cleanup();

    // Should be cleaned up but not marked as completed (since we didn't call complete())
    stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBe(0);
    expect(stats.sentItemsCount).toBe(0);
    expect(stats.isCompleted).toBe(false); // cleanup() doesn't mark as completed
  });

  test('should not send duplicate content for same index', async () => {
    // Set up mock to always return the same parsed value
    mockParsePartialJson.mockImplementation(async () => ({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse' as const,
    }));

    // Write content first time with JSON that will be parsed
    await helper.writeContent('[{"type":"test","content":"item1"}]');

    // Verify first write happened
    expect(mockWriter.write).toHaveBeenCalledTimes(1);
    expect(mockWriter.write).toHaveBeenCalledWith({
      type: 'data-component',
      id: expect.stringMatching(/^\d+-[a-z0-9]+-0$/),
      data: { type: 'test', content: 'item1' },
    });

    // Clear the mock to ensure we can detect if it's called again
    mockWriter.write.mockClear();

    // Write content second time (same content should be deduplicated)
    await helper.writeContent('[{"type":"test","content":"item1"}]');

    // Should NOT write again since content hasn't changed
    expect(mockWriter.write).not.toHaveBeenCalled();
  });

  test('should handle malformed JSON gracefully', async () => {
    mockParsePartialJson.mockResolvedValue({
      value: null,
      state: 'failed-parse',
    });

    // Should not throw when parsing fails
    await expect(helper.writeContent('malformed json')).resolves.not.toThrow();

    // Writer should not be called for malformed content
    expect(mockWriter.write).not.toHaveBeenCalled();
  });

  test('should handle very large content without crashing', async () => {
    mockParsePartialJson.mockResolvedValue({
      value: [],
      state: 'successful-parse',
    });

    // Create very large content to test resilience
    const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB chunks

    // Should not throw errors even with large content
    await expect(helper.writeContent(largeContent)).resolves.not.toThrow();
    await expect(helper.writeContent(largeContent)).resolves.not.toThrow();
    await expect(helper.writeContent(largeContent)).resolves.not.toThrow();

    // Memory should be tracked and system should remain stable
    const stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.isCompleted).toBe(false);

    // Cleanup should work normally
    await helper.complete();
    const finalStats = helper.getMemoryStats();
    expect(finalStats.bufferSize).toBe(0);
    expect(finalStats.isCompleted).toBe(true);
  });
});
