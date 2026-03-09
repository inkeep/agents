import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../env', () => ({
  env: {
    SLACK_MCP_API_KEY: 'test-slack-api-key',
  },
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('slack mcp utils', () => {
  describe('validateChannelAccess', () => {
    let validateChannelAccess: typeof import('../../../slack/mcp/utils').validateChannelAccess;

    beforeAll(async () => {
      ({ validateChannelAccess } = await import('../../../slack/mcp/utils'));
    });

    it('allows any channel when mode is all', () => {
      const result = validateChannelAccess('C123', {
        channelAccessMode: 'all',
        dmEnabled: false,
        channelIds: [],
      });
      expect(result).toEqual({ allowed: true });
    });

    it('allows listed channel when mode is selected', () => {
      const result = validateChannelAccess('C123', {
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C123', 'C456'],
      });
      expect(result).toEqual({ allowed: true });
    });

    it('rejects unlisted channel when mode is selected', () => {
      const result = validateChannelAccess('C789', {
        channelAccessMode: 'selected',
        dmEnabled: false,
        channelIds: ['C123', 'C456'],
      });
      expect(result).toEqual({ allowed: false, reason: 'Channel not in allowed list' });
    });

    it('rejects DM channel when dmEnabled is false', () => {
      const result = validateChannelAccess('D123', {
        channelAccessMode: 'all',
        dmEnabled: false,
        channelIds: [],
      });
      expect(result).toEqual({
        allowed: false,
        reason: 'DM access is not enabled for this tool',
      });
    });

    it('allows DM channel when dmEnabled is true', () => {
      const result = validateChannelAccess('D123', {
        channelAccessMode: 'all',
        dmEnabled: true,
        channelIds: [],
      });
      expect(result).toEqual({ allowed: true });
    });

    it('allows DM channel when dmEnabled is true regardless of access mode', () => {
      const result = validateChannelAccess('D123', {
        channelAccessMode: 'selected',
        dmEnabled: true,
        channelIds: [],
      });
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('resolveChannelId', () => {
    let resolveChannelId: typeof import('../../../slack/mcp/utils').resolveChannelId;

    beforeAll(async () => {
      ({ resolveChannelId } = await import('../../../slack/mcp/utils'));
    });

    it('returns channel ID as-is when not prefixed with #', async () => {
      const mockClient = {} as any;
      const result = await resolveChannelId(mockClient, 'C1234567890');
      expect(result).toBe('C1234567890');
    });

    it('resolves #channel-name to channel ID via Slack API', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({
            channels: [
              { id: 'C111', name: 'random' },
              { id: 'C222', name: 'general' },
            ],
            response_metadata: {},
          }),
        },
      } as any;

      const result = await resolveChannelId(mockClient, '#general');
      expect(result).toBe('C222');
    });

    it('throws when channel name is not found', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({
            channels: [{ id: 'C111', name: 'random' }],
            response_metadata: {},
          }),
        },
      } as any;

      await expect(resolveChannelId(mockClient, '#nonexistent')).rejects.toThrow(
        'Channel not found: #nonexistent'
      );
    });

    it('paginates through channels to find match', async () => {
      const mockClient = {
        conversations: {
          list: vi
            .fn()
            .mockResolvedValueOnce({
              channels: [{ id: 'C111', name: 'random' }],
              response_metadata: { next_cursor: 'page2' },
            })
            .mockResolvedValueOnce({
              channels: [{ id: 'C333', name: 'target' }],
              response_metadata: {},
            }),
        },
      } as any;

      const result = await resolveChannelId(mockClient, '#target');
      expect(result).toBe('C333');
      expect(mockClient.conversations.list).toHaveBeenCalledTimes(2);
    });
  });
});
