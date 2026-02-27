import { describe, expect, it } from 'vitest';
import { reconstructMessageText } from '../../../domains/run/data/conversations';

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

  it('concatenates text parts in order', () => {
    const msg = {
      content: {
        parts: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      },
    };
    expect(reconstructMessageText(msg)).toBe('Hello world');
  });

  it('converts data parts with artifactId + toolCallId to artifact:ref tags', () => {
    const msg = {
      content: {
        parts: [{ type: 'data', data: { artifactId: 'art-1', toolCallId: 'tool-1' } }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('<artifact:ref id="art-1" tool="tool-1" />');
  });

  it('interleaves text and artifact:ref tags correctly', () => {
    const msg = {
      content: {
        parts: [
          { type: 'text', text: 'Here is the result. ' },
          { type: 'data', data: { artifactId: 'art-abc', toolCallId: 'toolu_xyz' } },
          { type: 'text', text: ' And more text.' },
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
            type: 'data',
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
        parts: [{ type: 'data', data: { toolCallId: 'tool-1' } }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('ignores data parts without toolCallId', () => {
    const msg = {
      content: {
        parts: [{ type: 'data', data: { artifactId: 'art-1' } }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('ignores data parts with unparseable JSON string', () => {
    const msg = {
      content: {
        parts: [{ type: 'data', data: 'not-valid-json' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('returns empty string for unknown part types', () => {
    const msg = {
      content: {
        parts: [{ type: 'image', url: 'http://example.com/img.png' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });

  it('handles multiple artifact refs in a single message', () => {
    const msg = {
      content: {
        parts: [
          { type: 'text', text: 'First: ' },
          { type: 'data', data: { artifactId: 'art-1', toolCallId: 'tool-1' } },
          { type: 'text', text: ' Second: ' },
          { type: 'data', data: { artifactId: 'art-2', toolCallId: 'tool-2' } },
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
        parts: [{ type: 'text' }],
      },
    };
    expect(reconstructMessageText(msg)).toBe('');
  });
});
