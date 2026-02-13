/**
 * Tests for Slack event handler utilities
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getChannelAgentConfig,
  getThreadContext,
  getWorkspaceDefaultAgent,
  sendResponseUrlMessage,
} from '../../slack/services/events';

vi.mock('@inkeep/agents-core', () => ({
  findWorkAppSlackChannelAgentConfig: vi.fn(() => vi.fn()),
  findWorkAppSlackUserMapping: vi.fn(() => vi.fn()),
  generateInternalServiceToken: vi.fn().mockResolvedValue('mock-token'),
  InternalServices: { INKEEP_AGENTS_MANAGE_API: 'inkeep-agents-manage-api' },
}));

vi.mock('../../slack/tracer', () => {
  const mockSpan = {
    setAttribute: vi.fn(),
    updateName: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return {
    tracer: {
      startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) => fn(mockSpan)),
    },
    setSpanWithError: vi.fn(),
    SLACK_SPAN_NAMES: {
      WEBHOOK: 'slack.webhook',
      APP_MENTION: 'slack.app_mention',
      BLOCK_ACTION: 'slack.block_action',
      MODAL_SUBMISSION: 'slack.modal_submission',
      FOLLOW_UP_SUBMISSION: 'slack.follow_up_submission',
      MESSAGE_SHORTCUT: 'slack.message_shortcut',
      STREAM_AGENT_RESPONSE: 'slack.stream_agent_response',
      OPEN_AGENT_SELECTOR_MODAL: 'slack.open_agent_selector_modal',
      OPEN_FOLLOW_UP_MODAL: 'slack.open_follow_up_modal',
      PROJECT_SELECT_UPDATE: 'slack.project_select_update',
      CALL_AGENT_API: 'slack.call_agent_api',
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
    },
  };
});

vi.mock('../../db/runDbClient', () => ({
  default: {},
}));

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

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

describe('Event Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getThreadContext', () => {
    it('should return empty string when no messages', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockResolvedValue({ messages: [] }),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toBe('');
    });

    it('should format context from multiple messages', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockResolvedValue({
            messages: [
              { user: 'U123', text: 'First message' },
              { user: 'U456', text: 'Second message' },
              { user: 'U789', text: 'Current message' },
            ],
          }),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toContain('[Thread Start] U123: First message');
      expect(result).toContain('U456: Second message');
      // Last message is excluded (it's the current @mention)
      expect(result).not.toContain('Current message');
    });

    it('should include bot messages and label them correctly', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockResolvedValue({
            messages: [
              { user: 'U123', text: 'Question' },
              { bot_id: 'B123', text: 'Answer Powered by Agent' },
              { user: 'U123', text: 'Follow up' },
            ],
          }),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toContain('[Thread Start] U123: Question');
      expect(result).toContain('Inkeep Agent: Answer Powered by Agent');
    });

    it('should handle API errors gracefully', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockRejectedValue(new Error('API error')),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toBe('');
    });
  });

  describe('sendResponseUrlMessage', () => {
    it('should send POST request to response URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      await sendResponseUrlMessage('https://example.com/response', {
        text: 'Test message',
        response_type: 'ephemeral',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/response',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle fetch errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      await expect(
        sendResponseUrlMessage('https://example.com/response', { text: 'Test' })
      ).resolves.not.toThrow();
    });
  });
});

describe('getWorkspaceDefaultAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return workspace default when available', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T123',
      botToken: 'xoxb-123',
      tenantId: 'tenant-1',
      defaultAgent: {
        agentId: 'agent-1',
        agentName: 'Test Agent',
        projectId: 'proj-1',
        projectName: 'Test Project',
      },
    });

    const result = await getWorkspaceDefaultAgent('T123');
    expect(result?.agentId).toBe('agent-1');
  });

  it('should return null when no default configured', async () => {
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');
    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T123',
      botToken: 'xoxb-123',
      tenantId: 'tenant-1',
    });

    const result = await getWorkspaceDefaultAgent('T123');
    expect(result).toBeNull();
  });
});

describe('getChannelAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fall back to workspace default when no channel config', async () => {
    const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
    const { findWorkspaceConnectionByTeamId } = await import('../../slack/services/nango');

    vi.mocked(findWorkspaceConnectionByTeamId).mockResolvedValue({
      connectionId: 'conn-1',
      teamId: 'T123',
      botToken: 'xoxb-123',
      tenantId: 'tenant-1',
      defaultAgent: {
        agentId: 'workspace-agent',
        agentName: 'Workspace Agent',
        projectId: 'proj-1',
        projectName: 'Project',
      },
    });

    vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(vi.fn().mockResolvedValue(null));

    const result = await getChannelAgentConfig('T123', 'C456');
    expect(result?.agentId).toBe('workspace-agent');
  });
});
