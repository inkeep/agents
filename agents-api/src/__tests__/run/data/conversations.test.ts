import type { MessageSelect } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import {
  formatMessagesAsConversationHistory,
  reconstructMessageText,
} from '../../../domains/run/data/conversations';

describe('reconstructMessageText', () => {
  it('falls back to content.text when content has no parts array', () => {
    const msg = { content: { text: 'Hello world' } };
    expect(reconstructMessageText(msg)).toBe('Hello world');
  });

  it('falls back to content.text when parts is empty', () => {
    const msg = { content: { text: 'fallback text', parts: [] } };
    expect(reconstructMessageText(msg)).toBe('fallback text');
  });

  it('returns empty string when content has no text and no parts', () => {
    const msg = { content: {} };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('uses part.type when kind is omitted (legacy shape)', () => {
    const msg = {
      content: { parts: [{ type: 'text', text: 'legacy' } as any] },
    } as Pick<MessageSelect, 'content'>;
    expect(reconstructMessageText(msg)).toBe('legacy');
  });

  it('concatenates text parts in order', () => {
    const msg = {
      content: {
        parts: [
          { kind: 'text', text: 'Hello ' },
          { kind: 'text', text: 'world' },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe('Hello world');
  });

  it('converts data parts with artifactId + toolCallId to artifact:ref tags', () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: { artifactId: 'art-1', toolCallId: 'tool-1' } }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('<artifact:ref id="art-1" tool="tool-1" />');
  });

  it('interleaves text and artifact:ref tags correctly', () => {
    const msg = {
      content: {
        parts: [
          { kind: 'text', text: 'Here is the result. ' },
          { kind: 'data', data: { artifactId: 'art-abc', toolCallId: 'toolu_xyz' } },
          { kind: 'text', text: ' And more text.' },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe(
      'Here is the result. <artifact:ref id="art-abc" tool="toolu_xyz" /> And more text.'
    );
  });

  it('handles data parts with JSON string data', () => {
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
    expect(reconstructMessageText(msg)).toBe('<artifact:ref id="art-json" tool="tool-json" />');
  });

  it('ignores data parts without artifactId', () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: { toolCallId: 'tool-1' } }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('ignores data parts without toolCallId', () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: { artifactId: 'art-1' } }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('ignores data parts with unparseable JSON string', () => {
    const msg = {
      content: {
        parts: [{ kind: 'data', data: 'not-valid-json' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('returns empty string for unknown part types', () => {
    const msg = {
      content: {
        parts: [{ kind: 'image' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('handles multiple artifact refs in a single message', () => {
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
    expect(reconstructMessageText(msg)).toBe(
      'First: <artifact:ref id="art-1" tool="tool-1" /> Second: <artifact:ref id="art-2" tool="tool-2" />'
    );
  });

  it('handles missing text property in text part gracefully', () => {
    const msg = {
      content: {
        parts: [{ kind: 'text' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('emits a self-closing attached_file marker for non-text file parts', () => {
    const msg = {
      content: {
        parts: [
          {
            kind: 'file',
            data: 'blob://img-1',
            metadata: { mimeType: 'image/png', filename: 'screenshot.png' },
          },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe(
      '<attached_file filename="screenshot.png" media_type="image/png" />'
    );
  });

  it('emits a marker for PDF file parts', () => {
    const msg = {
      content: {
        parts: [
          {
            kind: 'file',
            data: 'blob://pdf-1',
            metadata: { mimeType: 'application/pdf', filename: 'report.pdf' },
          },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe(
      '<attached_file filename="report.pdf" media_type="application/pdf" />'
    );
  });

  it('omits filename/media_type attributes when metadata is missing', () => {
    const msg = {
      content: {
        parts: [{ kind: 'file', data: 'blob://x' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('<attached_file />');
  });

  it('emits artifact_id + tool_call_id when file-part metadata carries them', () => {
    const msg = {
      content: {
        parts: [
          {
            kind: 'file',
            data: 'blob://img-2',
            metadata: {
              mimeType: 'image/png',
              filename: 'photo.png',
              artifactId: 'attachment_msg_abc',
              toolCallId: 'message_attachment:msg',
            },
          },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe(
      '<attached_file filename="photo.png" media_type="image/png" artifact_id="attachment_msg_abc" tool_call_id="message_attachment:msg" />'
    );
  });

  it('skips marker for text-mime file parts (content is provided by sibling text part)', () => {
    const msg = {
      content: {
        parts: [
          {
            kind: 'text',
            text: '<attached_file filename="notes.txt" media_type="text/plain">\nhello\n</attached_file>',
          },
          {
            kind: 'file',
            data: 'blob://notes-1',
            metadata: { mimeType: 'text/plain', filename: 'notes.txt' },
          },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe(
      '<attached_file filename="notes.txt" media_type="text/plain">\nhello\n</attached_file>'
    );
  });

  it('interleaves text, file markers, and artifact refs in order', () => {
    const msg = {
      content: {
        parts: [
          { kind: 'text', text: 'Here: ' },
          {
            kind: 'file',
            data: 'blob://img',
            metadata: { mimeType: 'image/jpeg', filename: 'a.jpg' },
          },
          { kind: 'text', text: ' and ' },
          { kind: 'data', data: { artifactId: 'art-1', toolCallId: 'tool-1' } },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe(
      'Here: <attached_file filename="a.jpg" media_type="image/jpeg" /> and <artifact:ref id="art-1" tool="tool-1" />'
    );
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
