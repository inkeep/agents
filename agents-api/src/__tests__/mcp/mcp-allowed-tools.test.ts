import { createConsoleLogger, createMCPServer } from '@inkeep/agents-mcp';
import { describe, expect, it } from 'vitest';
import { INKEEP_MCP_ALLOWED_TOOLS } from '../../domains/mcp/mcpAllowedTools';

function registeredToolNames(opts?: { allowedTools?: string[] }): Set<string> {
  const mcpServer = createMCPServer({
    logger: createConsoleLogger('error'),
    serverURL: 'http://localhost:3002',
    ...opts,
  });
  const registry = (
    mcpServer as unknown as { server: { _registeredTools?: Record<string, unknown> } }
  ).server._registeredTools;
  return new Set(Object.keys(registry ?? {}));
}

describe('INKEEP_MCP_ALLOWED_TOOLS', () => {
  it('is the curated 184-tool golden path with no duplicates', () => {
    expect(INKEEP_MCP_ALLOWED_TOOLS.length).toBe(184);
    expect(new Set(INKEEP_MCP_ALLOWED_TOOLS).size).toBe(184);
  });

  it('every allowlisted name exists in the real generated tool registry (no typos / drift)', () => {
    const all = registeredToolNames();
    const missing = INKEEP_MCP_ALLOWED_TOOLS.filter((name) => !all.has(name));
    expect(missing).toEqual([]);
  });

  it('passing the allowlist to createMCPServer exposes exactly those 184 tools', () => {
    const exposed = registeredToolNames({ allowedTools: [...INKEEP_MCP_ALLOWED_TOOLS] });
    expect(exposed.size).toBe(184);
    // and it genuinely filtered the surface down (full set is much larger)
    const full = registeredToolNames();
    expect(full.size).toBeGreaterThan(200);
  });
});
