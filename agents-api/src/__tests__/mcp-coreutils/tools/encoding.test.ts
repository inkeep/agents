import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { registerEncodingTools } from '../../../mcp-coreutils/tools/encoding';

function createToolRegistry() {
  const tools = new Map<string, (args: any) => Promise<CallToolResult>>();
  const server = {
    registerTool: (_name: string, _schema: any, handler: (args: any) => Promise<CallToolResult>) => {
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
registerEncodingTools(registry.server);

describe('base64_encode', () => {
  it('encodes string to base64', async () => {
    const result = await registry.call('base64_encode', { input: 'hello world' });
    expect(text(result)).toBe(Buffer.from('hello world', 'utf-8').toString('base64'));
  });
});

describe('base64_decode', () => {
  it('decodes base64 back to original string', async () => {
    const encoded = Buffer.from('hello world', 'utf-8').toString('base64');
    const result = await registry.call('base64_decode', { input: encoded });
    expect(text(result)).toBe('hello world');
  });
});

describe('url_encode', () => {
  it('encodes special chars using encodeURIComponent by default', async () => {
    const result = await registry.call('url_encode', { input: 'hello world&foo=bar' });
    expect(text(result)).toBe(encodeURIComponent('hello world&foo=bar'));
  });

  it('uses encodeURI when encodeComponent is false', async () => {
    const result = await registry.call('url_encode', { input: 'https://example.com/path?q=1&r=2', encodeComponent: false });
    expect(text(result)).toBe(encodeURI('https://example.com/path?q=1&r=2'));
  });
});

describe('url_decode', () => {
  it('decodes percent-encoded string', async () => {
    const result = await registry.call('url_decode', { input: 'hello%20world%26foo%3Dbar' });
    expect(text(result)).toBe('hello world&foo=bar');
  });
});

describe('hash', () => {
  it('sha256 hex by default', async () => {
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update('test', 'utf-8').digest('hex');
    const result = await registry.call('hash', { input: 'test' });
    expect(text(result)).toBe(expected);
  });

  it('md5 produces different output than sha256', async () => {
    const sha256Result = await registry.call('hash', { input: 'test', algorithm: 'sha256' });
    const md5Result = await registry.call('hash', { input: 'test', algorithm: 'md5' });
    expect(text(sha256Result)).not.toBe(text(md5Result));
  });

  it('base64 encoding works', async () => {
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update('test', 'utf-8').digest('base64');
    const result = await registry.call('hash', { input: 'test', algorithm: 'sha256', encoding: 'base64' });
    expect(text(result)).toBe(expected);
  });
});
