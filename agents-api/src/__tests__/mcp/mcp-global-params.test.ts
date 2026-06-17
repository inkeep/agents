import { createConsoleLogger, createMCPServer } from '@inkeep/agents-mcp';
import { describe, expect, it } from 'vitest';
import { bindTenantId } from '../../domains/mcp/mcpGlobalParams';

type Registry = Record<
  string,
  { inputSchema?: { shape?: Record<string, { shape?: Record<string, unknown> }> }; handler?: any }
>;

function realServerRegistry(): Registry {
  const mcpServer = createMCPServer({
    logger: createConsoleLogger('error'),
    serverURL: 'http://localhost:3002',
  });
  return (mcpServer as unknown as { server: { _registeredTools: Registry } }).server
    ._registeredTools;
}

describe('bindTenantId (prototype)', () => {
  it('removes tenantId from the exposed input schema (projects-list-projects → zero required ids)', () => {
    const tools = realServerRegistry();
    const before = tools['projects-list-projects']?.inputSchema?.shape?.request?.shape;
    expect(before && 'tenantId' in before).toBe(true); // sanity: it starts required

    bindTenantId({ server: { _registeredTools: tools } }, 'tenant_proto');

    const after = tools['projects-list-projects']?.inputSchema?.shape?.request?.shape;
    expect(after && 'tenantId' in after).toBe(false); // tenantId is gone from the schema
    expect(after && 'page' in after).toBe(true); // other params preserved
  });

  it('injects the session tenantId into the request before the downstream call', () => {
    const tools = realServerRegistry();
    // The SDK invokes the tool via `handler`. Spy on it BEFORE binding so bindTenantId
    // wraps the real handler property (guards against wrapping the wrong key).
    let captured: any;
    expect(typeof tools['projects-list-projects'].handler).toBe('function');
    tools['projects-list-projects'].handler = (args: any) => {
      captured = args;
      return { content: [] };
    };

    bindTenantId({ server: { _registeredTools: tools } }, 'tenant_proto');

    // LLM calls with NO tenantId:
    (tools['projects-list-projects'].handler as any)({ request: { page: 1, limit: 10 } }, {});
    expect(captured.request.tenantId).toBe('tenant_proto');
  });

  it('also binds tools that require both tenantId and projectId (agents-list-agents)', () => {
    const tools = realServerRegistry();
    bindTenantId({ server: { _registeredTools: tools } }, 'tenant_proto');
    const after = tools['agents-list-agents']?.inputSchema?.shape?.request?.shape;
    expect(after && 'tenantId' in after).toBe(false); // tenantId bound
    expect(after && 'projectId' in after).toBe(true); // projectId still required (not yet bound)
  });

  it('injects every tenant-scoped tool it detects (fail-closed: injected === expected)', () => {
    const tools = realServerRegistry();
    const result = bindTenantId({ server: { _registeredTools: tools } }, 'tenant_proto');
    // Every tool with a tenantId in its request schema must get the injection — a drift in
    // the SDK shape that left some unbound would surface here as injected < expected.
    expect(result.expected).toBeGreaterThan(0);
    expect(result.injected).toBe(result.expected);
    expect(result.hidden).toBe(result.expected);
  });

  it('no-ops safely on an unexpected shape', () => {
    expect(() => bindTenantId({}, 't')).not.toThrow();
    expect(() => bindTenantId({ server: {} }, 't')).not.toThrow();
    expect(bindTenantId({}, 't')).toEqual({ expected: 0, injected: 0, hidden: 0 });
  });
});
