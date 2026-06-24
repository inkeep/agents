import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    onclose: null,
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({
    close: mockClose,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
    close: mockClose,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/shared/protocol.js', () => ({
  DEFAULT_REQUEST_TIMEOUT_MSEC: 60000,
}));

vi.mock('exit-hook', () => ({
  asyncExitHook: vi.fn(),
}));

const loggerRefs = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: loggerRefs.warn, error: vi.fn() }),
}));

describe('McpClient global registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { activeMcpClients } = await import('../mcp-client');
    activeMcpClients.clear();
  });

  it('should add client to activeMcpClients on connect', async () => {
    const { McpClient, activeMcpClients } = await import('../mcp-client');

    const client = new McpClient({
      name: 'test',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3000' },
    });

    expect(activeMcpClients.size).toBe(0);
    await client.connect();
    expect(activeMcpClients.has(client)).toBe(true);
  });

  it('should remove client from activeMcpClients on disconnect', async () => {
    const { McpClient, activeMcpClients } = await import('../mcp-client');

    const client = new McpClient({
      name: 'test',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3000' },
    });

    await client.connect();
    expect(activeMcpClients.has(client)).toBe(true);

    await client.disconnect();
    expect(activeMcpClients.has(client)).toBe(false);
  });

  it('should track multiple active clients', async () => {
    const { McpClient, activeMcpClients } = await import('../mcp-client');

    const client1 = new McpClient({
      name: 'test1',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3001' },
    });
    const client2 = new McpClient({
      name: 'test2',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3002' },
    });

    await client1.connect();
    await client2.connect();

    expect(activeMcpClients.size).toBe(2);

    await client1.disconnect();
    expect(activeMcpClients.size).toBe(1);
    expect(activeMcpClients.has(client2)).toBe(true);
  });

  it('should not add to registry if already connected', async () => {
    const { McpClient, activeMcpClients } = await import('../mcp-client');

    const client = new McpClient({
      name: 'test',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3000' },
    });

    await client.connect();
    await client.connect();
    expect(activeMcpClients.size).toBe(1);
  });

  it('should handle disconnect when not connected', async () => {
    const { McpClient, activeMcpClients } = await import('../mcp-client');

    const client = new McpClient({
      name: 'test',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3000' },
    });

    await client.disconnect();
    expect(activeMcpClients.size).toBe(0);
  });
});

describe('McpClient.tools() schema conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { activeMcpClients } = await import('../mcp-client');
    activeMcpClients.clear();
  });

  it('keeps a tool whose schema z.fromJSONSchema cannot parse (raw-passthrough fallback)', async () => {
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn(),
          onclose: null,
          listTools: vi.fn().mockResolvedValue({
            tools: [
              {
                name: 'bad_tool',
                // Unresolved $ref makes z.fromJSONSchema throw, exercising the fallback.
                inputSchema: {
                  type: 'object',
                  properties: { x: { $ref: '#/$defs/Missing' } },
                  required: ['x'],
                },
              },
            ],
          }),
        }) as unknown as InstanceType<typeof Client>
    );
    loggerRefs.warn.mockClear();

    const { McpClient } = await import('../mcp-client');
    const client = new McpClient({
      name: 'srv',
      server: { type: 'streamable_http' as const, url: 'http://localhost:3000' },
    });
    await client.connect();
    const tools = await client.tools();

    expect(tools.bad_tool).toBeDefined();
    expect(loggerRefs.warn).toHaveBeenCalled();
    // Fallback passes the raw JSON Schema through (wrapped by the AI SDK's jsonSchema()).
    const wrapped = tools.bad_tool.inputSchema as {
      jsonSchema?: { properties?: Record<string, unknown> };
    };
    expect(wrapped.jsonSchema?.properties?.x).toBeDefined();
  });
});
