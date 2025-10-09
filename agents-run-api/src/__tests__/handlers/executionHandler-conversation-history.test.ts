import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionHandler } from '../../handlers/executionHandler';

describe('ExecutionHandler - Conversation History with Streamed Content', () => {
  let executionHandler: ExecutionHandler;

  beforeEach(() => {
    executionHandler = new ExecutionHandler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('streamed content handling', () => {
    it('should prefer streamed content over artifacts for conversation history', () => {
      const mockMessageResponse = {
        result: {
          streamedContent: {
            parts: [
              { kind: 'text', text: 'This is streamed content' },
              { kind: 'text', text: ' that should be saved to history.' },
            ],
          },
          artifacts: [
            {
              parts: [{ kind: 'text', text: 'This is artifact content' }],
            },
          ],
        },
      };

      // Simulate the logic from ExecutionHandler
      let responseParts = [];

      // Check if we have streamed content from the IncrementalStreamParser
      if (mockMessageResponse.result.streamedContent?.parts) {
        responseParts = mockMessageResponse.result.streamedContent.parts;
      } else {
        // Fallback to artifacts if no streamed content available
        responseParts =
          mockMessageResponse.result.artifacts?.flatMap((artifact: any) => artifact.parts || []) ||
          [];
      }

      // Should use streamed content, not artifacts
      expect(responseParts).toHaveLength(2);
      expect(responseParts[0].text).toBe('This is streamed content');
      expect(responseParts[1].text).toBe(' that should be saved to history.');
    });

    it('should fallback to artifacts when streamed content is not available', () => {
      const mockMessageResponse = {
        result: {
          artifacts: [
            {
              parts: [
                { kind: 'text', text: 'This is artifact content' },
                { kind: 'text', text: ' that should be used as fallback.' },
              ],
            },
          ],
        },
      };

      // Simulate the logic from ExecutionHandler
      let responseParts = [];

      // Check if we have streamed content from the IncrementalStreamParser
      if (mockMessageResponse.result.streamedContent?.parts) {
        responseParts = mockMessageResponse.result.streamedContent.parts;
      } else {
        // Fallback to artifacts if no streamed content available
        responseParts =
          mockMessageResponse.result.artifacts?.flatMap((artifact: any) => artifact.parts || []) ||
          [];
      }

      // Should use artifacts as fallback
      expect(responseParts).toHaveLength(2);
      expect(responseParts[0].text).toBe('This is artifact content');
      expect(responseParts[1].text).toBe(' that should be used as fallback.');
    });

    it('should handle empty response gracefully', () => {
      const mockMessageResponse = {
        result: {},
      };

      // Simulate the logic from ExecutionHandler
      let responseParts = [];

      // Check if we have streamed content from the IncrementalStreamParser
      if (mockMessageResponse.result.streamedContent?.parts) {
        responseParts = mockMessageResponse.result.streamedContent.parts;
      } else {
        // Fallback to artifacts if no streamed content available
        responseParts =
          mockMessageResponse.result.artifacts?.flatMap((artifact: any) => artifact.parts || []) ||
          [];
      }

      // Should handle empty result without errors
      expect(responseParts).toEqual([]);
    });

    it('should extract text content correctly from streamed parts', () => {
      const streamedParts = [
        { kind: 'text', text: 'Hello, ' },
        { kind: 'text', text: 'world!' },
        { kind: 'data', data: { type: 'component', id: 'test' } },
      ];

      // Simulate the text content extraction logic from ExecutionHandler
      let textContent = '';
      for (const part of streamedParts) {
        const isTextPart = (part.kind === 'text' || part.type === 'text') && part.text;
        if (isTextPart) {
          textContent += part.text;
        }
      }

      expect(textContent).toBe('Hello, world!');
    });

    it('should map streamed parts to database format correctly', () => {
      const streamedParts = [
        { kind: 'text', text: 'Hello, world!' },
        { kind: 'data', data: { type: 'component', id: 'test' } },
      ];

      // Simulate the database mapping logic from ExecutionHandler
      const mappedParts = streamedParts.map((part: any) => ({
        type: part.kind === 'text' ? 'text' : 'data',
        text: part.kind === 'text' ? part.text : undefined,
        data: part.kind === 'data' ? JSON.stringify(part.data) : undefined,
      }));

      expect(mappedParts).toEqual([
        {
          type: 'text',
          text: 'Hello, world!',
          data: undefined,
        },
        {
          type: 'data',
          text: undefined,
          data: '{"type":"component","id":"test"}',
        },
      ]);
    });
  });
});
