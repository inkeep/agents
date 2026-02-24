/**
 * Tests for handleModalSubmission — channel auth context
 *
 * Verifies that modal submissions:
 * - Pass slackAuthorized: false (manual selection = SpiceDB auth, no bypass)
 * - Set slack.authorized span attribute to false
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleModalSubmission } from '../../slack/services/events/modal-submission';

const mockPostEphemeral = vi.fn().mockResolvedValue({ ok: true });
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' });

vi.mock('@inkeep/agents-core', () => ({
  signSlackUserToken: vi.fn().mockResolvedValue('mock-jwt-token'),
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
    CALL_AGENT_API: 'slack.call_agent_api',
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
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/blocks', () => ({
  buildConversationResponseBlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../slack/services/events/utils', () => ({
  classifyError: vi.fn().mockReturnValue('unknown'),
  findCachedUserMapping: vi.fn(),
  generateSlackConversationId: vi.fn().mockReturnValue('conv-123'),
  getThreadContext: vi.fn().mockResolvedValue(null),
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Something went wrong'),
  markdownToMrkdwn: vi.fn((text: string) => text),
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
}));

const baseMetadata = {
  teamId: 'T789',
  channel: 'C456',
  slackUserId: 'U123',
  tenantId: 'default',
  messageTs: '1234.5678',
  selectedAgentId: 'agent-1',
  selectedProjectId: 'proj-1',
};

describe('handleModalSubmission — channel auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass slackAuthorized: false to signSlackUserToken', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
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

    await handleModalSubmission({
      private_metadata: JSON.stringify(baseMetadata),
      state: {
        values: {
          question_block: { question_input: { value: 'Test question' } },
        },
      },
    });

    expect(signSlackUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        slackAuthorized: false,
      })
    );
    expect(signSlackUserToken).toHaveBeenCalledWith(
      expect.not.objectContaining({
        slackAuthSource: expect.anything(),
        slackChannelId: expect.anything(),
        slackAuthorizedProjectId: expect.anything(),
      })
    );
  });

  it('should set slack.authorized span attribute to false', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    const { findCachedUserMapping } = await import('../../slack/services/events/utils');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T789',
      botToken: 'xoxb-123',
      tenantId: 'default',
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

    await handleModalSubmission({
      private_metadata: JSON.stringify(baseMetadata),
      state: {
        values: {
          question_block: { question_input: { value: 'Test question' } },
        },
      },
    });

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('slack.authorized', false);
  });
});
