import { createConsoleLogger, createMCPServer } from '@inkeep/agents-mcp';
import { describe, expect, it } from 'vitest';
import { INKEEP_MCP_ALLOWED_TOOLS } from '../../domains/mcp/mcpAllowedTools';
import { getRegisteredTools, getRequestHandlers } from '../../domains/mcp/mcpServerInternals';
import { HASHED_TOOL_RENAMES, renameHashedTools } from '../../domains/mcp/mcpToolNames';

function buildServer() {
  return createMCPServer({
    logger: createConsoleLogger('error'),
    serverURL: 'http://localhost:3002',
    allowedTools: [...INKEEP_MCP_ALLOWED_TOOLS],
  });
}

async function listToolNames(server: unknown): Promise<Set<string>> {
  const handler = getRequestHandlers(server)?.get('tools/list');
  if (!handler) throw new Error('tools/list handler not found');
  const result = (await handler({ method: 'tools/list' }, {})) as {
    tools: Array<{ name: string }>;
  };
  return new Set(result.tools.map((t) => t.name));
}

describe('renameHashedTools', () => {
  it('every hashed source name still exists in the generated registry (drift guard)', () => {
    const tools = getRegisteredTools(buildServer()) ?? {};
    const missing = Object.keys(HASHED_TOOL_RENAMES).filter((name) => !(name in tools));
    expect(missing).toEqual([]);
  });

  it('replaces hashed names with clean names in tools/list', async () => {
    const server = buildServer();
    const before = await listToolNames(server);
    for (const hashed of Object.keys(HASHED_TOOL_RENAMES)) expect(before.has(hashed)).toBe(true);

    renameHashedTools(server);

    const after = await listToolNames(server);
    for (const [hashed, clean] of Object.entries(HASHED_TOOL_RENAMES)) {
      expect(after.has(hashed)).toBe(false);
      expect(after.has(clean)).toBe(true);
    }
    // No tools gained or lost — same count, just renamed.
    expect(after.size).toBe(before.size);
  });

  it('preserves the tool entry (handler) when renaming, so the tool stays callable', () => {
    const server = buildServer();
    const tools = getRegisteredTools(server) ?? {};
    const [hashed, clean] = Object.entries(HASHED_TOOL_RENAMES)[0];
    const original = tools[hashed];

    renameHashedTools(server);

    expect(tools[clean]).toBe(original); // same entry object moved under the clean key
    expect(tools[hashed]).toBeUndefined();
  });

  it('is a no-op on an unexpected shape', () => {
    expect(() => renameHashedTools({})).not.toThrow();
    expect(() => renameHashedTools({ server: {} })).not.toThrow();
  });
});
