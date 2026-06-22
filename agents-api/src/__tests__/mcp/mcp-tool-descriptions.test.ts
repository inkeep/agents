import { createConsoleLogger, createMCPServer } from '@inkeep/agents-mcp';
import { describe, expect, it } from 'vitest';
import { augmentToolDescriptions } from '../../domains/mcp/mcpToolDescriptions';

function realServer() {
  return createMCPServer({
    logger: createConsoleLogger('error'),
    serverURL: 'http://localhost:3002',
  });
}

describe('augmentToolDescriptions', () => {
  it('appends the happy-path example to create-full-agent (against the real registry)', () => {
    const mcpServer = realServer();
    const tools = (
      mcpServer as unknown as {
        server: { _registeredTools: Record<string, { description: string }> };
      }
    ).server._registeredTools;

    const before = tools['agents-create-full-agent'].description;
    expect(before).not.toContain('Minimal request body');

    augmentToolDescriptions(mcpServer);

    const after = tools['agents-create-full-agent'].description;
    expect(after).toContain('Minimal request body');
    expect(after).toContain('subAgents.<key>.dataComponents'); // the non-obvious gotcha
    expect(after.startsWith(before)).toBe(true); // original preserved, only appended
  });

  it('warns on update-full-agent and is idempotent', () => {
    const mcpServer = realServer();
    const tools = (
      mcpServer as unknown as {
        server: { _registeredTools: Record<string, { description: string }> };
      }
    ).server._registeredTools;

    augmentToolDescriptions(mcpServer);
    augmentToolDescriptions(mcpServer); // second call must not double-append

    const desc = tools['agents-update-full-agent'].description;
    expect(desc).toContain('prefer agents-update-agent');
    expect(desc.split('prefer agents-update-agent').length).toBe(2); // appears exactly once
  });

  it('warns about the destructive files-replace default on update-skill', () => {
    const mcpServer = realServer();
    const tools = (
      mcpServer as unknown as {
        server: { _registeredTools: Record<string, { description: string }> };
      }
    ).server._registeredTools;

    augmentToolDescriptions(mcpServer);

    const desc = tools['skills-update-skill'].description;
    expect(desc).toContain('Destructive default');
    expect(desc).toContain('skills-update-skill-file');
  });

  it('no-ops safely on an unexpected shape', () => {
    expect(() => augmentToolDescriptions({})).not.toThrow();
    expect(() => augmentToolDescriptions({ server: {} })).not.toThrow();
  });
});
