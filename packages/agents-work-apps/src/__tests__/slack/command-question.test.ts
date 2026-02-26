import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignSlackUserToken = vi.fn().mockResolvedValue('mock-jwt-token');
const mockExecuteAgentPublicly = vi.fn().mockResolvedValue(undefined);
const mockGetSlackClient = vi.fn().mockReturnValue({ chat: { postMessage: vi.fn() } });
const mockFindWorkAppSlackUserMappingBySlackUser = vi.fn(() => vi.fn());

vi.mock('@inkeep/agents-core', () => ({
  findWorkAppSlackUserMappingBySlackUser: mockFindWorkAppSlackUserMappingBySlackUser,
  flushTraces: vi.fn().mockReturnValue(Promise.resolve()),
  getWaitUntil: vi.fn().mockResolvedValue(null),
  signSlackUserToken: mockSignSlackUserToken,
}));

vi.mock('../../db/runDbClient', () => ({ default: {} }));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
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
    usage: { mentionEmpty: 'Usage hint' },
  },
}));

vi.mock('../../slack/services/agent-resolution', () => ({
  resolveEffectiveAgent: vi.fn(),
}));

vi.mock('../../slack/services/blocks', () => ({
  createErrorMessage: vi.fn().mockReturnValue({ text: 'Error' }),
  createSmartLinkMessage: vi.fn().mockReturnValue({ text: 'Link account' }),
  createContextBlock: vi.fn().mockReturnValue({ type: 'context' }),
  createNotLinkedMessage: vi.fn().mockReturnValue({ text: 'Not linked' }),
  createAlreadyLinkedMessage: vi.fn().mockReturnValue({ text: 'Already linked' }),
  createStatusMessage: vi.fn().mockReturnValue({ text: 'Status' }),
  createUnlinkSuccessMessage: vi.fn().mockReturnValue({ text: 'Unlinked' }),
  createUpdatedHelpMessage: vi.fn().mockReturnValue({ text: 'Help' }),
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: mockGetSlackClient,
  getSlackUserInfo: vi.fn().mockResolvedValue({ tz: 'America/New_York' }),
}));

vi.mock('../../slack/services/events/execution', () => ({
  executeAgentPublicly: mockExecuteAgentPublicly,
}));

vi.mock('../../slack/services/events/utils', () => ({
  fetchAgentsForProject: vi.fn(),
  fetchProjectsForTenant: vi.fn(),
  generateSlackConversationId: vi.fn().mockReturnValue('slack-trigger-T789-123.456000-agent-1'),
  getChannelAgentConfig: vi.fn(),
}));

vi.mock('../../slack/services/link-prompt', () => ({
  resolveUnlinkedUserAction: vi.fn().mockResolvedValue({
    type: 'jwt_link',
    url: 'http://localhost:3000/link?token=test',
    expiresInMinutes: 10,
  }),
  buildLinkPromptMessage: vi.fn().mockReturnValue({ text: 'Link account', blocks: [] }),
}));

vi.mock('../../slack/services/modals', () => ({
  buildAgentSelectorModal: vi.fn(),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

const basePayload = {
  command: '/inkeep',
  text: 'What is Inkeep?',
  userId: 'U123',
  userName: 'testuser',
  teamId: 'T789',
  teamDomain: 'test',
  channelId: 'C456',
  channelName: 'general',
  responseUrl: 'https://hooks.slack.com/commands/T789/123/abc',
  triggerId: '123.456.abc',
};

const mockUserMapping = {
  id: 'map-1',
  tenantId: 'default',
  slackUserId: 'U123',
  slackTeamId: 'T789',
  inkeepUserId: 'user-1',
  clientId: 'work-apps-slack',
};

function setupLinkedUser() {
  mockFindWorkAppSlackUserMappingBySlackUser.mockReturnValue(
    vi.fn().mockResolvedValue(mockUserMapping)
  );
}

function setupUnlinkedUser() {
  mockFindWorkAppSlackUserMappingBySlackUser.mockReturnValue(vi.fn().mockResolvedValue(null));
}

describe('handleQuestionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass slackAuthorized: true when grantAccessToMembers is true', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: true,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'channel',
        slackAuthorizedProjectId: 'proj-1',
        slackChannelId: 'C456',
      })
    );
  });

  it('should pass slackAuthorized: false when grantAccessToMembers is false', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: false,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: false,
        slackAuthSource: 'channel',
        slackAuthorizedProjectId: 'proj-1',
      })
    );
  });

  it('should call executeAgentPublicly with correct params at channel root', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'workspace',
      grantAccessToMembers: true,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(mockGetSlackClient).toHaveBeenCalledWith('xoxb-mock-bot-token');
    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        slackUserId: 'U123',
        teamId: 'T789',
        jwtToken: 'mock-jwt-token',
        projectId: 'proj-1',
        agentId: 'agent-1',
        agentName: 'Test Agent',
        question: 'What is Inkeep?',
        conversationId: 'slack-trigger-T789-123.456000-agent-1',
      })
    );
    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.not.objectContaining({ threadTs: expect.anything() })
    );
  });

  it('should return empty object for Slack 3-second ack', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'workspace',
      grantAccessToMembers: false,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    const result = await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(result).toEqual({});
  });

  it('should return ephemeral error when no agent configured', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue(null);

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    const result = await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(result).toEqual({ response_type: 'ephemeral', text: 'Error' });
    expect(mockExecuteAgentPublicly).not.toHaveBeenCalled();
  });

  it('should prompt link when user is not linked', async () => {
    setupUnlinkedUser();

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    const result = await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(result).toEqual({ response_type: 'ephemeral', text: 'Link account', blocks: [] });
    expect(mockExecuteAgentPublicly).not.toHaveBeenCalled();
  });

  it('should use agentId as agentName fallback', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: '',
      projectId: 'proj-1',
      source: 'none',
      grantAccessToMembers: false,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'agent-1' })
    );
  });

  it('should omit slackAuthSource when agent source is none', async () => {
    setupLinkedUser();
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'none',
      grantAccessToMembers: false,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(
      basePayload,
      'What is Inkeep?',
      'http://localhost:3000',
      'default',
      'xoxb-mock-bot-token'
    );

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthSource: undefined,
      })
    );
  });
});
