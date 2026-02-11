/**
 * Tests for Slack Web API client wrapper
 *
 * Tests cover:
 * - WebClient instantiation
 * - User info retrieval
 * - Team info retrieval
 * - Channel listing
 * - Message posting (channels and threads)
 */

import { WebClient } from '@slack/web-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSlackChannels,
  getSlackClient,
  getSlackTeamInfo,
  getSlackUserInfo,
  postMessage,
  postMessageInThread,
} from '../../slack/services/client';

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    users: {
      info: vi.fn(),
    },
    team: {
      info: vi.fn(),
    },
    conversations: {
      list: vi.fn(),
    },
    chat: {
      postMessage: vi.fn(),
    },
  })),
}));

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

      expect(WebClient).toHaveBeenCalledWith(token);
      expect(client).toBeDefined();
    });

    it('should create different clients for different tokens', () => {
      const token1 = 'xoxb-token-1';
      const token2 = 'xoxb-token-2';

      getSlackClient(token1);
      getSlackClient(token2);

      expect(WebClient).toHaveBeenCalledWith(token1);
      expect(WebClient).toHaveBeenCalledWith(token2);
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

    it('should fetch public and private channels with default limit', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
        },
      } as unknown as WebClient;

      await getSlackChannels(mockClient);

      expect(mockClient.conversations.list).toHaveBeenCalledWith({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 20,
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
      });
    });

    it('should return empty array when request fails', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockResolvedValue({ ok: false }),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient);

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      const mockClient = {
        conversations: {
          list: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as unknown as WebClient;

      const result = await getSlackChannels(mockClient);

      expect(result).toEqual([]);
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
