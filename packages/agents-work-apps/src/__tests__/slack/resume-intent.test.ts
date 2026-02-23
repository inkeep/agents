import type { SlackLinkIntent } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeSmartLinkIntent } from '../../slack/services/resume-intent';

vi.mock('@inkeep/agents-core', () => ({
  signSlackUserToken: vi.fn().mockResolvedValue('mock-slack-user-token'),
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

vi.mock('../../slack/services/events/utils', () => ({
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
  generateSlackConversationId: vi.fn().mockReturnValue('mock-conversation-id'),
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

  it('should handle mention entry point with streaming', async () => {
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

  it('should handle question_command entry point', async () => {
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent_123',
      projectId: 'project_456',
      agentName: 'Test Agent',
      source: 'workspace',
      grantAccessToMembers: true,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'The rate limit is 100 req/min.' } }],
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

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
    expect(sendResponseUrlMessage).toHaveBeenCalledWith(
      'https://hooks.slack.com/commands/T123/456/abc',
      expect.objectContaining({
        text: 'The rate limit is 100 req/min.',
      })
    );

    vi.unstubAllGlobals();
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

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Response text' } }],
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

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

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C12345678',
        text: 'Response text',
      })
    );

    vi.unstubAllGlobals();
  });

  it('should handle run_command entry point with agent lookup', async () => {
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Run command response' } }],
          }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const intent: SlackLinkIntent = {
      entryPoint: 'run_command',
      question: 'What is the API rate limit?',
      channelId: 'C12345678',
      responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
      agentIdentifier: 'My Custom Agent',
    };

    await resumeSmartLinkIntent({ ...baseParams, intent });

    expect(sendResponseUrlMessage).toHaveBeenCalledWith(
      'https://hooks.slack.com/commands/T123/456/abc',
      expect.objectContaining({
        text: 'Run command response',
      })
    );

    vi.unstubAllGlobals();
  });

  it('should post error when run_command agent identifier not found', async () => {
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
