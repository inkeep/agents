import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncrementalStreamParser } from '../../services/IncrementalStreamParser';
import type { StreamHelper } from '../../utils/stream-helpers';

// Mock stream helper
class MockStreamHelper implements StreamHelper {
  async writeRole(role: string): Promise<void> {
    // Mock implementation
  }

  async streamText(text: string, chunkSize?: number): Promise<void> {
    // Mock implementation
  }

  async writeData(type: string, data: any): Promise<void> {
    // Mock implementation
  }

  async writeOperation(operation: any): Promise<void> {
    // Mock implementation
  }

  async complete(): Promise<void> {
    // Mock implementation
  }
}

describe('IncrementalStreamParser - Conversation History', () => {
  let parser: IncrementalStreamParser;
  let mockStreamHelper: MockStreamHelper;

  beforeEach(() => {
    mockStreamHelper = new MockStreamHelper();
    parser = new IncrementalStreamParser(mockStreamHelper, 'test-tenant', 'test-context', {
      streamRequestId: 'test-request',
      agentId: 'test-agent',
    });
  });

  describe('streamed content for conversation history', () => {
    it('should collect streamed text content for conversation history', async () => {
      const testText = 'Hello, world! This should be saved to conversation history.';

      // Process text chunk
      await parser.processTextChunk(testText);

      // Finalize to ensure all content is processed
      await parser.finalize();

      // Get streamed content (what was actually sent to the user)
      const streamedContent = parser.getAllStreamedContent();

      expect(streamedContent).toHaveLength(1);
      expect(streamedContent[0]).toEqual({
        kind: 'text',
        text: testText,
      });
    });

    it('should collect multiple text chunks for conversation history', async () => {
      const chunks = ['Hello, ', 'world!', ' How are you?'];

      // Process multiple chunks
      for (const chunk of chunks) {
        await parser.processTextChunk(chunk);
      }

      await parser.finalize();

      const streamedContent = parser.getAllStreamedContent();

      // Should have multiple text parts
      expect(streamedContent.length).toBeGreaterThan(0);

      // All parts should be text
      streamedContent.forEach((part) => {
        expect(part.kind).toBe('text');
        expect(part.text).toBeDefined();
      });

      // Combined text should match input
      const combinedText = streamedContent.map((part) => part.text).join('');
      expect(combinedText).toBe('Hello, world! How are you?');
    });

    it('should handle empty content gracefully', async () => {
      await parser.finalize();

      const streamedContent = parser.getAllStreamedContent();
      expect(streamedContent).toEqual([]);
    });

    it('should provide streamed content suitable for database storage', async () => {
      const conversationText = 'This is a conversation response that should be saved to history.';

      await parser.processTextChunk(conversationText);
      await parser.finalize();

      const streamedContent = parser.getAllStreamedContent();

      // Verify the content is suitable for conversation history
      expect(streamedContent).toHaveLength(1);
      expect(streamedContent[0].kind).toBe('text');
      expect(streamedContent[0].text).toBe(conversationText);

      // Verify it can be mapped to database format
      const dbFormat = streamedContent.map((part) => ({
        type: part.kind === 'text' ? 'text' : 'data',
        text: part.kind === 'text' ? part.text : undefined,
        data: part.kind === 'data' ? JSON.stringify(part.data) : undefined,
      }));

      expect(dbFormat).toEqual([
        {
          type: 'text',
          text: conversationText,
          data: undefined,
        },
      ]);
    });
  });
});
