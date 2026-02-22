import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../Agent';

vi.mock('../../../../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createDefaultConversationHistoryConfig: () => ({
      maxTurns: 10,
      maxTokens: 4000,
    }),
  };
});

describe('Agent.cleanup', () => {
  const mockDisconnect = vi.fn();

  function createMockMcpClient(name: string) {
    return {
      name,
      disconnect: mockDisconnect,
      isConnected: () => true,
      connect: vi.fn(),
      tools: vi.fn().mockResolvedValue({}),
    };
  }

  beforeEach(() => {
    mockDisconnect.mockReset();
    mockDisconnect.mockResolvedValue(undefined);
  });

  function createMinimalAgent(): Agent {
    return new Agent(
      {
        id: 'test-agent',
        agentId: 'test-agent',
        name: 'Test Agent',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        systemPrompt: 'test prompt',
        models: {
          chat: { provider: 'anthropic', name: 'claude-sonnet-4-20250514' },
        },
      } as any,
      {
        resolvedRef: { type: 'branch', ref: 'main' },
        project: { id: 'test-project', tenantId: 'test-tenant' },
      } as any
    );
  }

  it('should disconnect all cached MCP clients', async () => {
    const agent = createMinimalAgent();
    const cache = (agent as any).mcpClientCache as Map<string, any>;
    cache.set('client1', createMockMcpClient('client1'));
    cache.set('client2', createMockMcpClient('client2'));
    cache.set('client3', createMockMcpClient('client3'));

    await agent.cleanup();

    expect(mockDisconnect).toHaveBeenCalledTimes(3);
  });

  it('should clear mcpClientCache and mcpConnectionLocks after cleanup', async () => {
    const agent = createMinimalAgent();
    const cache = (agent as any).mcpClientCache as Map<string, any>;
    const locks = (agent as any).mcpConnectionLocks as Map<string, any>;
    cache.set('client1', createMockMcpClient('client1'));
    locks.set('client1', Promise.resolve(createMockMcpClient('client1')));

    await agent.cleanup();

    expect(cache.size).toBe(0);
    expect(locks.size).toBe(0);
  });

  it('should not throw when a client disconnect fails', async () => {
    const agent = createMinimalAgent();
    const cache = (agent as any).mcpClientCache as Map<string, any>;

    const failingClient = createMockMcpClient('failing');
    failingClient.disconnect = vi.fn().mockRejectedValue(new Error('disconnect failed'));
    const successClient = createMockMcpClient('success');

    cache.set('failing', failingClient);
    cache.set('success', successClient);

    await expect(agent.cleanup()).resolves.toBeUndefined();
    expect(failingClient.disconnect).toHaveBeenCalled();
    expect(successClient.disconnect).toHaveBeenCalled();
  });

  it('should call cleanupCompression', async () => {
    const agent = createMinimalAgent();
    const cleanupCompressionSpy = vi.spyOn(agent, 'cleanupCompression');

    await agent.cleanup();

    expect(cleanupCompressionSpy).toHaveBeenCalled();
  });

  it('should handle cleanup with empty cache', async () => {
    const agent = createMinimalAgent();

    await expect(agent.cleanup()).resolves.toBeUndefined();
  });
});
