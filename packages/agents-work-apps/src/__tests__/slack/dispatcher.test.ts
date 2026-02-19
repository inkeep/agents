import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchSlackEvent } from '../../slack/dispatcher';

vi.mock('@inkeep/agents-core', () => ({
  flushTraces: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../slack/tracer', () => ({
  SLACK_SPAN_KEYS: {
    TEAM_ID: 'slack.team_id',
    CHANNEL_ID: 'slack.channel_id',
    USER_ID: 'slack.user_id',
    EVENT_TYPE: 'slack.event_type',
    INNER_EVENT_TYPE: 'slack.inner_event_type',
    CALLBACK_ID: 'slack.callback_id',
    ACTION_IDS: 'slack.action_ids',
    THREAD_TS: 'slack.thread_ts',
    MESSAGE_TS: 'slack.message_ts',
    OUTCOME: 'slack.outcome',
    IS_BOT_MESSAGE: 'slack.is_bot_message',
    HAS_QUERY: 'slack.has_query',
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

vi.mock('../../db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

vi.mock('../../slack/services/events', () => ({
  handleAppMention: vi.fn().mockResolvedValue(undefined),
  handleFollowUpSubmission: vi.fn().mockResolvedValue(undefined),
  handleMessageShortcut: vi.fn().mockResolvedValue(undefined),
  handleModalSubmission: vi.fn().mockResolvedValue(undefined),
  handleOpenAgentSelectorModal: vi.fn().mockResolvedValue(undefined),
  handleOpenFollowUpModal: vi.fn().mockResolvedValue(undefined),
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../slack/services', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
  getSlackClient: vi.fn(),
  handleCommand: vi.fn(),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

function createMockSpan() {
  return {
    setAttribute: vi.fn(),
    updateName: vi.fn(),
  };
}

function createMockOptions() {
  return {
    registerBackgroundWork: vi.fn(),
  };
}

describe('dispatchSlackEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('event_callback', () => {
    it('should ignore bot messages', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'event_callback',
        {
          team_id: 'T123',
          event: { type: 'app_mention', bot_id: 'B123', channel: 'C123', user: 'U123' },
        },
        options,
        span
      );

      expect(result.outcome).toBe('ignored_bot_message');
      expect(options.registerBackgroundWork).not.toHaveBeenCalled();
    });

    it('should handle app_mention events', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'event_callback',
        {
          team_id: 'T123',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C123',
            text: '<@U456> hello',
            ts: '123.456',
          },
        },
        options,
        span
      );

      expect(result.outcome).toBe('handled');
      expect(options.registerBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it('should register background work even when handleAppMention rejects', async () => {
      const { handleAppMention } = await import('../../slack/services/events');
      vi.mocked(handleAppMention).mockRejectedValueOnce(new Error('mention failed'));

      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'event_callback',
        {
          team_id: 'T123',
          event: {
            type: 'app_mention',
            user: 'U123',
            channel: 'C123',
            text: '<@U456> hello',
            ts: '123.456',
          },
        },
        options,
        span
      );

      expect(result.outcome).toBe('handled');
      expect(options.registerBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it('should ignore unknown inner event types', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'event_callback',
        {
          team_id: 'T123',
          event: { type: 'message', user: 'U123', channel: 'C123' },
        },
        options,
        span
      );

      expect(result.outcome).toBe('ignored_unknown_event');
    });
  });

  describe('view_submission', () => {
    it('should return validation error when no agent selected', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'view_submission',
        {
          view: {
            callback_id: 'agent_selector_modal',
            state: {
              values: {
                agent_select_block: {
                  agent_select: { selected_option: { value: 'none' } },
                },
              },
            },
          },
        },
        options,
        span
      );

      expect(result.outcome).toBe('validation_error');
      expect(result.response).toEqual({
        response_action: 'errors',
        errors: {
          agent_select_block:
            'Please select an agent. If none are available, add agents to this project in the dashboard.',
        },
      });
    });

    it('should handle agent_selector_modal submission', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'view_submission',
        {
          view: {
            callback_id: 'agent_selector_modal',
            private_metadata: '{}',
            state: {
              values: {
                agent_select_block: {
                  agent_select: { selected_option: { value: 'agent-1' } },
                },
              },
            },
          },
        },
        options,
        span
      );

      expect(result.outcome).toBe('handled');
      expect(options.registerBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it('should handle follow_up_modal submission', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'view_submission',
        {
          view: {
            callback_id: 'follow_up_modal',
            private_metadata: '{}',
            state: { values: {} },
          },
        },
        options,
        span
      );

      expect(result.outcome).toBe('handled');
      expect(options.registerBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it('should ignore unknown view_submission callback_ids', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'view_submission',
        { view: { callback_id: 'unknown_modal' } },
        options,
        span
      );

      expect(result.outcome).toBe('ignored_unknown_event');
    });
  });

  describe('message_action', () => {
    it('should handle ask_agent_shortcut', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'message_action',
        {
          callback_id: 'ask_agent_shortcut',
          trigger_id: 'trig123',
          team: { id: 'T123' },
          channel: { id: 'C123' },
          user: { id: 'U123' },
          message: { ts: '123.456', text: 'hello' },
        },
        options,
        span
      );

      expect(result.outcome).toBe('handled');
      expect(options.registerBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it('should ignore unknown message_action callback_ids', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'message_action',
        { callback_id: 'unknown_shortcut' },
        options,
        span
      );

      expect(result.outcome).toBe('ignored_unknown_event');
    });
  });

  describe('block_actions', () => {
    it('should handle open_agent_selector_modal action', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'block_actions',
        {
          team: { id: 'T123' },
          trigger_id: 'trig123',
          actions: [{ action_id: 'open_agent_selector_modal', value: 'some-value' }],
        },
        options,
        span
      );

      expect(result.outcome).toBe('handled');
      expect(options.registerBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it('should return ignored_no_action_match for unmatched actions', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent(
        'block_actions',
        {
          team: { id: 'T123' },
          actions: [{ action_id: 'some_random_action' }],
        },
        options,
        span
      );

      expect(result.outcome).toBe('ignored_no_action_match');
    });
  });

  describe('unknown event types', () => {
    it('should return ignored_unknown_event for unhandled types', async () => {
      const span = createMockSpan();
      const options = createMockOptions();

      const result = await dispatchSlackEvent('some_unknown_type', {}, options, span);

      expect(result.outcome).toBe('ignored_unknown_event');
    });
  });
});
