import type { SlackLinkIntent } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeSmartLinkIntent } from '../../slack/services/resume-intent';

const { mockSignSlackUserToken, mockInProcessFetch } = vi.hoisted(() => ({
  mockSignSlackUserToken: vi.fn().mockResolvedValue('mock-slack-user-token'),
  mockInProcessFetch: vi.fn(),
}));

vi.mock('@inkeep/agents-core', () => ({
  signSlackUserToken: mockSignSlackUserToken,
  getInProcessFetch: () => mockInProcessFetch,
}));

const mockPostMessage = vi.fn().mockResolvedValue({ ts: '1234567890.000001' });
const mockPostEphemeral = vi.fn().mockResolvedValue({});

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    chat: {
      postMessage: mockPostMessage,
      postEphemeral: mockPostEphemeral,
    },
  })),
  getSlackUserInfo: vi.fn().mockResolvedValue({ tz: 'America/New_York' }),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/agent-resolution', () => ({
  resolveEffectiveAgent: vi.fn(),
}));

vi.mock('../../slack/services/events/streaming', () => ({
  streamAgentResponse: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../slack/services/events/execution', () => ({
  executeAgentPublicly: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../slack/services/events/utils', () => ({
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
  generateSlackConversationId: vi.fn().mockReturnValue('mock-conversation-id'),
  escapeSlackMrkdwn: vi.fn((t: string) => t),
}));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');
const { streamAgentResponse } = await import('../../slack/services/events/streaming');
const { executeAgentPublicly } = await import('../../slack/services/events/execution');
const { sendResponseUrlMessage } = await import('../../slack/services/events/utils');

const baseParams = {
  teamId: 'T12345678',
  slackUserId: 'U87654321',
  inkeepUserId: 'user_123',
  tenantId: 'tenant_456',
};

describe('resumeSmartLinkIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn_1',
      teamId: 'T12345678',
      botToken: 'xoxb-mock-bot-token',
      tenantId: 'tenant_456',
    });
  });

  it('should handle mention entry point with streaming and channel auth', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent_123',
      projectId: 'project_456',
      agentName: 'Test Agent',
      source: 'channel',
      grantAccessToMembers: true,
    });

    const intent: SlackLinkIntent = {
      entryPoint: 'mention',
      question: 'What is the API rate limit?',
      channelId: 'C12345678',
      threadTs: '1234567890.123456',
      messageTs: '1234567890.123457',
      agentId: 'agent_123',
      projectId: 'project_456',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(findWorkspaceConnectionByTeamId).toHaveBeenCalledWith('T12345678');
    expect(resolveEffectiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_456',
        teamId: 'T12345678',
        channelId: 'C12345678',
      })
    );
    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'channel',
        slackChannelId: 'C12345678',
        slackAuthorizedProjectId: 'project_456',
      })
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C12345678',
        thread_ts: '1234567890.123456',
      })
    );
    expect(streamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C12345678',
        threadTs: '1234567890.123456',
        agentId: 'agent_123',
        projectId: 'project_456',
        question: 'What is the API rate limit?',
      })
    );
  });

  it('should handle question_command entry point with channel auth', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent_123',
      projectId: 'project_456',
      agentName: 'Test Agent',
      source: 'workspace',
      grantAccessToMembers: true,
    });

    mockInProcessFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'The rate limit is 100 req/min.' } }],
        }),
    });

    const intent: SlackLinkIntent = {
      entryPoint: 'question_command',
      question: 'What is the API rate limit?',
      channelId: 'C12345678',
      responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(resolveEffectiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_456',
        teamId: 'T12345678',
        channelId: 'C12345678',
      })
    );
    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'workspace',
        slackChannelId: 'C12345678',
        slackAuthorizedProjectId: 'project_456',
      })
    );
    expect(sendResponseUrlMessage).toHaveBeenCalledWith(
      'https://hooks.slack.com/commands/T123/456/abc',
      expect.objectContaining({
        text: 'The rate limit is 100 req/min.',
      })
    );
  });

  it('should not throw when bot token is missing', async () => {
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue(null);

    const intent: SlackLinkIntent = {
      entryPoint: 'mention',
      question: 'test',
      channelId: 'C12345678',
      messageTs: '1234567890.123457',
    };

    await expect(resumeSmartLinkIntent({ ...baseParams, intent })).resolves.not.toThrow();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('should post error when mention intent has no agentId', async () => {
    const intent: SlackLinkIntent = {
      entryPoint: 'mention',
      question: 'test',
      channelId: 'C12345678',
      messageTs: '1234567890.123457',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C12345678',
        user: 'U87654321',
      })
    );
    expect(streamAgentResponse).not.toHaveBeenCalled();
  });

  it('should post error when question_command agent not found', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue(null);

    const intent: SlackLinkIntent = {
      entryPoint: 'question_command',
      question: 'test',
      channelId: 'C12345678',
      responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("couldn't be found"),
      })
    );
  });

  it('should fall back to bot channel post when responseUrl fails', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent_123',
      projectId: 'project_456',
      agentName: 'Test Agent',
      source: 'workspace',
      grantAccessToMembers: true,
    });

    mockInProcessFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Response text' } }],
        }),
    });

    const { sendResponseUrlMessage: mockedSend } = await import(
      '../../slack/services/events/utils'
    );
    vi.mocked(mockedSend).mockRejectedValueOnce(new Error('response_url expired'));

    const intent: SlackLinkIntent = {
      entryPoint: 'question_command',
      question: 'test',
      channelId: 'C12345678',
      responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'workspace',
        slackChannelId: 'C12345678',
        slackAuthorizedProjectId: 'project_456',
      })
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C12345678',
        text: 'Response text',
      })
    );
  });

  it('should handle run_command entry point with agent lookup and channel auth', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent_found',
      projectId: 'proj_1',
      agentName: 'My Custom Agent',
      source: 'channel',
      grantAccessToMembers: true,
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'proj_1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'agent_found', name: 'My Custom Agent' }],
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    mockInProcessFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Run command response' } }],
        }),
    });

    const intent: SlackLinkIntent = {
      entryPoint: 'run_command',
      question: 'What is the API rate limit?',
      channelId: 'C12345678',
      responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
      agentIdentifier: 'My Custom Agent',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(resolveEffectiveAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_456',
        teamId: 'T12345678',
        channelId: 'C12345678',
      })
    );
    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'channel',
        slackChannelId: 'C12345678',
        slackAuthorizedProjectId: 'proj_1',
      })
    );
    expect(sendResponseUrlMessage).toHaveBeenCalledWith(
      'https://hooks.slack.com/commands/T123/456/abc',
      expect.objectContaining({
        text: 'Run command response',
      })
    );

    vi.unstubAllGlobals();
  });

  it('should handle dm entry point with executeAgentPublicly and no channel auth', async () => {
    const intent: SlackLinkIntent = {
      entryPoint: 'dm',
      question: 'How do I reset my password?',
      channelId: 'D99999999',
      messageTs: '1234567890.999999',
      agentId: 'agent_dm',
      projectId: 'project_dm',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: false,
      })
    );
    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.not.objectContaining({
        slackChannelId: expect.anything(),
        slackAuthSource: expect.anything(),
        slackAuthorizedProjectId: expect.anything(),
      })
    );
    expect(executeAgentPublicly).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D99999999',
        threadTs: '1234567890.999999',
        agentId: 'agent_dm',
        projectId: 'project_dm',
        question: 'How do I reset my password?',
      })
    );
    expect(streamAgentResponse).not.toHaveBeenCalled();
  });

  it('should post error when dm intent has no agentId', async () => {
    const intent: SlackLinkIntent = {
      entryPoint: 'dm',
      question: 'test',
      channelId: 'D99999999',
      messageTs: '1234567890.999999',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'D99999999',
        user: 'U87654321',
      })
    );
    expect(executeAgentPublicly).not.toHaveBeenCalled();
  });

  it('should post error when run_command agent identifier not found', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'other_agent',
      projectId: 'proj_1',
      source: 'workspace',
      grantAccessToMembers: false,
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'proj_1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const intent: SlackLinkIntent = {
      entryPoint: 'run_command',
      question: 'test',
      channelId: 'C12345678',
      responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
      agentIdentifier: 'nonexistent-agent',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(mockPostEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("couldn't be found"),
      })
    );

    vi.unstubAllGlobals();
  });
});
