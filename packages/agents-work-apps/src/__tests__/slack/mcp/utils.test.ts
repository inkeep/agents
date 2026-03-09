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

  describe('searchUsersByName', () => {
    let searchUsersByName: typeof import('../../../slack/mcp/utils').searchUsersByName;

    beforeAll(async () => {
      ({ searchUsersByName } = await import('../../../slack/mcp/utils'));
    });

    const users = [
      { id: 'U1', realName: 'Jane Smith', displayName: 'jsmith', name: 'jane.smith' },
      { id: 'U2', realName: 'John Doe', displayName: 'johnd', name: 'john.doe' },
      { id: 'U3', realName: 'Jane Doe', displayName: 'janed', name: 'jane.doe' },
      { id: 'U4', realName: 'Bob Johnson', displayName: 'bobby', name: 'bob.johnson' },
      { id: 'U5', realName: 'Alice Jane Williams', displayName: 'alice', name: 'alice.williams' },
    ];

    it('returns empty array for empty query', () => {
      expect(searchUsersByName(users, '')).toEqual([]);
      expect(searchUsersByName(users, '   ')).toEqual([]);
    });

    it('returns empty array when no users match', () => {
      expect(searchUsersByName(users, 'zzznotfound')).toEqual([]);
    });

    it('ranks exact matches highest', () => {
      const results = searchUsersByName(users, 'Jane Doe');
      expect(results[0].id).toBe('U3');
    });

    it('ranks prefix matches above substring matches', () => {
      const results = searchUsersByName(users, 'jane');
      const ids = results.map((u) => u.id);
      expect(ids).toContain('U1');
      expect(ids).toContain('U3');
      expect(ids.indexOf('U1')).toBeLessThan(ids.indexOf('U5'));
    });

    it('finds substring matches in any name field', () => {
      const results = searchUsersByName(users, 'bobby');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('U4');
    });

    it('is case-insensitive', () => {
      const results = searchUsersByName(users, 'JOHN DOE');
      expect(results[0].id).toBe('U2');
    });

    it('respects maxResults parameter', () => {
      const results = searchUsersByName(users, 'jane', 2);
      expect(results).toHaveLength(2);
    });

    it('defaults to 5 max results', () => {
      const manyUsers = Array.from({ length: 10 }, (_, i) => ({
        id: `U${i}`,
        realName: `Test User ${i}`,
        displayName: `test${i}`,
        name: `test.user${i}`,
      }));
      const results = searchUsersByName(manyUsers, 'test');
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('handles users with missing name fields', () => {
      const sparse = [
        { id: 'U1', realName: undefined, displayName: undefined, name: 'alice' },
        { id: 'U2', realName: 'Alice', displayName: undefined, name: undefined },
      ];
      const results = searchUsersByName(sparse, 'alice');
      expect(results).toHaveLength(2);
    });

    it('preserves extra properties on returned objects', () => {
      const extended = [{ id: 'U1', realName: 'Jane', displayName: 'j', name: 'j', email: 'jane@co.com' }];
      const results = searchUsersByName(extended, 'jane');
      expect(results[0]).toHaveProperty('email', 'jane@co.com');
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
