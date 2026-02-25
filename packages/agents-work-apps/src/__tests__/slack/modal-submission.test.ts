import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignSlackUserToken = vi.fn().mockResolvedValue('mock-jwt-token');
const mockExecuteAgentPublicly = vi.fn().mockResolvedValue(undefined);
const mockPostEphemeral = vi.fn().mockResolvedValue({ ok: true });
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' });
const mockFindWorkspaceConnectionByTeamId = vi.fn();
const mockFindCachedUserMapping = vi.fn();
const mockGetThreadContext = vi.fn().mockResolvedValue(null);

vi.mock('@inkeep/agents-core', () => ({
  signSlackUserToken: mockSignSlackUserToken,
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
    MODAL_SUBMISSION: 'slack.modal_submission',
  },
  SLACK_SPAN_KEYS: {
    TEAM_ID: 'slack.team_id',
    CHANNEL_ID: 'slack.channel_id',
    USER_ID: 'slack.user_id',
    TENANT_ID: 'slack.tenant_id',
    PROJECT_ID: 'slack.project_id',
    AGENT_ID: 'slack.agent_id',
    CONVERSATION_ID: 'slack.conversation_id',
    AUTHORIZED: 'slack.authorized',
    AUTH_SOURCE: 'slack.auth_source',
  },
}));

vi.mock('../../db/runDbClient', () => ({ default: {} }));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
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

vi.mock('../../slack/i18n', () => ({
  SlackStrings: {
    status: { thinking: vi.fn().mockReturnValue('Thinking...') },
  },
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    chat: { postEphemeral: mockPostEphemeral, postMessage: mockPostMessage },
  })),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: mockFindWorkspaceConnectionByTeamId,
}));

vi.mock('../../slack/services/events/execution', () => ({
  executeAgentPublicly: mockExecuteAgentPublicly,
}));

vi.mock('../../slack/services/events/utils', () => ({
  classifyError: vi.fn().mockReturnValue('unknown'),
  findCachedUserMapping: mockFindCachedUserMapping,
  generateSlackConversationId: vi.fn().mockReturnValue('conv-123'),
  getThreadContext: mockGetThreadContext,
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Something went wrong'),
}));

const linkedUser = {
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
};

const baseMetadata = {
  teamId: 'T789',
  channel: 'C456',
  slackUserId: 'U123',
  tenantId: 'default',
  messageTs: '1234.5678',
  isInThread: false,
  selectedAgentId: 'agent-1',
  selectedProjectId: 'proj-1',
};

function setupDefaults() {
  mockFindWorkspaceConnectionByTeamId.mockResolvedValue({
    connectionId: 'conn-1',
    teamId: 'T789',
    botToken: 'xoxb-123',
    tenantId: 'default',
  });
  mockFindCachedUserMapping.mockResolvedValue(linkedUser);
}

function buildView(metadata: Record<string, unknown>, question?: string) {
  return {
    private_metadata: JSON.stringify(metadata),
    state: {
      values: {
        question_block: { question_input: { value: question ?? 'Test question' } },
      },
    },
  };
}

describe('handleModalSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass slackAuthorized: false to signSlackUserToken', async () => {
    setupDefaults();

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(baseMetadata));

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: false,
      })
    );
    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.not.objectContaining({
        slackAuthSource: expect.anything(),
        slackChannelId: expect.anything(),
        slackAuthorizedProjectId: expect.anything(),
      })
    );
  });

  it('should set slack.authorized span attribute to false', async () => {
    setupDefaults();

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(baseMetadata));

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.authorized', false);
  });

  it('should call executeAgentPublicly at channel root for slash command modals', async () => {
    setupDefaults();

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(baseMetadata));

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        slackUserId: 'U123',
        teamId: 'T789',
        jwtToken: 'mock-jwt-token',
        projectId: 'proj-1',
        agentId: 'agent-1',
        question: 'Test question',
        conversationId: 'conv-123',
        threadTs: undefined,
      })
    );
  });

  it('should call executeAgentPublicly in thread for message shortcut modals', async () => {
    setupDefaults();

    const threadMetadata = {
      ...baseMetadata,
      isInThread: true,
      threadTs: '1111.2222',
      messageTs: '3333.4444',
    };

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(threadMetadata));

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTs: '1111.2222',
      })
    );
  });

  it('should use messageTs as threadTs fallback for in-thread submissions', async () => {
    setupDefaults();

    const threadMetadata = {
      ...baseMetadata,
      isInThread: true,
      messageTs: '3333.4444',
    };

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(threadMetadata));

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTs: '3333.4444',
      })
    );
  });

  it('should allow empty question (agents invoked without user message)', async () => {
    setupDefaults();

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(baseMetadata, ''));

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '',
      })
    );
  });

  it('should thread on messageTs for message shortcuts on main-channel messages', async () => {
    setupDefaults();

    const shortcutMetadata = {
      ...baseMetadata,
      isInThread: false,
      messageTs: '5555.6666',
      messageContext: 'what is PRD-4208 about?',
    };

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(shortcutMetadata));

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        threadTs: '5555.6666',
      })
    );
  });

  it('should include message context for message shortcuts', async () => {
    setupDefaults();

    const contextMetadata = {
      ...baseMetadata,
      isInThread: true,
      messageContext: 'Some context from the message',
    };

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(contextMetadata));

    expect(mockExecuteAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.stringContaining('Some context from the message'),
      })
    );
  });

  it('should post ephemeral link prompt when user not linked', async () => {
    mockFindWorkspaceConnectionByTeamId.mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
    });
    mockFindCachedUserMapping.mockResolvedValue(null);

    const { handleModalSubmission } = await import('../../slack/services/events/modal-submission');
    await handleModalSubmission(buildView(baseMetadata));

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        user: 'U123',
        text: expect.stringContaining('link'),
      })
    );
    expect(mockExecuteAgentPublicly).not.toHaveBeenCalled();
  });
});
