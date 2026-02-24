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
  signSlackLinkToken: vi.fn().mockResolvedValue('mock-link-token'),
}));

const mockSpan = {
  setAttribute: vi.fn(),
  updateName: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

vi.mock('../../slack/tracer', () => ({
  tracer: {
    startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) => fn(mockSpan)),
  },
  setSpanWithError: vi.fn(),
  SLACK_SPAN_NAMES: {
    WEBHOOK: 'slack.webhook',
    APP_MENTION: 'slack.app_mention',
    STREAM_AGENT_RESPONSE: 'slack.stream_agent_response',
  },
  SLACK_SPAN_KEYS: {
    TEAM_ID: 'slack.team_id',
    CHANNEL_ID: 'slack.channel_id',
    USER_ID: 'slack.user_id',
    EVENT_TYPE: 'slack.event_type',
    INNER_EVENT_TYPE: 'slack.inner_event_type',
    TENANT_ID: 'slack.tenant_id',
    PROJECT_ID: 'slack.project_id',
    AGENT_ID: 'slack.agent_id',
    CONVERSATION_ID: 'slack.conversation_id',
    OUTCOME: 'slack.outcome',
    IS_BOT_MESSAGE: 'slack.is_bot_message',
    HAS_QUERY: 'slack.has_query',
    IS_IN_THREAD: 'slack.is_in_thread',
    THREAD_TS: 'slack.thread_ts',
    MESSAGE_TS: 'slack.message_ts',
    CALLBACK_ID: 'slack.callback_id',
    ACTION_IDS: 'slack.action_ids',
    AUTHORIZED: 'slack.authorized',
    AUTH_SOURCE: 'slack.auth_source',
  },
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
    status: {
      thinking: (name: string) => `${name} is thinking...`,
      readingThread: (name: string) => `${name} is reading this thread...`,
    },
  },
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    chat: { postEphemeral: mockPostEphemeral, postMessage: mockPostMessage },
    chatStream: mockChatStream,
  })),
  getSlackChannelInfo: vi.fn().mockResolvedValue(null),
  getSlackUserInfo: vi.fn().mockResolvedValue(null),
  postMessageInThread: vi.fn(),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/events/streaming', () => ({
  streamAgentResponse: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../slack/services/events/utils', () => ({
  checkIfBotThread: vi.fn().mockResolvedValue(false),
  classifyError: vi.fn().mockReturnValue('unknown'),
  findCachedUserMapping: vi.fn(),
  formatChannelLabel: vi.fn().mockReturnValue(''),
  formatChannelContext: vi.fn().mockReturnValue('Slack'),
  generateSlackConversationId: vi.fn().mockReturnValue('conv-123'),
  getThreadContext: vi.fn().mockResolvedValue('Thread context here'),
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Something went wrong'),
  timedOp: vi.fn().mockImplementation(async (operation: Promise<unknown>) => ({
    result: await operation,
    durationMs: 0,
  })),
}));

vi.mock('../../slack/services/agent-resolution', () => ({
  resolveEffectiveAgent: vi.fn(),
}));

vi.mock('../../slack/services/link-prompt', () => ({
  resolveUnlinkedUserAction: vi.fn().mockResolvedValue({
    type: 'jwt_link',
    url: 'http://localhost:3000/link?token=mock',
    expiresInMinutes: 10,
  }),
  buildLinkPromptMessage: vi.fn().mockReturnValue({
    text: "To get started, let's connect your Inkeep account with Slack.",
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "To get started, let's connect your Inkeep account with Slack.",
        },
      },
    ],
  }),
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

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue(null);

    await handleAppMention(baseParams);

    expect(mockPostEphemeral).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('should prompt to set up agents when no agent config found', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveEffectiveAgent).mockResolvedValue(null);
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
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: true,
    });
    vi.mocked(findCachedUserMapping).mockResolvedValue(null);

    await handleAppMention(baseParams);

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('connect your Inkeep account'),
      })
    );
  });

  it('should show usage hint for channel mention with no query', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: true,
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
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    const { streamAgentResponse } = await import('../../slack/services/events/streaming');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: true,
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

    const { signSlackUserToken } = await import('@inkeep/agents-core');

    await handleAppMention({ ...baseParams, text: 'What is Inkeep?' });

    expect(signSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'channel',
        slackChannelId: 'C456',
        slackAuthorizedProjectId: 'proj-1',
      })
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('is thinking'),
      })
    );
    expect(streamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        question: expect.stringContaining('What is Inkeep?'),
      })
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.authorized', true);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.auth_source', 'channel');
  });

  it('should set workspace auth source span attribute when agent resolved from workspace', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'workspace',
      grantAccessToMembers: true,
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

    const { signSlackUserToken } = await import('@inkeep/agents-core');

    await handleAppMention({ ...baseParams, text: 'Hello' });

    expect(signSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'workspace',
      })
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.authorized', true);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.auth_source', 'workspace');
  });

  it('should set slackAuthorized false when grantAccessToMembers is false', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: false,
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

    const { signSlackUserToken } = await import('@inkeep/agents-core');

    await handleAppMention({ ...baseParams, text: 'What is Inkeep?' });

    expect(signSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: false,
        slackAuthSource: 'channel',
        slackAuthorizedProjectId: 'proj-1',
      })
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.authorized', false);
  });
});
