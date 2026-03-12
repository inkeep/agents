import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { registerUtilityTools } from '../../../mcp-coreutils/tools/utility';

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
registerUtilityTools(registry.server);

describe('calculate', () => {
  it('evaluates basic arithmetic expression', async () => {
    const result = await registry.call('calculate', { expression: '2 + 3 * 4' });
    expect(text(result)).toBe('14');
  });

  it('evaluates expression with parentheses', async () => {
    const result = await registry.call('calculate', { expression: '(2 + 3) * 4' });
    expect(text(result)).toBe('20');
  });

  it('returns isError for disallowed characters', async () => {
    const result = await registry.call('calculate', { expression: 'alert("xss")' });
    expect(result.isError).toBe(true);
  });

  it('returns isError for division by zero', async () => {
    const result = await registry.call('calculate', { expression: '1 / 0' });
    expect(result.isError).toBe(true);
  });
});

describe('uuid', () => {
  it('returns a string matching UUID v4 format', async () => {
    const result = await registry.call('uuid');
    expect(text(result)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});

describe('timestamp', () => {
  it('iso format returns valid ISO 8601 string', async () => {
    const result = await registry.call('timestamp', { format: 'iso' });
    expect(() => new Date(text(result)).toISOString()).not.toThrow();
    expect(text(result)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('unix format returns numeric string', async () => {
    const result = await registry.call('timestamp', { format: 'unix' });
    const num = Number(text(result));
    expect(Number.isFinite(num)).toBe(true);
    expect(num).toBeGreaterThan(0);
  });

  it('unix_ms format returns numeric string larger than unix', async () => {
    const unixResult = await registry.call('timestamp', { format: 'unix' });
    const unixMsResult = await registry.call('timestamp', { format: 'unix_ms' });
    const unix = Number(text(unixResult));
    const unixMs = Number(text(unixMsResult));
    expect(unixMs).toBeGreaterThan(unix);
  });

  it('utc format returns string containing "GMT"', async () => {
    const result = await registry.call('timestamp', { format: 'utc' });
    expect(text(result)).toContain('GMT');
  });
});
