import { describe, expect, it } from 'vitest';
import { decodeBackslashes, encodeBackslashes } from '../../db/manage/dolt-safe-jsonb';

describe('encodeBackslashes', () => {
  it('replaces backslashes in strings with placeholder', () => {
    expect(encodeBackslashes('hello\\world')).toBe('hello\uE000world');
  });

  it('handles multiple backslashes', () => {
    expect(encodeBackslashes('a\\b\\c')).toBe('a\uE000b\uE000c');
  });

  it('handles escaped sequences like \\n', () => {
    expect(encodeBackslashes('line1\\nline2')).toBe('line1\uE000nline2');
  });

  it('passes through strings without backslashes', () => {
    expect(encodeBackslashes('hello world')).toBe('hello world');
  });

  it('passes through non-string primitives', () => {
    expect(encodeBackslashes(42)).toBe(42);
    expect(encodeBackslashes(true)).toBe(true);
    expect(encodeBackslashes(null)).toBe(null);
    expect(encodeBackslashes(undefined)).toBe(undefined);
  });

  it('recursively encodes nested objects', () => {
    const input = { a: 'x\\y', b: { c: 'p\\q' } };
    const expected = { a: 'x\uE000y', b: { c: 'p\uE000q' } };
    expect(encodeBackslashes(input)).toEqual(expected);
  });

  it('recursively encodes arrays', () => {
    const input = ['a\\b', 123, { d: 'e\\f' }];
    const expected = ['a\uE000b', 123, { d: 'e\uE000f' }];
    expect(encodeBackslashes(input)).toEqual(expected);
  });

  it('handles empty strings and objects', () => {
    expect(encodeBackslashes('')).toBe('');
    expect(encodeBackslashes({})).toEqual({});
    expect(encodeBackslashes([])).toEqual([]);
  });
});

describe('decodeBackslashes', () => {
  it('replaces placeholder with backslashes', () => {
    expect(decodeBackslashes('hello\uE000world')).toBe('hello\\world');
  });

  it('passes through strings without placeholder', () => {
    expect(decodeBackslashes('hello world')).toBe('hello world');
  });

  it('recursively decodes nested objects', () => {
    const input = { a: 'x\uE000y', b: { c: 'p\uE000q' } };
    const expected = { a: 'x\\y', b: { c: 'p\\q' } };
    expect(decodeBackslashes(input)).toEqual(expected);
  });
});

describe('roundtrip encode/decode', () => {
  it('preserves strings with backslashes', () => {
    const original = 'path\\to\\file\\name';
    expect(decodeBackslashes(encodeBackslashes(original))).toBe(original);
  });

  it('preserves the Composio MCP instruction string that triggered the bug', () => {
    const original =
      'When passing string values to tools, send the content directly without escape sequences. For example, use real newlines in markdown content rather than literal backslash-n (\\n) characters.';
    expect(decodeBackslashes(encodeBackslashes(original))).toBe(original);
  });

  it('preserves complex nested objects with mixed types', () => {
    const original = {
      prompt: 'meep \\\\n <nlej> \\n </nlej>',
      config: {
        type: 'mcp' as const,
        mcp: { server: { url: 'https://example.com' } },
      },
      tags: ['test\\value', 'normal'],
      count: 42,
      enabled: true,
      empty: null,
    };
    expect(decodeBackslashes(encodeBackslashes(original))).toEqual(original);
  });

  it('preserves strings with only backslashes', () => {
    expect(decodeBackslashes(encodeBackslashes('\\'))).toBe('\\');
    expect(String(decodeBackslashes(encodeBackslashes('\\\\')))).toBe('\\\\');
  });

  it('produces JSON without double-backslash sequences', () => {
    const input = { v: 'hello\\nworld' };
    const encoded = encodeBackslashes(input);
    const json = JSON.stringify(encoded);
    expect(json).not.toContain('\\\\');
    expect(json).toContain('\uE000');
  });
});
