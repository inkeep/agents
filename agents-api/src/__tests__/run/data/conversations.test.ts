import type { MessageSelect } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';
import {
  formatMessagesAsConversationHistory,
  reconstructMessageText,
} from '../../../domains/run/data/conversations';

const mockDownload = vi.fn();

vi.mock('../../../domains/run/services/blob-storage', async () => {
  const actual = await vi.importActual<typeof import('../../../domains/run/services/blob-storage')>(
    '../../../domains/run/services/blob-storage'
  );
  return {
    ...actual,
    getBlobStorageProvider: () => ({
      download: mockDownload,
      upload: vi.fn(),
      delete: vi.fn(),
    }),
  };
});

describe('reconstructMessageText', () => {
  it('falls back to content.text when content has no parts array', async () => {
    const msg = { content: { text: 'Hello world' } };
    await expect(reconstructMessageText(msg)).resolves.toBe('Hello world');
  });

  it('falls back to content.text when parts is empty', async () => {
    const msg = { content: { text: 'fallback text', parts: [] } };
    await expect(reconstructMessageText(msg)).resolves.toBe('fallback text');
  });

  it('returns empty string when content has no text and no parts', async () => {
    const msg = { content: {} };
    await expect(reconstructMessageText(msg)).resolves.toBe('');
  });

  it('uses part.type when kind is omitted (legacy shape)', async () => {
    const msg = {
      content: { parts: [{ type: 'text', text: 'legacy' } as any] },
    } as Pick<MessageSelect, 'content'>;
    await expect(reconstructMessageText(msg)).resolves.toBe('legacy');
  });

  it('concatenates text parts in order', async () => {
    const msg = {
      content: {
        parts: [
          { kind: 'text', text: 'Hello ' },
          { kind: 'text', text: 'world' },
        ],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe('Hello world');
  });

  it('converts data parts with artifactId + toolCallId to artifact:ref tags', async () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: { artifactId: 'art-1', toolCallId: 'tool-1' } }],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe(
      '<artifact:ref id="art-1" tool="tool-1" />'
    );
  });

  it('interleaves text and artifact:ref tags correctly', async () => {
    const msg = {
      content: {
        parts: [
          { kind: 'text', text: 'Here is the result. ' },
          { kind: 'data', data: { artifactId: 'art-abc', toolCallId: 'toolu_xyz' } },
          { kind: 'text', text: ' And more text.' },
        ],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe(
      'Here is the result. <artifact:ref id="art-abc" tool="toolu_xyz" /> And more text.'
    );
  });

  it('handles data parts with JSON string data', async () => {
    const msg = {
      content: {
        parts: [
          {
            kind: 'data',
            data: JSON.stringify({ artifactId: 'art-json', toolCallId: 'tool-json' }),
          },
        ],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe(
      '<artifact:ref id="art-json" tool="tool-json" />'
    );
  });

  it('ignores data parts without artifactId', async () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: { toolCallId: 'tool-1' } }],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe('');
  });

  it('ignores data parts without toolCallId', async () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: { artifactId: 'art-1' } }],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe('');
  });

  it('ignores data parts with unparseable JSON string', async () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: 'not-valid-json' }],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe('');
  });

  it('returns empty string for unknown part types', async () => {
    const msg = {
      content: {
        parts: [{ kind: 'image' }],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe('');
  });

  it('handles multiple artifact refs in a single message', async () => {
    const msg = {
      content: {
        parts: [
          { kind: 'text', text: 'First: ' },
          { kind: 'data', data: { artifactId: 'art-1', toolCallId: 'tool-1' } },
          { kind: 'text', text: ' Second: ' },
          { kind: 'data', data: { artifactId: 'art-2', toolCallId: 'tool-2' } },
        ],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe(
      'First: <artifact:ref id="art-1" tool="tool-1" /> Second: <artifact:ref id="art-2" tool="tool-2" />'
    );
  });

  it('handles missing text property in text part gracefully', async () => {
    const msg = {
      content: {
        parts: [{ kind: 'text' }],
      },
    };
    await expect(reconstructMessageText(msg)).resolves.toBe('');
  });

  describe('file parts', () => {
    const TEXT_CONTENT = 'hello from file';
    const textB64 = Buffer.from(TEXT_CONTENT, 'utf-8').toString('base64');

    it('inlines file content from A2A wire shape with base64 bytes', async () => {
      const msg = {
        content: {
          parts: [
            {
              kind: 'file',
              file: { bytes: textB64, mimeType: 'text/plain' },
              metadata: { filename: 'notes.txt' },
            } as any,
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe(
        `<file name="notes.txt">\n${TEXT_CONTENT}\n</file>`
      );
    });

    it('inlines file content from A2A wire shape with a data-URI', async () => {
      const msg = {
        content: {
          parts: [
            {
              kind: 'file',
              file: { uri: `data:text/plain;base64,${textB64}` },
              metadata: { filename: 'notes.txt' },
            } as any,
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe(
        `<file name="notes.txt">\n${TEXT_CONTENT}\n</file>`
      );
    });

    it('inlines file content from persisted-content shape with a data-URI', async () => {
      const msg = {
        content: {
          parts: [
            {
              kind: 'file',
              data: `data:text/plain;base64,${textB64}`,
              metadata: { filename: 'notes.txt' },
            } as any,
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe(
        `<file name="notes.txt">\n${TEXT_CONTENT}\n</file>`
      );
    });

    it('downloads and inlines file content from a blob:// URI via the storage provider', async () => {
      mockDownload.mockResolvedValueOnce({
        data: Buffer.from(TEXT_CONTENT, 'utf-8'),
        contentType: 'text/plain',
      });
      const msg = {
        content: {
          parts: [
            {
              kind: 'file',
              data: 'blob://some/key/notes.txt',
              metadata: { filename: 'notes.txt' },
            } as any,
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe(
        `<file name="notes.txt">\n${TEXT_CONTENT}\n</file>`
      );
      expect(mockDownload).toHaveBeenCalledWith('some/key/notes.txt');
    });

    it('returns a placeholder when the blob download fails', async () => {
      mockDownload.mockRejectedValueOnce(new Error('not found'));
      const msg = {
        content: {
          parts: [
            {
              kind: 'file',
              data: 'blob://missing/key',
              metadata: { filename: 'missing.txt' },
            } as any,
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe('<file name="missing.txt" />');
    });

    it('emits a filename placeholder for external http(s) URIs', async () => {
      const msg = {
        content: {
          parts: [
            {
              kind: 'file',
              data: 'https://example.com/notes.txt',
              metadata: { filename: 'notes.txt' },
            } as any,
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe('<file name="notes.txt" />');
    });

    it('interleaves file content with surrounding text parts', async () => {
      const msg = {
        content: {
          parts: [
            { kind: 'text', text: 'Before. ' },
            {
              kind: 'file',
              data: `data:text/plain;base64,${textB64}`,
              metadata: { filename: 'notes.txt' },
            } as any,
            { kind: 'text', text: ' After.' },
          ],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe(
        `Before. <file name="notes.txt">\n${TEXT_CONTENT}\n</file> After.`
      );
    });

    it('returns empty string for a file part with no usable content and no filename', async () => {
      const msg = {
        content: {
          parts: [{ kind: 'file' } as any],
        },
      };
      await expect(reconstructMessageText(msg)).resolves.toBe('');
    });
  });
});

describe('formatMessagesAsConversationHistory', () => {
  it('returns empty string when there are no messages', async () => {
    await expect(formatMessagesAsConversationHistory([])).resolves.toBe('');
  });

  it('returns empty string when every message has empty reconstructed text', async () => {
    const messages = [
      {
        role: 'user',
        messageType: 'chat',
        content: { parts: [{ kind: 'image' }] },
      },
    ] as MessageSelect[];
    await expect(formatMessagesAsConversationHistory(messages)).resolves.toBe('');
  });

  it('wraps non-empty history in conversation_history tags', async () => {
    const messages = [
      {
        role: 'user',
        messageType: 'chat',
        content: { text: 'hi' },
      },
    ] as MessageSelect[];
    await expect(formatMessagesAsConversationHistory(messages)).resolves.toBe(
      '<conversation_history>\nuser: """hi"""\n</conversation_history>\n'
    );
  });
});
