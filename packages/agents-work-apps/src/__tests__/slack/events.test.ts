/**
 * Tests for Slack event handler utilities
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractApiErrorMessage,
  generateSlackConversationId,
  getChannelAgentConfig,
  getThreadContext,
  sendResponseUrlMessage,
} from '../../slack/services/events';
import { formatAttachments } from '../../slack/services/events/utils';
import { getWorkspaceDefaultAgent } from '../../slack/services/nango';

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
      MESSAGE_SHORTCUT: 'slack.message_shortcut',
      STREAM_AGENT_RESPONSE: 'slack.stream_agent_response',
      OPEN_AGENT_SELECTOR_MODAL: 'slack.open_agent_selector_modal',
      PROJECT_SELECT_UPDATE: 'slack.project_select_update',
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

vi.mock('../../slack/services/nango', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../slack/services/nango')>();
  return {
    ...actual,
    findWorkspaceConnectionByTeamId: vi.fn(),
    getWorkspaceDefaultAgent: vi.fn(),
  };
});

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
      expect(result).toContain('[Thread Start] U123: """First message"""');
      expect(result).toContain('U456: """Second message"""');
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
      expect(result).toContain('[Thread Start] U123: """Question"""');
      expect(result).toContain('Inkeep Agent: """Answer Powered by Agent"""');
    });

    it('should resolve user names and build a user directory', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockResolvedValue({
            messages: [
              { user: 'U123', text: 'Hello' },
              { user: 'U456', text: 'World' },
              { user: 'U123', text: 'Follow up' },
            ],
          }),
        },
        users: {
          info: vi.fn().mockImplementation(({ user }: { user: string }) => {
            if (user === 'U123') {
              return Promise.resolve({
                user: {
                  real_name: 'Alice Smith',
                  profile: { display_name: 'alice', email: 'alice@example.com' },
                },
              });
            }
            return Promise.resolve({
              user: {
                real_name: 'Bob Jones',
                profile: { display_name: '', email: 'bob@example.com' },
              },
            });
          }),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toContain('Users in this thread');
      expect(result).toContain('U123');
      expect(result).toContain('"alice"');
      expect(result).toContain('"Alice Smith"');
      expect(result).toContain('alice@example.com');
      expect(result).toContain('U456');
      expect(result).toContain('"Bob Jones"');
      expect(result).toContain('bob@example.com');
    });

    it('should handle user info fetch failures gracefully', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockResolvedValue({
            messages: [
              { user: 'U123', text: 'Hello' },
              { user: 'U123', text: 'Follow up' },
            ],
          }),
        },
        users: {
          info: vi.fn().mockRejectedValue(new Error('User not found')),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toContain('U123: """Hello"""');
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

  describe('formatAttachments', () => {
    it('should return empty string for undefined attachments', () => {
      expect(formatAttachments(undefined)).toBe('');
    });

    it('should return empty string for empty array', () => {
      expect(formatAttachments([])).toBe('');
    });

    it('should format a shared/forwarded message', () => {
      const result = formatAttachments([
        {
          text: 'Original message content',
          author_name: 'Alice',
          channel_name: 'engineering',
          is_msg_unfurl: true,
        },
      ]);

      expect(result).toContain('[Shared message');
      expect(result).toContain('from Alice');
      expect(result).toContain('in #engineering');
      expect(result).toContain('Original message content');
    });

    it('should format a regular attachment using fallback text', () => {
      const result = formatAttachments([{ fallback: 'Fallback text' }]);

      expect(result).toContain('[Attachment]');
      expect(result).toContain('Fallback text');
    });

    it('should skip attachments with no text content', () => {
      const result = formatAttachments([{ author_name: 'Alice' }, { text: 'Has content' }]);

      expect(result).not.toContain('Alice');
      expect(result).toContain('Has content');
    });

    it('should format multiple attachments', () => {
      const result = formatAttachments([
        { text: 'First message', is_msg_unfurl: true, author_name: 'Alice' },
        { text: 'Second message', author_name: 'Bob' },
      ]);

      expect(result).toContain('First message');
      expect(result).toContain('Second message');
    });

    it('should include attachment fields', () => {
      const result = formatAttachments([
        {
          text: 'Status update',
          fields: [
            { title: 'Priority', value: 'High' },
            { title: 'Status', value: 'Open' },
          ],
        },
      ]);

      expect(result).toContain('Priority: High');
      expect(result).toContain('Status: Open');
    });

    it('should fall back to channel_id when channel_name is missing', () => {
      const result = formatAttachments([
        {
          text: 'Message from private channel',
          channel_id: 'C08QXR5CWBH',
          is_msg_unfurl: true,
        },
      ]);

      expect(result).toContain('in channel C08QXR5CWBH');
    });

    it('should treat is_share the same as is_msg_unfurl', () => {
      const result = formatAttachments([
        {
          text: 'Shared via is_share flag',
          is_share: true,
          author_name: 'Alice',
        },
      ]);

      expect(result).toContain('[Shared message');
      expect(result).not.toContain('[Attachment]');
    });

    it('should include from_url as source reference', () => {
      const result = formatAttachments([
        {
          text: 'Some message',
          from_url: 'https://inkeep.slack.com/archives/C08QXR5CWBH/p1771959233866159',
          is_msg_unfurl: true,
        },
      ]);

      expect(result).toContain(
        '[Source: https://inkeep.slack.com/archives/C08QXR5CWBH/p1771959233866159]'
      );
    });

    it('should wrap content in backtick delimiters', () => {
      const result = formatAttachments([{ text: 'The actual content', is_msg_unfurl: true }]);

      expect(result).toContain('```');
      expect(result).toContain('```\nThe actual content\n```');
    });

    it('should handle real Slack forwarded message payload', () => {
      const result = formatAttachments([
        {
          is_msg_unfurl: true,
          is_share: true,
          text: '<@U084MCXMN2Y> link to PR with auth propagation work so far: <https://github.com/inkeep/agents/pull/2291>',
          fallback:
            '[February 24th, 2026 1:53 PM] andrew: <@U084MCXMN2Y> link to PR with auth propagation work so far: <https://github.com/inkeep/agents/pull/2291>',
          author_name: 'Andrew Mikofalvy',
          author_id: 'U06T51TJQ8G',
          channel_id: 'C08QXR5CWBH',
          from_url: 'https://inkeep.slack.com/archives/C08QXR5CWBH/p1771959233866159',
        },
      ]);

      expect(result).toContain('[Shared message (from Andrew Mikofalvy, in channel C08QXR5CWBH)]');
      expect(result).toContain('https://github.com/inkeep/agents/pull/2291');
      expect(result).toContain(
        '[Source: https://inkeep.slack.com/archives/C08QXR5CWBH/p1771959233866159]'
      );
    });
  });

  describe('getThreadContext with attachments', () => {
    it('should include attachment content in thread messages', async () => {
      const mockClient = {
        conversations: {
          replies: vi.fn().mockResolvedValue({
            messages: [
              {
                user: 'U123',
                text: 'Check out this message',
                attachments: [
                  {
                    text: 'Forwarded content from another channel',
                    is_msg_unfurl: true,
                    author_name: 'Alice',
                    channel_name: 'general',
                  },
                ],
              },
              { user: 'U456', text: 'Current message' },
            ],
          }),
        },
      };

      const result = await getThreadContext(mockClient, 'C123', '1234.5678');
      expect(result).toContain('Check out this message');
      expect(result).toContain('Forwarded content from another channel');
      expect(result).toContain('[Shared message');
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
    const nango = await import('../../slack/services/nango');
    vi.mocked(nango.getWorkspaceDefaultAgent).mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      projectId: 'proj-1',
      projectName: 'Test Project',
    });

    const result = await getWorkspaceDefaultAgent('T123');
    expect(result?.agentId).toBe('agent-1');
  });

  it('should return null when no default configured', async () => {
    const nango = await import('../../slack/services/nango');
    vi.mocked(nango.getWorkspaceDefaultAgent).mockResolvedValue(null);

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

describe('generateSlackConversationId', () => {
  it('should generate trigger format with agentId', () => {
    const result = generateSlackConversationId({
      teamId: 'T123',
      messageTs: '1234.5678',
      agentId: 'agent-1',
    });
    expect(result).toBe('slack-trigger-T123-1234.5678-agent-1');
  });

  it('should generate trigger format without agentId', () => {
    const result = generateSlackConversationId({
      teamId: 'T123',
      messageTs: '1234.5678',
    });
    expect(result).toBe('slack-trigger-T123-1234.5678');
  });

  it('should generate DM format with agentId', () => {
    const result = generateSlackConversationId({
      teamId: 'T123',
      messageTs: '9999.0001',
      isDM: true,
      agentId: 'dm-agent',
    });
    expect(result).toBe('slack-dm-T123-9999.0001-dm-agent');
  });

  it('should generate DM format without agentId', () => {
    const result = generateSlackConversationId({
      teamId: 'T123',
      messageTs: '9999.0001',
      isDM: true,
    });
    expect(result).toBe('slack-dm-T123-9999.0001');
  });

  it('should produce unique IDs for different messageTs values', () => {
    const id1 = generateSlackConversationId({ teamId: 'T1', messageTs: '1.1', agentId: 'a1' });
    const id2 = generateSlackConversationId({ teamId: 'T1', messageTs: '1.2', agentId: 'a1' });
    expect(id1).not.toBe(id2);
  });
});

describe('extractApiErrorMessage', () => {
  it('should extract message from valid JSON body', () => {
    const body = JSON.stringify({ message: 'Access denied: insufficient permissions' });
    expect(extractApiErrorMessage(body)).toBe('Access denied: insufficient permissions');
  });

  it('should return null for JSON without message field', () => {
    const body = JSON.stringify({ error: 'something went wrong' });
    expect(extractApiErrorMessage(body)).toBeNull();
  });

  it('should return null for empty message string', () => {
    const body = JSON.stringify({ message: '' });
    expect(extractApiErrorMessage(body)).toBeNull();
  });

  it('should return null for non-string message', () => {
    const body = JSON.stringify({ message: 42 });
    expect(extractApiErrorMessage(body)).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(extractApiErrorMessage('not json')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractApiErrorMessage('')).toBeNull();
  });
});
