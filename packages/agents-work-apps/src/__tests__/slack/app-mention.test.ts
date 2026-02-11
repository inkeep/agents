/**
 * Tests for handleAppMention — the main @mention event handler
 *
 * Tests critical paths:
 * - No bot token → silent return
 * - No agent configured → ephemeral prompt to set up
 * - User not linked → ephemeral prompt to link
 * - Channel + no query → usage hint
 * - Channel + query → streams response
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAppMention } from '../../slack/services/events/app-mention';

const mockPostEphemeral = vi.fn().mockResolvedValue({ ok: true });
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' });
const mockChatStream = vi.fn().mockReturnValue({
  append: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
});

vi.mock('@inkeep/agents-core', () => ({
  signSlackUserToken: vi.fn().mockResolvedValue('mock-jwt-token'),
}));

vi.mock('../../db/runDbClient', () => ({ default: {} }));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    SLACK_BOT_TOKEN: undefined,
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../slack/i18n', () => ({
  SlackStrings: {
    usage: { mentionEmpty: 'Usage hint message' },
  },
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    chat: { postEphemeral: mockPostEphemeral, postMessage: mockPostMessage },
    chatStream: mockChatStream,
  })),
  postMessageInThread: vi.fn(),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/workspace-tokens', () => ({
  getBotTokenForTeam: vi.fn(),
}));

vi.mock('../../slack/services/events/streaming', () => ({
  streamAgentResponse: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../slack/services/events/utils', () => ({
  checkIfBotThread: vi.fn().mockResolvedValue(false),
  classifyError: vi.fn().mockReturnValue('unknown'),
  findCachedUserMapping: vi.fn(),
  generateSlackConversationId: vi.fn().mockReturnValue('conv-123'),
  getThreadContext: vi.fn().mockResolvedValue('Thread context here'),
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Something went wrong'),
  resolveChannelAgentConfig: vi.fn(),
}));

const baseParams = {
  slackUserId: 'U123',
  channel: 'C456',
  text: '',
  threadTs: '',
  messageTs: '1234.5678',
  teamId: 'T789',
};

describe('handleAppMention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return silently when no bot token is available', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { getBotTokenForTeam } = await import('../../slack/services/workspace-tokens');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue(null);
    vi.mocked(getBotTokenForTeam).mockReturnValue(null);

    await handleAppMention(baseParams);

    expect(mockPostEphemeral).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('should prompt to set up agents when no agent config found', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveChannelAgentConfig, findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveChannelAgentConfig).mockResolvedValue(null);
    vi.mocked(findCachedUserMapping).mockResolvedValue(null);

    await handleAppMention(baseParams);

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        user: 'U123',
        text: expect.stringContaining('No agents configured'),
      })
    );
  });

  it('should prompt to link account when user not linked', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveChannelAgentConfig, findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveChannelAgentConfig).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
    });
    vi.mocked(findCachedUserMapping).mockResolvedValue(null);

    await handleAppMention(baseParams);

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Link your account'),
      })
    );
  });

  it('should show usage hint for channel mention with no query', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveChannelAgentConfig, findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveChannelAgentConfig).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
    });
    vi.mocked(findCachedUserMapping).mockResolvedValue({
      id: 'map-1',
      tenantId: 'default',
      slackUserId: 'U123',
      slackTeamId: 'T789',
      slackEnterpriseId: null,
      inkeepUserId: 'user-1',
      clientId: 'work-apps-slack',
      slackUsername: null,
      slackEmail: null,
      linkedAt: '2026-01-01',
      lastUsedAt: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    await handleAppMention({ ...baseParams, text: '', threadTs: '' });

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Usage hint message',
      })
    );
  });

  it('should stream response for channel mention with query', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveChannelAgentConfig, findCachedUserMapping } = await import('../../slack/services/events/utils');
    const { streamAgentResponse } = await import('../../slack/services/events/streaming');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveChannelAgentConfig).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
    });
    vi.mocked(findCachedUserMapping).mockResolvedValue({
      id: 'map-1',
      tenantId: 'default',
      slackUserId: 'U123',
      slackTeamId: 'T789',
      slackEnterpriseId: null,
      inkeepUserId: 'user-1',
      clientId: 'work-apps-slack',
      slackUsername: null,
      slackEmail: null,
      linkedAt: '2026-01-01',
      lastUsedAt: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    await handleAppMention({ ...baseParams, text: 'What is Inkeep?' });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('preparing a response'),
      })
    );
    expect(streamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        question: 'What is Inkeep?',
      })
    );
  });
});
