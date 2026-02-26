import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDirectMessage } from '../../slack/services/events/direct-message';

const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' });

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
    DIRECT_MESSAGE: 'slack.direct_message',
  },
  SLACK_SPAN_KEYS: {
    TEAM_ID: 'slack.team_id',
    CHANNEL_ID: 'slack.channel_id',
    USER_ID: 'slack.user_id',
    MESSAGE_TS: 'slack.message_ts',
    THREAD_TS: 'slack.thread_ts',
    TENANT_ID: 'slack.tenant_id',
    PROJECT_ID: 'slack.project_id',
    AGENT_ID: 'slack.agent_id',
    CONVERSATION_ID: 'slack.conversation_id',
  },
}));

vi.mock('../../db/runDbClient', () => ({ default: {} }));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
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

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    chat: { postMessage: mockPostMessage },
  })),
  getSlackUserInfo: vi.fn().mockResolvedValue({ tz: 'America/New_York' }),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/events/execution', () => ({
  executeAgentPublicly: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../slack/services/events/utils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    classifyError: vi.fn().mockReturnValue('unknown'),
    findCachedUserMapping: vi.fn(),
    generateSlackConversationId: vi.fn().mockReturnValue('slack-dm-T123-111.222-agent-1'),
    getThreadContext: vi.fn().mockResolvedValue('Thread context here'),
    getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Something went wrong'),
  };
});

vi.mock('../../slack/services/link-prompt', () => ({
  resolveUnlinkedUserAction: vi.fn().mockResolvedValue({
    type: 'jwt_link',
    url: 'http://localhost:3000/link?token=mock',
    expiresInMinutes: 10,
  }),
  buildLinkPromptMessage: vi.fn().mockReturnValue({
    text: "To get started, let's connect your Inkeep account with Slack.",
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Link prompt' } }],
  }),
}));

const baseParams = {
  slackUserId: 'U123',
  channel: 'D456',
  text: 'hello bot',
  messageTs: '111.222',
  teamId: 'T123',
};

describe('handleDirectMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should silently return when no bot token is available', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue(null);

    await handleDirectMessage(baseParams);

    const { executeAgentPublicly } = await import('../../slack/services/events/execution');
    expect(vi.mocked(executeAgentPublicly)).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('should post hint when no default agent configured', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: null,
    } as any);

    await handleDirectMessage(baseParams);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
        thread_ts: '111.222',
      })
    );
    expect(mockPostMessage.mock.calls[0][0].text).toContain('No agent is configured');

    const { executeAgentPublicly } = await import('../../slack/services/events/execution');
    expect(vi.mocked(executeAgentPublicly)).not.toHaveBeenCalled();
  });

  it('should post link prompt when user is not linked', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: { agentId: 'agent-1', projectId: 'proj-1', agentName: 'Test Agent' },
    } as any);

    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    vi.mocked(findCachedUserMapping).mockResolvedValue(null);

    await handleDirectMessage(baseParams);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
        thread_ts: '111.222',
        blocks: expect.any(Array),
      })
    );

    const { resolveUnlinkedUserAction } = await import('../../slack/services/link-prompt');
    expect(vi.mocked(resolveUnlinkedUserAction)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        teamId: 'T123',
        slackUserId: 'U123',
        intent: expect.objectContaining({ entryPoint: 'dm' }),
      })
    );

    const { executeAgentPublicly } = await import('../../slack/services/events/execution');
    expect(vi.mocked(executeAgentPublicly)).not.toHaveBeenCalled();
  });

  it('should execute agent publicly for linked user with default agent', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: { agentId: 'agent-1', projectId: 'proj-1', agentName: 'Test Agent' },
    } as any);

    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    vi.mocked(findCachedUserMapping).mockResolvedValue({
      inkeepUserId: 'inkeep-user-1',
      slackUserId: 'U123',
      tenantId: 'tenant-1',
    } as any);

    await handleDirectMessage(baseParams);

    const { executeAgentPublicly } = await import('../../slack/services/events/execution');
    expect(vi.mocked(executeAgentPublicly)).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
        threadTs: '111.222',
        slackUserId: 'U123',
        teamId: 'T123',
        projectId: 'proj-1',
        agentId: 'agent-1',
        agentName: 'Test Agent',
        question: 'hello bot',
        userTimezone: 'America/New_York',
      })
    );
  });

  it('should sign JWT with slackAuthorized: false for DMs', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: { agentId: 'agent-1', projectId: 'proj-1', agentName: 'Test Agent' },
    } as any);

    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    vi.mocked(findCachedUserMapping).mockResolvedValue({
      inkeepUserId: 'inkeep-user-1',
      slackUserId: 'U123',
      tenantId: 'tenant-1',
    } as any);

    await handleDirectMessage(baseParams);

    const { signSlackUserToken } = await import('@inkeep/agents-core');
    expect(vi.mocked(signSlackUserToken)).toHaveBeenCalledWith({
      inkeepUserId: 'inkeep-user-1',
      tenantId: 'tenant-1',
      slackTeamId: 'T123',
      slackUserId: 'U123',
      slackAuthorized: false,
    });
  });

  it('should use isDM: true for conversation ID generation', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: { agentId: 'agent-1', projectId: 'proj-1', agentName: 'Test Agent' },
    } as any);

    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    vi.mocked(findCachedUserMapping).mockResolvedValue({
      inkeepUserId: 'inkeep-user-1',
      slackUserId: 'U123',
      tenantId: 'tenant-1',
    } as any);

    await handleDirectMessage(baseParams);

    const { generateSlackConversationId } = await import('../../slack/services/events/utils');
    expect(vi.mocked(generateSlackConversationId)).toHaveBeenCalledWith({
      teamId: 'T123',
      messageTs: '111.222',
      agentId: 'agent-1',
      isDM: true,
    });
  });

  it('should fetch thread context for DM thread replies', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: { agentId: 'agent-1', projectId: 'proj-1', agentName: 'Test Agent' },
    } as any);

    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    vi.mocked(findCachedUserMapping).mockResolvedValue({
      inkeepUserId: 'inkeep-user-1',
      slackUserId: 'U123',
      tenantId: 'tenant-1',
    } as any);

    await handleDirectMessage({
      ...baseParams,
      threadTs: '100.200',
      messageTs: '333.444',
    });

    const { getThreadContext } = await import('../../slack/services/events/utils');
    expect(vi.mocked(getThreadContext)).toHaveBeenCalled();

    const { executeAgentPublicly } = await import('../../slack/services/events/execution');
    expect(vi.mocked(executeAgentPublicly)).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTs: '100.200',
        question: expect.stringContaining('slack_thread_context'),
      })
    );
  });

  it('should post error message on failure', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      botToken: 'xoxb-test',
      teamId: 'T123',
      tenantId: 'tenant-1',
      defaultAgent: { agentId: 'agent-1', projectId: 'proj-1', agentName: 'Test Agent' },
    } as any);

    const { findCachedUserMapping } = await import('../../slack/services/events/utils');
    vi.mocked(findCachedUserMapping).mockRejectedValue(new Error('DB error'));

    await handleDirectMessage(baseParams);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D456',
        thread_ts: '111.222',
        text: 'Something went wrong',
      })
    );
  });
});
