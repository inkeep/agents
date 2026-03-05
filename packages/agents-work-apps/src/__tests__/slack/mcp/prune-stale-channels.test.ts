import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const updateSlackMcpToolAccessChannelIdsMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    updateSlackMcpToolAccessChannelIds: () => updateSlackMcpToolAccessChannelIdsMock,
  };
});

vi.mock('../../../db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('pruneStaleChannelIds', () => {
  let pruneStaleChannelIds: typeof import('../../../slack/mcp/index').pruneStaleChannelIds;

  beforeAll(async () => {
    ({ pruneStaleChannelIds } = await import('../../../slack/mcp/index'));
  });

  beforeEach(() => {
    updateSlackMcpToolAccessChannelIdsMock.mockClear();
  });

  it('should not update DB when all channel IDs are still available', () => {
    const availableChannels = [
      { id: 'C123', name: 'general' },
      { id: 'C456', name: 'random' },
    ];

    pruneStaleChannelIds('tool-1', availableChannels, ['C123', 'C456']);

    expect(updateSlackMcpToolAccessChannelIdsMock).not.toHaveBeenCalled();
  });

  it('should prune stale channel IDs and update DB', () => {
    const availableChannels = [{ id: 'C123', name: 'general' }];

    pruneStaleChannelIds('tool-1', availableChannels, ['C123', 'C456', 'C789']);

    expect(updateSlackMcpToolAccessChannelIdsMock).toHaveBeenCalledWith('tool-1', ['C123']);
  });

  it('should prune all channel IDs when none are available', () => {
    pruneStaleChannelIds('tool-1', [], ['C123', 'C456']);

    expect(updateSlackMcpToolAccessChannelIdsMock).toHaveBeenCalledWith('tool-1', []);
  });

  it('should not update DB when current channel IDs list is empty', () => {
    const availableChannels = [{ id: 'C123', name: 'general' }];

    pruneStaleChannelIds('tool-1', availableChannels, []);

    expect(updateSlackMcpToolAccessChannelIdsMock).not.toHaveBeenCalled();
  });

  it('should return the original channel IDs', () => {
    const availableChannels = [{ id: 'C123', name: 'general' }];
    const currentIds = ['C123', 'C456'];

    const result = pruneStaleChannelIds('tool-1', availableChannels, currentIds);

    expect(result).toEqual(['C123', 'C456']);
  });
});
