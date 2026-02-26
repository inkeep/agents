/**
 * Tests for Slack Web API client wrapper
 *
 * Tests cover:
 * - WebClient instantiation
 * - User info retrieval
 * - Team info retrieval
 * - Channel listing (with cursor-based pagination)
 * - Channel membership checking (with cursor-based pagination)
 * - Message posting (channels and threads)
 */

import type { WebClient } from '@slack/web-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkUserIsChannelMember,
  getBotMemberChannels,
  getSlackChannelInfo,
  getSlackChannels,
  getSlackClient,
  getSlackTeamInfo,
  getSlackUserInfo,
  postMessage,
  postMessageInThread,
} from '../../slack/services/client';

const { mockWebClient } = vi.hoisted(() => {
  const mockWebClient = vi.fn().mockImplementation(() => ({
    users: {
      info: vi.fn(),
      conversations: vi.fn(),
    },
    team: {
      info: vi.fn(),
    },
    conversations: {
      list: vi.fn(),
      members: vi.fn(),
    },
    chat: {
      postMessage: vi.fn(),
    },
  }));

  return { mockWebClient };
});

vi.mock('@slack/web-api', () => {
  return {
    WebClient: mockWebClient,
  };
});

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Slack Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSlackClient', () => {
    it('should create a WebClient with the provided token', () => {
      const token = 'xoxb-test-token';

      const client = getSlackClient(token);

      expect(mockWebClient).toHaveBeenCalledWith(token);
      expect(client).toBeDefined();
    });

    it('should create different clients for different tokens', () => {
      const token1 = 'xoxb-token-1';
      const token2 = 'xoxb-token-2';

      getSlackClient(token1);
      getSlackClient(token2);

      expect(mockWebClient).toHaveBeenCalledWith(token1);
      expect(mockWebClient).toHaveBeenCalledWith(token2);
    });
  });

  describe('getSlackUserInfo', () => {
    it('should return user info when successful', async () => {
      const mockClient = {
        users: {
          info: vi.fn().mockResolvedValue({
            ok: true,
            user: {
              id: 'U123',
              name: 'testuser',
              real_name: 'Test User',
              profile: {
                display_name: 'Test Display',
                email: 'test@example.com',
                image_72: 'https://example.com/avatar.png',
              },
              is_admin: true,
              is_owner: false,
              tz: 'America/New_York',
              tz_offset: -18000,
            },
          }),
        },
      } as unknown as WebClient;

      const result = await getSlackUserInfo(mockClient, 'U123');

      expect(result).toEqual({
        id: 'U123',
        name: 'testuser',
        realName: 'Test User',
        displayName: 'Test Display',
        email: 'test@example.com',
        isAdmin: true,
        isOwner: false,
        avatar: 'https://example.com/avatar.png',
        tz: 'America/New_York',
        tzOffset: -18000,
      });
    });

    it('should return null when request fails', async () => {
      const mockClient = {
        users: {
          info: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await getSlackUserInfo(mockClient, 'U123');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const mockClient = {
        users: {
          info: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as unknown as WebClient;

      const result = await getSlackUserInfo(mockClient, 'U123');

      expect(result).toBeNull();
    });
  });

  describe('getSlackTeamInfo', () => {
    it('should return team info when successful', async () => {
      const mockClient = {
        team: {
          info: vi.fn().mockResolvedValue({
            ok: true,
            team: {
              id: 'T123',
              name: 'Test Team',
              domain: 'testteam',
              icon: { image_68: 'https://example.com/icon.png' },
              url: 'https://testteam.slack.com',
            },
          }),
        },
      } as unknown as WebClient;

      const result = await getSlackTeamInfo(mockClient);

      expect(result).toEqual({
        id: 'T123',
        name: 'Test Team',
        domain: 'testteam',
        icon: 'https://example.com/icon.png',
        url: 'https://testteam.slack.com',
      });
    });

    it('should return null when request fails', async () => {
      const mockClient = {
        team: {
          info: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await getSlackTeamInfo(mockClient);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const mockClient = {
        team: {
          info: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as unknown as WebClient;

      const result = await getSlackTeamInfo(mockClient);

      expect(result).toBeNull();
    });
  });

  describe('getSlackChannelInfo', () => {
    it('should return channel info when successful', async () => {
      const mockClient = {
        conversations: {
          info: vi.fn().mockResolvedValue({
            ok: true,
            channel: {
              id: 'C123',
              name: 'general',
              topic: { value: 'General discussion' },
              purpose: { value: 'Company-wide announcements' },
              is_private: false,
              is_shared: false,
              is_ext_shared: false,
              is_member: true,
            },
          }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannelInfo(mockClient, 'C123');

      expect(result).toEqual({
        id: 'C123',
        name: 'general',
        topic: 'General discussion',
        purpose: 'Company-wide announcements',
        isPrivate: false,
        isShared: false,
        isMember: true,
      });
      expect(mockClient.conversations.info).toHaveBeenCalledWith({ channel: 'C123' });
    });

    it('should handle private shared channels', async () => {
      const mockClient = {
        conversations: {
          info: vi.fn().mockResolvedValue({
            ok: true,
            channel: {
              id: 'C456',
              name: 'secret-collab',
              topic: { value: '' },
              purpose: { value: '' },
              is_private: true,
              is_shared: true,
              is_member: false,
            },
          }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannelInfo(mockClient, 'C456');

      expect(result).toEqual({
        id: 'C456',
        name: 'secret-collab',
        topic: '',
        purpose: '',
        isPrivate: true,
        isShared: true,
        isMember: false,
      });
    });

    it('should return null when request fails', async () => {
      const mockClient = {
        conversations: {
          info: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannelInfo(mockClient, 'C123');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const mockClient = {
        conversations: {
          info: vi.fn().mockRejectedValue(new Error('channel_not_found')),
        },
      } as unknown as WebClient;

      const result = await getSlackChannelInfo(mockClient, 'C999');

      expect(result).toBeNull();
    });
  });

  describe('getSlackChannels', () => {
    it('should return channel list with privacy info when successful', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({
            ok: true,
            channels: [
              { id: 'C123', name: 'general', num_members: 50, is_member: true, is_private: false },
              { id: 'C456', name: 'secret', num_members: 5, is_member: true, is_private: true },
              { id: 'C789', name: 'shared', num_members: 10, is_member: false, is_shared: true },
            ],
          }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient);

      expect(result).toEqual([
        {
          id: 'C123',
          name: 'general',
          memberCount: 50,
          isBotMember: true,
          isPrivate: false,
          isShared: false,
        },
        {
          id: 'C456',
          name: 'secret',
          memberCount: 5,
          isBotMember: true,
          isPrivate: true,
          isShared: false,
        },
        {
          id: 'C789',
          name: 'shared',
          memberCount: 10,
          isBotMember: false,
          isPrivate: false,
          isShared: true,
        },
      ]);
    });

    it('should fetch public and private channels with default limit of 200', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getSlackChannels(mockClient);

      expect(mockClient.conversations.list).toHaveBeenCalledWith({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
        cursor: undefined,
      });
    });

    it('should use custom limit when provided', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getSlackChannels(mockClient, 50);

      expect(mockClient.conversations.list).toHaveBeenCalledWith({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 50,
        cursor: undefined,
      });
    });

    it('should cap page size at 200 even with higher limit', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getSlackChannels(mockClient, 500);

      expect(mockClient.conversations.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 200 })
      );
    });

    it('should paginate through multiple pages using cursor', async () => {
      const mockClient = {
        conversations: {
          list: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C1', name: 'ch1', num_members: 1, is_member: true, is_private: false },
                { id: 'C2', name: 'ch2', num_members: 2, is_member: true, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page2' },
            })
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C3', name: 'ch3', num_members: 3, is_member: false, is_private: true },
              ],
              response_metadata: { next_cursor: '' },
            }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient, 200);

      expect(mockClient.conversations.list).toHaveBeenCalledTimes(2);
      expect(mockClient.conversations.list).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ cursor: undefined })
      );
      expect(mockClient.conversations.list).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: 'cursor_page2' })
      );
      expect(result).toHaveLength(3);
      expect(result.map((c) => c.id)).toEqual(['C1', 'C2', 'C3']);
    });

    it('should stop paginating once limit is reached', async () => {
      const mockClient = {
        conversations: {
          list: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C1', name: 'ch1', num_members: 1, is_member: true, is_private: false },
                { id: 'C2', name: 'ch2', num_members: 2, is_member: true, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page2' },
            })
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C3', name: 'ch3', num_members: 3, is_member: false, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page3' },
            }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient, 2);

      expect(mockClient.conversations.list).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('should trim results to exact limit when last page overshoots', async () => {
      const mockClient = {
        conversations: {
          list: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C1', name: 'ch1', num_members: 1, is_member: true, is_private: false },
                { id: 'C2', name: 'ch2', num_members: 2, is_member: true, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page2' },
            })
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C3', name: 'ch3', num_members: 3, is_member: false, is_private: false },
                { id: 'C4', name: 'ch4', num_members: 4, is_member: false, is_private: false },
              ],
              response_metadata: { next_cursor: '' },
            }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient, 3);

      expect(result).toHaveLength(3);
      expect(result.map((c) => c.id)).toEqual(['C1', 'C2', 'C3']);
    });

    it('should return partial results when ok: false occurs mid-pagination', async () => {
      const mockClient = {
        conversations: {
          list: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C1', name: 'ch1', num_members: 1, is_member: true, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page2' },
            })
            .mockResolvedValueOnce({
              ok: false,
              error: 'ratelimited',
              response_metadata: { next_cursor: '' },
            }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient, 200);

      expect(mockClient.conversations.list).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('C1');
    });

    it('should throw when error occurs mid-pagination', async () => {
      const mockClient = {
        conversations: {
          list: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C1', name: 'ch1', num_members: 1, is_member: true, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page2' },
            })
            .mockRejectedValueOnce(new Error('ratelimited')),
        },
      } as unknown as WebClient;

      await expect(getSlackChannels(mockClient, 200)).rejects.toThrow('ratelimited');
    });

    it('should return empty array when ok: false on first page', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient);

      expect(result).toEqual([]);
    });

    it('should throw on API error', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as unknown as WebClient;

      await expect(getSlackChannels(mockClient)).rejects.toThrow('API error');
    });
  });

  describe('getBotMemberChannels', () => {
    it('should return only bot-member channels using users.conversations', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockResolvedValue({
            ok: true,
            channels: [
              { id: 'C123', name: 'general', num_members: 50, is_private: false },
              { id: 'C456', name: 'secret', num_members: 5, is_private: true },
              { id: 'C789', name: 'shared', num_members: 10, is_private: false, is_shared: true },
            ],
          }),
        },
      } as unknown as WebClient;

      const result = await getBotMemberChannels(mockClient);

      expect(result).toEqual([
        { id: 'C123', name: 'general', memberCount: 50, isPrivate: false, isShared: false },
        { id: 'C456', name: 'secret', memberCount: 5, isPrivate: true, isShared: false },
        { id: 'C789', name: 'shared', memberCount: 10, isPrivate: false, isShared: true },
      ]);
    });

    it('should call users.conversations with correct default parameters', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getBotMemberChannels(mockClient);

      expect(mockClient.users.conversations).toHaveBeenCalledWith({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 999,
        cursor: undefined,
      });
    });

    it('should use custom limit when provided', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getBotMemberChannels(mockClient, 50);

      expect(mockClient.users.conversations).toHaveBeenCalledWith({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 50,
        cursor: undefined,
      });
    });

    it('should cap page size at 999 even with higher limit', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getBotMemberChannels(mockClient, 2000);

      expect(mockClient.users.conversations).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 999 })
      );
    });

    it('should paginate through multiple pages using cursor', async () => {
      const mockClient = {
        users: {
          conversations: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              channels: [
                { id: 'C1', name: 'ch1', num_members: 1, is_private: false },
                { id: 'C2', name: 'ch2', num_members: 2, is_private: false },
              ],
              response_metadata: { next_cursor: 'cursor_page2' },
            })
            .mockResolvedValueOnce({
              ok: true,
              channels: [{ id: 'C3', name: 'ch3', num_members: 3, is_private: true }],
              response_metadata: { next_cursor: '' },
            }),
        },
      } as unknown as WebClient;

      const result = await getBotMemberChannels(mockClient);

      expect(mockClient.users.conversations).toHaveBeenCalledTimes(2);
      expect(mockClient.users.conversations).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ cursor: undefined })
      );
      expect(mockClient.users.conversations).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: 'cursor_page2' })
      );
      expect(result).toHaveLength(3);
      expect(result.map((c) => c.id)).toEqual(['C1', 'C2', 'C3']);
    });

    it('should return empty array when ok: false on first page', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await getBotMemberChannels(mockClient);

      expect(result).toEqual([]);
    });

    it('should throw on API error', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as unknown as WebClient;

      await expect(getBotMemberChannels(mockClient)).rejects.toThrow('API error');
    });

    it('should not include isBotMember in returned objects', async () => {
      const mockClient = {
        users: {
          conversations: vi.fn().mockResolvedValue({
            ok: true,
            channels: [
              { id: 'C123', name: 'general', num_members: 50, is_private: false, is_member: true },
            ],
          }),
        },
      } as unknown as WebClient;

      const result = await getBotMemberChannels(mockClient);

      expect(result[0]).not.toHaveProperty('isBotMember');
      expect(result[0]).toEqual({
        id: 'C123',
        name: 'general',
        memberCount: 50,
        isPrivate: false,
        isShared: false,
      });
    });
  });

  describe('checkUserIsChannelMember', () => {
    it('should return true when user is found on first page', async () => {
      const mockClient = {
        conversations: {
          members: vi.fn().mockResolvedValue({
            ok: true,
            members: ['U001', 'U002', 'U003'],
            response_metadata: { next_cursor: '' },
          }),
        },
      } as unknown as WebClient;

      const result = await checkUserIsChannelMember(mockClient, 'C123', 'U002');

      expect(result).toBe(true);
      expect(mockClient.conversations.members).toHaveBeenCalledTimes(1);
    });

    it('should return false when user is not a member', async () => {
      const mockClient = {
        conversations: {
          members: vi.fn().mockResolvedValue({
            ok: true,
            members: ['U001', 'U002'],
            response_metadata: { next_cursor: '' },
          }),
        },
      } as unknown as WebClient;

      const result = await checkUserIsChannelMember(mockClient, 'C123', 'U999');

      expect(result).toBe(false);
    });

    it('should paginate to find user on later page', async () => {
      const mockClient = {
        conversations: {
          members: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              members: ['U001', 'U002'],
              response_metadata: { next_cursor: 'members_cursor2' },
            })
            .mockResolvedValueOnce({
              ok: true,
              members: ['U003', 'U004'],
              response_metadata: { next_cursor: '' },
            }),
        },
      } as unknown as WebClient;

      const result = await checkUserIsChannelMember(mockClient, 'C123', 'U004');

      expect(result).toBe(true);
      expect(mockClient.conversations.members).toHaveBeenCalledTimes(2);
      expect(mockClient.conversations.members).toHaveBeenNthCalledWith(1, {
        channel: 'C123',
        limit: 200,
        cursor: undefined,
      });
      expect(mockClient.conversations.members).toHaveBeenNthCalledWith(2, {
        channel: 'C123',
        limit: 200,
        cursor: 'members_cursor2',
      });
    });

    it('should return false when user not found after all pages', async () => {
      const mockClient = {
        conversations: {
          members: vi
            .fn()
            .mockResolvedValueOnce({
              ok: true,
              members: ['U001', 'U002'],
              response_metadata: { next_cursor: 'members_cursor2' },
            })
            .mockResolvedValueOnce({
              ok: true,
              members: ['U003'],
              response_metadata: { next_cursor: '' },
            }),
        },
      } as unknown as WebClient;

      const result = await checkUserIsChannelMember(mockClient, 'C123', 'U999');

      expect(result).toBe(false);
      expect(mockClient.conversations.members).toHaveBeenCalledTimes(2);
    });

    it('should return false when API returns ok: false', async () => {
      const mockClient = {
        conversations: {
          members: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await checkUserIsChannelMember(mockClient, 'C123', 'U001');

      expect(result).toBe(false);
    });

    it('should throw on API error', async () => {
      const mockClient = {
        conversations: {
          members: vi.fn().mockRejectedValue(new Error('channel_not_found')),
        },
      } as unknown as WebClient;

      await expect(checkUserIsChannelMember(mockClient, 'C123', 'U001')).rejects.toThrow(
        'channel_not_found'
      );
    });
  });

  describe('postMessage', () => {
    it('should post message without blocks', async () => {
      const mockResult = { ok: true, ts: '123.456' };
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue(mockResult),
        },
      } as unknown as WebClient;

      const result = await postMessage(mockClient, 'C123', 'Hello world');

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        text: 'Hello world',
      });
      expect(result).toEqual(mockResult);
    });

    it('should post message with blocks', async () => {
      const mockResult = { ok: true, ts: '123.456' };
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue(mockResult),
        },
      } as unknown as WebClient;
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }];

      const result = await postMessage(mockClient, 'C123', 'Hello world', blocks);

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        text: 'Hello world',
        blocks,
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw on error', async () => {
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockRejectedValue(new Error('channel_not_found')),
        },
      } as unknown as WebClient;

      await expect(postMessage(mockClient, 'C123', 'Hello')).rejects.toThrow('channel_not_found');
    });
  });

  describe('postMessageInThread', () => {
    it('should post message in thread without blocks', async () => {
      const mockResult = { ok: true, ts: '123.789' };
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue(mockResult),
        },
      } as unknown as WebClient;

      const result = await postMessageInThread(mockClient, 'C123', '123.456', 'Reply message');

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        text: 'Reply message',
        thread_ts: '123.456',
      });
      expect(result).toEqual(mockResult);
    });

    it('should post message in thread with blocks', async () => {
      const mockResult = { ok: true, ts: '123.789' };
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue(mockResult),
        },
      } as unknown as WebClient;
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Reply' } }];

      const result = await postMessageInThread(
        mockClient,
        'C123',
        '123.456',
        'Reply message',
        blocks
      );

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        text: 'Reply message',
        thread_ts: '123.456',
        blocks,
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw on error', async () => {
      const mockClient = {
        chat: {
          postMessage: vi.fn().mockRejectedValue(new Error('thread_not_found')),
        },
      } as unknown as WebClient;

      await expect(postMessageInThread(mockClient, 'C123', '123.456', 'Reply')).rejects.toThrow(
        'thread_not_found'
      );
    });
  });
});
