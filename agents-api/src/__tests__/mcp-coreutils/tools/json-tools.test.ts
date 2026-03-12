import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { registerJsonTools } from '../../../mcp-coreutils/tools/json-tools';

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
registerJsonTools(registry.server);

describe('json_format', () => {
  it('pretty-prints an object', async () => {
    const result = await registry.call('json_format', { input: { a: 1, b: 2 } });
    expect(text(result)).toBe(JSON.stringify({ a: 1, b: 2 }, null, 2));
  });

  it('pretty-prints a JSON string', async () => {
    const result = await registry.call('json_format', { input: '{"x":1}' });
    expect(text(result)).toBe(JSON.stringify({ x: 1 }, null, 2));
  });

  it('returns isError for invalid JSON string', async () => {
    const result = await registry.call('json_format', { input: 'not json at all {{{' });
    expect(result.isError).toBe(true);
  });
});

describe('json_query', () => {
  const data = { user: { name: 'Alice', age: 30 }, items: [{ type: 'doc', text: 'hello' }, { type: 'img', url: 'x.png' }] };

  it('extracts top-level field', async () => {
    const result = await registry.call('json_query', { data, query: 'user' });
    expect(JSON.parse(text(result))).toEqual({ name: 'Alice', age: 30 });
  });

  it('extracts nested field', async () => {
    const result = await registry.call('json_query', { data, query: 'user.name' });
    expect(JSON.parse(text(result))).toBe('Alice');
  });

  it('filters array with JMESPath', async () => {
    const result = await registry.call('json_query', { data, query: "items[?type=='doc'] | [0].text" });
    expect(JSON.parse(text(result))).toBe('hello');
  });

  it('returns null for missing path', async () => {
    const result = await registry.call('json_query', { data, query: 'nonexistent.field' });
    expect(JSON.parse(text(result))).toBeNull();
  });
});

describe('json_merge', () => {
  it('deep merges two objects with nested object merging', async () => {
    const base = { a: { x: 1, y: 2 }, b: 'keep' };
    const override = { a: { y: 99, z: 3 } };
    const result = await registry.call('json_merge', { base, override });
    const merged = JSON.parse(text(result));
    expect(merged).toEqual({ a: { x: 1, y: 99, z: 3 }, b: 'keep' });
  });

  it('shallow merge when deep is false', async () => {
    const base = { a: { x: 1, y: 2 }, b: 'keep' };
    const override = { a: { z: 3 } };
    const result = await registry.call('json_merge', { base, override, deep: false });
    const merged = JSON.parse(text(result));
    expect(merged.a).toEqual({ z: 3 });
    expect(merged.b).toBe('keep');
  });

  it('returns error for non-object base', async () => {
    const result = await registry.call('json_merge', { base: [1, 2], override: { a: 1 } });
    expect(result.isError).toBe(true);
  });

  it('returns error for non-object override', async () => {
    const result = await registry.call('json_merge', { base: { a: 1 }, override: 'string' });
    expect(result.isError).toBe(true);
  });
});

describe('json_diff', () => {
  it('returns "No differences found." for identical objects', async () => {
    const obj = { a: 1, b: 'hello' };
    const result = await registry.call('json_diff', { a: obj, b: obj });
    expect(text(result)).toBe('No differences found.');
  });

  it('shows ~ for changed values', async () => {
    const result = await registry.call('json_diff', { a: { x: 1 }, b: { x: 2 } });
    expect(text(result)).toContain('~');
  });

  it('shows + for added keys', async () => {
    const result = await registry.call('json_diff', { a: { x: 1 }, b: { x: 1, y: 2 } });
    expect(text(result)).toMatch(/^\+ /m);
  });

  it('shows - for removed keys', async () => {
    const result = await registry.call('json_diff', { a: { x: 1, y: 2 }, b: { x: 1 } });
    expect(text(result)).toMatch(/^- /m);
  });
});
