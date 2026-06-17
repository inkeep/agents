import { createConsoleLogger, createMCPServer } from '@inkeep/agents-mcp';
import { describe, expect, it } from 'vitest';
import {
  INKEEP_MCP_INSTRUCTIONS,
  setServerInstructions,
} from '../../domains/mcp/mcpServerInstructions';

describe('INKEEP_MCP_INSTRUCTIONS', () => {
  it('is a concise, non-empty routing hint that names the composite-first guidance', () => {
    expect(INKEEP_MCP_INSTRUCTIONS.length).toBeGreaterThan(100);
    // The single most important steer: prefer the full composite.
    expect(INKEEP_MCP_INSTRUCTIONS).toContain('create-full-agent');
    expect(INKEEP_MCP_INSTRUCTIONS).toContain('get-full-agent');
  });
});

describe('setServerInstructions', () => {
  it('sets _instructions on the low-level Server (shape mock)', () => {
    const mcpServer = { server: { server: { _instructions: undefined as string | undefined } } };
    setServerInstructions(mcpServer, 'hello');
    expect(mcpServer.server.server._instructions).toBe('hello');
  });

  it('no-ops without throwing when the SDK shape is absent', () => {
    expect(() => setServerInstructions({}, 'x')).not.toThrow();
    expect(() => setServerInstructions({ server: {} }, 'x')).not.toThrow();
    expect(() => setServerInstructions(undefined, 'x')).not.toThrow();
  });

  it('reaches the real generated MCP server (guards against SDK/Speakeasy shape drift)', () => {
    const mcpServer = createMCPServer({
      logger: createConsoleLogger('error'),
      serverURL: 'http://localhost:3002',
    });
    setServerInstructions(mcpServer, INKEEP_MCP_INSTRUCTIONS);
    // The low-level Server (which emits `instructions` in the initialize result)
    // lives at mcpServer.server.server.
    const lowLevel = (mcpServer as unknown as { server: { server: { _instructions?: string } } })
      .server.server;
    expect(lowLevel._instructions).toBe(INKEEP_MCP_INSTRUCTIONS);
  });
});
