import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { registerTextTools } from '../../../mcp-coreutils/tools/text';

function createToolRegistry() {
  const tools = new Map<string, (args: any) => Promise<CallToolResult>>();
  const server = {
    registerTool: (
      _name: string,
      _schema: any,
      handler: (args: any) => Promise<CallToolResult>
    ) => {
      tools.set(_name, handler);
    },
  } as unknown as McpServer;
  return {
    server,
    call: (name: string, args: any = {}) => {
      const handler = tools.get(name);
      if (!handler) throw new Error(`Tool "${name}" not registered`);
      return handler(args);
    },
  };
}

function text(result: CallToolResult): string {
  return (result.content[0] as { type: 'text'; text: string }).text;
}

const registry = createToolRegistry();
registerTextTools(registry.server);

describe('grep', () => {
  const content = 'apple\nBanana\ncherry\napricot\ndate';

  it('returns matching lines with line numbers', async () => {
    const result = await registry.call('grep', { pattern: 'apple', content });
    expect(text(result)).toBe('1: apple');
  });

  it('case insensitive when caseSensitive is false', async () => {
    const result = await registry.call('grep', {
      pattern: 'banana',
      content,
      caseSensitive: false,
    });
    expect(text(result)).toContain('Banana');
  });

  it('invertMatch returns non-matching lines', async () => {
    const result = await registry.call('grep', { pattern: 'apple', content, invertMatch: true });
    const output = text(result);
    expect(output).not.toContain('apple');
    expect(output).toContain('Banana');
  });

  it('countOnly returns count string', async () => {
    const result = await registry.call('grep', { pattern: 'a', content, countOnly: true });
    expect(text(result)).toBe('4');
  });

  it('onlyMatching returns only matched portion', async () => {
    const result = await registry.call('grep', { pattern: 'ap', content, onlyMatching: true });
    const output = text(result);
    expect(output).toContain('ap');
    expect(output).not.toContain('apple');
    expect(output).not.toContain('cherry');
  });

  it('beforeContext includes lines before match with -- separator', async () => {
    const multiline = 'line1\nline2\nline3\nline4\nline5';
    const result = await registry.call('grep', {
      pattern: 'line3',
      content: multiline,
      beforeContext: 1,
    });
    const output = text(result);
    expect(output).toContain('line2');
    expect(output).toContain('line3');
  });

  it('afterContext includes lines after match with -- separator', async () => {
    const multiline = 'one\ntwo\nthree\nfour\nfive';
    const result = await registry.call('grep', {
      pattern: 'one',
      content: multiline,
      afterContext: 1,
    });
    const output = text(result);
    expect(output).toContain('one');
    expect(output).toContain('two');
  });

  it('context adds separator -- between non-adjacent match groups', async () => {
    const multiline = 'a\nb\nc\nd\ne\nf\ng';
    const result = await registry.call('grep', {
      pattern: '[ag]',
      content: multiline,
      isRegex: true,
      afterContext: 1,
    });
    expect(text(result)).toContain('--');
  });

  it('wholeWord only matches whole words', async () => {
    const c = 'app\napple\napplication';
    const result = await registry.call('grep', { pattern: 'apple', content: c, wholeWord: true });
    expect(text(result)).toContain('apple');
    expect(text(result)).not.toContain('application');
  });

  it('isRegex supports regex patterns', async () => {
    const result = await registry.call('grep', { pattern: 'ch.rry', content, isRegex: true });
    expect(text(result)).toContain('cherry');
  });

  it('returns "No matches found." when no matches', async () => {
    const result = await registry.call('grep', { pattern: 'zzz', content });
    expect(text(result)).toBe('No matches found.');
  });
});

describe('sed substitution mode', () => {
  it('replaces first occurrence when replaceAll is false', async () => {
    const result = await registry.call('sed', {
      content: 'foo foo foo',
      find: 'foo',
      replace: 'bar',
      replaceAll: false,
    });
    expect(text(result)).toBe('bar foo foo');
  });

  it('replaces all occurrences by default (replaceAll defaults true)', async () => {
    const result = await registry.call('sed', {
      content: 'foo foo foo',
      find: 'foo',
      replace: 'bar',
    });
    expect(text(result)).toBe('bar bar bar');
  });

  it('supports regex with capture groups when isRegex is true', async () => {
    const result = await registry.call('sed', {
      content: 'hello world',
      find: '(hello) (world)',
      replace: '$2 $1',
      isRegex: true,
    });
    expect(text(result)).toBe('world hello');
  });

  it('case insensitive when caseSensitive is false', async () => {
    const result = await registry.call('sed', {
      content: 'Hello HELLO hello',
      find: 'hello',
      replace: 'hi',
      caseSensitive: false,
    });
    expect(text(result)).toBe('hi hi hi');
  });
});

describe('sed address/extraction mode', () => {
  const multiline = 'line1\nline2\nline3\nline4\nline5';

  it('startLine/endLine extracts line range', async () => {
    const result = await registry.call('sed', { content: multiline, startLine: 2, endLine: 4 });
    expect(text(result)).toBe('line2\nline3\nline4');
  });

  it('startChar/endChar extracts character slice', async () => {
    const result = await registry.call('sed', { content: 'abcdef', startChar: 2, endChar: 5 });
    expect(text(result)).toBe('cde');
  });

  it('startPattern/endPattern extracts matching range inclusive', async () => {
    const result = await registry.call('sed', {
      content: multiline,
      startPattern: 'line2',
      endPattern: 'line4',
    });
    expect(text(result)).toBe('line2\nline3\nline4');
  });

  it('startPattern alone with invertMatch deletes matching lines', async () => {
    const result = await registry.call('sed', {
      content: multiline,
      startPattern: 'line3',
      invertMatch: true,
    });
    const output = text(result);
    expect(output).not.toContain('line3');
    expect(output).toContain('line1');
    expect(output).toContain('line5');
  });
});

describe('diff', () => {
  it('returns unified diff output containing --- and +++ lines', async () => {
    const result = await registry.call('diff', { a: 'foo\nbar', b: 'foo\nbaz' });
    const output = text(result);
    expect(output).toContain('---');
    expect(output).toContain('+++');
  });

  it('identical inputs produce minimal diff with no + or - change lines', async () => {
    const result = await registry.call('diff', { a: 'same text', b: 'same text' });
    const output = text(result);
    const changeLines = output.split('\n').filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l));
    expect(changeLines).toHaveLength(0);
  });
});

describe('patch', () => {
  it('applies a valid unified diff and returns patched text', async () => {
    const { createPatch } = await import('diff');
    const original = 'foo\nbar\nbaz\n';
    const modified = 'foo\nqux\nbaz\n';
    const patchStr = createPatch('file', original, modified);
    const result = await registry.call('patch', { original, patch: patchStr });
    expect(text(result)).toBe(modified);
  });

  it('returns isError true when patch does not apply', async () => {
    const result = await registry.call('patch', {
      original: 'completely different content',
      patch: '--- a\n+++ b\n@@ -1,1 +1,1 @@\n-old line\n+new line\n',
    });
    expect(result.isError).toBe(true);
  });
});

describe('head', () => {
  const content = 'a\nb\nc\nd\ne';

  it('returns first N lines', async () => {
    const result = await registry.call('head', { content, n: 3 });
    expect(text(result)).toBe('a\nb\nc');
  });

  it('negative n returns all but last N lines', async () => {
    const result = await registry.call('head', { content, n: -2 });
    expect(text(result)).toBe('a\nb\nc');
  });
});

describe('tail', () => {
  const content = 'a\nb\nc\nd\ne';

  it('returns last N lines', async () => {
    const result = await registry.call('tail', { content, n: 3 });
    expect(text(result)).toBe('c\nd\ne');
  });

  it('negative n returns all but first N lines', async () => {
    const result = await registry.call('tail', { content, n: -2 });
    expect(text(result)).toBe('c\nd\ne');
  });
});
