import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createVercelStreamHelper,
  type VercelDataStreamHelper,
  type VercelUIWriter,
} from '../../utils/stream-helpers';

// Mock parsePartialJson from 'ai' package
vi.mock('ai', () => ({
  parsePartialJson: vi.fn(),
  tool: vi.fn().mockImplementation((config) => config),
}));

import { parsePartialJson } from 'ai';

const mockParsePartialJson = vi.mocked(parsePartialJson);

describe('VercelDataStreamHelper Memory Management', () => {
  let mockWriter: VercelUIWriter;
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
    // Mock parsePartialJson to return successful parse with empty array
    mockParsePartialJson.mockResolvedValue({
      value: [],
      state: 'successful-parse',
    });

    // Create content that approaches but doesn't exceed the 5MB limit
    const largeContent = 'x'.repeat(1024 * 1024); // 1MB chunks

    // Add content multiple times (should be allowed during request)
    await helper.writeContent(largeContent);
    await helper.writeContent(largeContent);
    await helper.writeContent(largeContent);

    // Should not throw and should continue working
    expect(mockParsePartialJson).toHaveBeenCalled();

    // Check memory stats show buffer growth
    const stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.isCompleted).toBe(false);
  });

  test('should clean up all memory when stream completes', async () => {
    mockParsePartialJson.mockResolvedValue({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse',
    });

    // Add content to build up memory usage
    await helper.writeContent('test content');

    // Verify memory is being used
    let stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.sentItemsCount).toBeGreaterThan(0);
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
    await helper.writeContent('test content with some length');

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
    await helper.writeContent('test content');

    // Verify memory usage
    let stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBeGreaterThan(0);
    expect(stats.sentItemsCount).toBeGreaterThan(0);

    // Manual cleanup
    helper.cleanup();

    // Should be cleaned up but not marked as completed (since we didn't call complete())
    stats = helper.getMemoryStats();
    expect(stats.bufferSize).toBe(0);
    expect(stats.sentItemsCount).toBe(0);
    expect(stats.isCompleted).toBe(false); // cleanup() doesn't mark as completed
  });

  test('should not send duplicate content for same index', async () => {
    mockParsePartialJson.mockResolvedValueOnce({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse',
    });

    // Write content
    await helper.writeContent('duplicate');

    // Reset mock to return same content
    mockParsePartialJson.mockResolvedValueOnce({
      value: [{ type: 'test', content: 'item1' }],
      state: 'successful-parse',
    });

    await helper.writeContent('duplicate');

    // Should only write once since content hasn't changed
    expect(mockWriter.write).toHaveBeenCalledTimes(1);
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
