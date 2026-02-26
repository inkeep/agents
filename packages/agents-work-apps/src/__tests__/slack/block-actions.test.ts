/**
 * Tests for handleToolApproval in block-actions.ts
 *
 * Tests critical paths:
 * - Ownership check: non-initiating user cannot approve
 * - Not-linked guard: user without linked account is rejected
 * - API failure: non-ok response sends ephemeral error
 * - Success: approval message is updated to done state
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFetch,
  mockSignSlackUserToken,
  mockFindWorkspaceConnectionByTeamId,
  mockFindCachedUserMapping,
  mockSendResponseUrlMessage,
  mockPostEphemeral,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockSignSlackUserToken: vi.fn(),
  mockFindWorkspaceConnectionByTeamId: vi.fn(),
  mockFindCachedUserMapping: vi.fn(),
  mockSendResponseUrlMessage: vi.fn(),
  mockPostEphemeral: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    getInProcessFetch: vi.fn(() => mockFetch),
    signSlackUserToken: mockSignSlackUserToken,
  };
});

vi.mock('../../env', () => ({
  env: { INKEEP_AGENTS_API_URL: 'http://localhost:3002' },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../slack/services/events/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../slack/services/events/utils')>();
  return {
    ...original,
    findCachedUserMapping: mockFindCachedUserMapping,
    sendResponseUrlMessage: mockSendResponseUrlMessage,
  };
});

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: mockFindWorkspaceConnectionByTeamId,
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    chat: {
      postEphemeral: mockPostEphemeral,
    },
  })),
  getSlackUserInfo: vi.fn().mockResolvedValue({ tz: 'America/New_York' }),
}));

import { handleToolApproval } from '../../slack/services/events/block-actions';

const INITIATING_USER = 'U-initiator';
const OTHER_USER = 'U-other';
const TEAM_ID = 'T-team';
const RESPONSE_URL = 'https://hooks.slack.com/response/123';

const buttonValue = JSON.stringify({
  toolCallId: 'tc-1',
  conversationId: 'conv-1',
  projectId: 'proj-1',
  agentId: 'agent-1',
  slackUserId: INITIATING_USER,
  channel: 'C-channel',
  threadTs: '1234.5678',
  toolName: 'search_web',
});

const workspaceConnection = {
  botToken: 'xoxb-bot-token',
  tenantId: 'tenant-1',
};

const userMapping = {
  inkeepUserId: 'inkeep-user-1',
};

describe('handleToolApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindWorkspaceConnectionByTeamId.mockResolvedValue(workspaceConnection);
    mockFindCachedUserMapping.mockResolvedValue(userMapping);
    mockSignSlackUserToken.mockResolvedValue('mock-jwt');
    mockSendResponseUrlMessage.mockResolvedValue(undefined);
    mockPostEphemeral.mockResolvedValue({ ok: true });
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  describe('ownership check', () => {
    it('should reject approval from a user who did not initiate the conversation', async () => {
      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: OTHER_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockPostEphemeral).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C-channel',
          user: OTHER_USER,
          text: expect.stringContaining('Only the user who started this conversation'),
        })
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send ephemeral rejection even when responseUrl is absent', async () => {
      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: OTHER_USER,
      });

      expect(mockPostEphemeral).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow approval from the initiating user', async () => {
      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: INITIATING_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('not-linked guard', () => {
    it('should send link prompt when user has no Inkeep account mapping', async () => {
      mockFindCachedUserMapping.mockResolvedValue(null);

      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: INITIATING_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockPostEphemeral).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C-channel',
          user: INITIATING_USER,
          text: expect.stringContaining('/inkeep link'),
        })
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API failure', () => {
    it('should send ephemeral error when approval API returns non-ok', async () => {
      mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: INITIATING_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockPostEphemeral).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C-channel',
          user: INITIATING_USER,
          text: expect.stringContaining('search_web'),
        })
      );
    });
  });

  describe('unexpected errors', () => {
    it('should send ephemeral error when an unexpected exception is thrown', async () => {
      mockFindWorkspaceConnectionByTeamId.mockRejectedValue(new Error('DB connection failed'));

      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: INITIATING_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockSendResponseUrlMessage).toHaveBeenCalledWith(
        RESPONSE_URL,
        expect.objectContaining({
          text: expect.stringContaining('Something went wrong'),
          response_type: 'ephemeral',
        })
      );
    });

    it('should not throw when Zod parse fails on malformed button value', async () => {
      await expect(
        handleToolApproval({
          actionValue: '{"invalid":"json"}',
          approved: true,
          teamId: TEAM_ID,
          slackUserId: INITIATING_USER,
          responseUrl: RESPONSE_URL,
        })
      ).resolves.toBeUndefined();

      expect(mockSendResponseUrlMessage).toHaveBeenCalledWith(
        RESPONSE_URL,
        expect.objectContaining({ response_type: 'ephemeral' })
      );
    });
  });

  describe('success', () => {
    it('should update the approval message to done state on success', async () => {
      await handleToolApproval({
        actionValue: buttonValue,
        approved: true,
        teamId: TEAM_ID,
        slackUserId: INITIATING_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockSendResponseUrlMessage).toHaveBeenCalledWith(
        RESPONSE_URL,
        expect.objectContaining({
          replace_original: true,
          blocks: expect.arrayContaining([expect.objectContaining({ type: 'context' })]),
        })
      );
    });

    it('should show denied status when approved is false', async () => {
      await handleToolApproval({
        actionValue: buttonValue,
        approved: false,
        teamId: TEAM_ID,
        slackUserId: INITIATING_USER,
        responseUrl: RESPONSE_URL,
      });

      expect(mockSendResponseUrlMessage).toHaveBeenCalledWith(
        RESPONSE_URL,
        expect.objectContaining({
          text: expect.stringContaining('❌'),
        })
      );
    });
  });
});
