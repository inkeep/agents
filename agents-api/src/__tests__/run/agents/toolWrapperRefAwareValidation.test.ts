import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapToolWithStreaming } from '../../../domains/run/agents/tools/tool-wrapper';

vi.mock('../../../domains/run/session/AgentSession', () => ({
  agentSessionManager: {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    getArtifactParser: vi.fn(),
  },
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    createMessage: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
  };
});

describe('wrapToolWithStreaming baseInputSchema validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext() {
    return {
      conversationId: undefined,
      isDelegatedAgent: false,
      streamHelper: undefined,
      config: {
        id: 'sub-agent-1',
        name: 'SubAgent',
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      },
      delegationId: undefined,
      functionToolRelationshipIdByName: new Map(),
    } as any;
  }

  it('rejects resolved args that fail baseInputSchema validation', async () => {
    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession');
    vi.mocked(agentSessionManager.getArtifactParser).mockReturnValue({
      resolveArgs: vi.fn().mockResolvedValue({ city: 123 }),
    } as any);

    const executeSpy = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapToolWithStreaming(
      createContext(),
      'weather_tool',
      {
        description: 'Weather tool',
        execute: executeSpy,
        baseInputSchema: {
          safeParse: vi.fn().mockReturnValue({
            success: false,
            error: { message: 'city must be a string' },
          }),
        },
      } as any,
      'stream-1',
      'tool'
    );

    await expect(
      (wrapped as any).execute({ city: { $tool: 'call_1', $path: 'location.city' } }, {})
    ).rejects.toThrow(
      "Resolved tool args failed schema validation for 'weather_tool': city must be a string"
    );
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('executes with resolved args when baseInputSchema validation passes', async () => {
    const { agentSessionManager } = await import('../../../domains/run/session/AgentSession');
    vi.mocked(agentSessionManager.getArtifactParser).mockReturnValue({
      resolveArgs: vi.fn().mockResolvedValue({ city: 'San Francisco' }),
    } as any);

    const executeSpy = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = wrapToolWithStreaming(
      createContext(),
      'weather_tool',
      {
        description: 'Weather tool',
        execute: executeSpy,
        baseInputSchema: {
          safeParse: vi.fn().mockReturnValue({ success: true }),
        },
      } as any,
      'stream-1',
      'tool'
    );

    await (wrapped as any).execute({ city: { $tool: 'call_1', $path: 'location.city' } }, {});
    expect(executeSpy).toHaveBeenCalledWith({ city: 'San Francisco' }, {});
  });
});
