/**
 * Tests for handleQuestionCommand — the default `/inkeep <question>` handler
 *
 * Specifically covers the grantAccessToMembers authorization path:
 * - grantAccessToMembers: true → slackAuthorized: true in JWT
 * - grantAccessToMembers: false → slackAuthorized: false in JWT
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignSlackUserToken = vi.fn().mockResolvedValue('mock-jwt-token');

vi.mock('@inkeep/agents-core', () => ({
  findWorkAppSlackUserMappingBySlackUser: vi.fn(() => vi.fn()),
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
  createJwtLinkMessage: vi.fn().mockReturnValue({ text: 'Link account' }),
  createContextBlock: vi.fn().mockReturnValue({ type: 'context' }),
  createNotLinkedMessage: vi.fn().mockReturnValue({ text: 'Not linked' }),
  createAlreadyLinkedMessage: vi.fn().mockReturnValue({ text: 'Already linked' }),
  createStatusMessage: vi.fn().mockReturnValue({ text: 'Status' }),
  createUnlinkSuccessMessage: vi.fn().mockReturnValue({ text: 'Unlinked' }),
  createUpdatedHelpMessage: vi.fn().mockReturnValue({ text: 'Help' }),
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(),
}));

vi.mock('../../slack/services/events/utils', () => ({
  fetchAgentsForProject: vi.fn(),
  fetchProjectsForTenant: vi.fn(),
  getChannelAgentConfig: vi.fn(),
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
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

describe('handleQuestionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch globally for the background agent call
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Agent response' } }],
        }),
      text: () => Promise.resolve('Agent response'),
    });
  });

  it('should pass slackAuthorized: true when grantAccessToMembers is true', async () => {
    const { findWorkAppSlackUserMappingBySlackUser } = await import('@inkeep/agents-core');
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

    vi.mocked(findWorkAppSlackUserMappingBySlackUser).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'map-1',
        tenantId: 'default',
        slackUserId: 'U123',
        slackTeamId: 'T789',
        inkeepUserId: 'user-1',
        clientId: 'work-apps-slack',
      })
    );
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: true,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(basePayload, 'What is Inkeep?', 'http://localhost:3000', 'default');

    // Wait for background execution
    await vi.waitFor(() => {
      expect(mockSignSlackUserToken).toHaveBeenCalled();
    });

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: true,
        slackAuthSource: 'channel',
        slackAuthorizedProjectId: 'proj-1',
      })
    );
  });

  it('should pass slackAuthorized: false when grantAccessToMembers is false', async () => {
    const { findWorkAppSlackUserMappingBySlackUser } = await import('@inkeep/agents-core');
    const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

    vi.mocked(findWorkAppSlackUserMappingBySlackUser).mockReturnValue(
      vi.fn().mockResolvedValue({
        id: 'map-1',
        tenantId: 'default',
        slackUserId: 'U123',
        slackTeamId: 'T789',
        inkeepUserId: 'user-1',
        clientId: 'work-apps-slack',
      })
    );
    vi.mocked(resolveEffectiveAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      source: 'channel',
      grantAccessToMembers: false,
    });

    const { handleQuestionCommand } = await import('../../slack/services/commands/index');
    await handleQuestionCommand(basePayload, 'What is Inkeep?', 'http://localhost:3000', 'default');

    // Wait for background execution
    await vi.waitFor(() => {
      expect(mockSignSlackUserToken).toHaveBeenCalled();
    });

    expect(mockSignSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: false,
        slackAuthSource: 'channel',
        slackAuthorizedProjectId: 'proj-1',
      })
    );
  });
});
