import { describe, expect, it } from 'vitest';
import {
  AppMentionInnerSchema,
  BlockActionsEventSchema,
  EventCallbackSchema,
  InteractiveMessageEventSchema,
  KnownInnerEventSchema,
  MessageActionEventSchema,
  SlackActionSchema,
  SlackChannelSchema,
  SlackEventSchema,
  SlackMessageSchema,
  SlackTeamSchema,
  SlackUserSchema,
  SlackViewSchema,
  UrlVerificationEventSchema,
  ViewSubmissionEventSchema,
} from '../../slack/services/slack-event-schemas';

describe('Slack event schemas', () => {
  describe('sub-schemas', () => {
    it('SlackTeamSchema validates with optional id', () => {
      expect(SlackTeamSchema.safeParse({}).success).toBe(true);
      expect(SlackTeamSchema.safeParse({ id: 'T123' }).success).toBe(true);
    });

    it('SlackChannelSchema validates with optional id', () => {
      expect(SlackChannelSchema.safeParse({}).success).toBe(true);
      expect(SlackChannelSchema.safeParse({ id: 'C123' }).success).toBe(true);
    });

    it('SlackUserSchema validates with optional id', () => {
      expect(SlackUserSchema.safeParse({}).success).toBe(true);
      expect(SlackUserSchema.safeParse({ id: 'U123' }).success).toBe(true);
    });

    it('SlackMessageSchema validates with partial fields', () => {
      expect(SlackMessageSchema.safeParse({}).success).toBe(true);
      expect(
        SlackMessageSchema.safeParse({ ts: '123.456', text: 'hello', thread_ts: '100.000' })
          .success
      ).toBe(true);
    });

    it('SlackActionSchema requires action_id', () => {
      expect(SlackActionSchema.safeParse({}).success).toBe(false);
      expect(SlackActionSchema.safeParse({ action_id: 'btn_click' }).success).toBe(true);
      expect(
        SlackActionSchema.safeParse({
          action_id: 'select',
          value: 'v1',
          selected_option: { value: 'opt1' },
        }).success
      ).toBe(true);
    });

    it('SlackViewSchema validates with partial fields', () => {
      expect(SlackViewSchema.safeParse({}).success).toBe(true);
      expect(
        SlackViewSchema.safeParse({
          id: 'V123',
          callback_id: 'my_modal',
          private_metadata: '{}',
          state: { values: { block1: { action1: { type: 'static_select' } } } },
        }).success
      ).toBe(true);
    });
  });

  describe('top-level discriminated union', () => {
    it('parses url_verification', () => {
      const result = SlackEventSchema.safeParse({
        type: 'url_verification',
        challenge: 'test-challenge',
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'url_verification') {
        expect(result.data.challenge).toBe('test-challenge');
      }
    });

    it('parses event_callback', () => {
      const result = SlackEventSchema.safeParse({
        type: 'event_callback',
        team_id: 'T123',
        event: { type: 'app_mention', user: 'U1', channel: 'C1' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('event_callback');
      }
    });

    it('parses block_actions', () => {
      const result = SlackEventSchema.safeParse({
        type: 'block_actions',
        actions: [{ action_id: 'btn' }],
        team: { id: 'T1' },
        trigger_id: 'trig1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('block_actions');
      }
    });

    it('parses interactive_message', () => {
      const result = SlackEventSchema.safeParse({
        type: 'interactive_message',
        actions: [{ action_id: 'btn' }],
        team: { id: 'T1' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('interactive_message');
      }
    });

    it('parses message_action', () => {
      const result = SlackEventSchema.safeParse({
        type: 'message_action',
        callback_id: 'ask_agent_shortcut',
        trigger_id: 'trig1',
        team: { id: 'T1' },
        channel: { id: 'C1' },
        user: { id: 'U1' },
        message: { ts: '123.456', text: 'hello' },
        response_url: 'https://hooks.slack.com/actions/xxx',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('message_action');
      }
    });

    it('parses view_submission', () => {
      const result = SlackEventSchema.safeParse({
        type: 'view_submission',
        view: {
          id: 'V1',
          callback_id: 'agent_selector_modal',
          state: { values: { block: { action: {} } } },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('view_submission');
      }
    });

    it('fails safeParse for unknown event type', () => {
      const result = SlackEventSchema.safeParse({
        type: 'unknown_event',
        data: 'something',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('inner event schemas', () => {
    it('KnownInnerEventSchema narrows app_mention with required user and channel', () => {
      const result = KnownInnerEventSchema.safeParse({
        type: 'app_mention',
        user: 'U123',
        channel: 'C456',
        text: 'hello',
        ts: '111.222',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('app_mention');
        expect(result.data.user).toBe('U123');
        expect(result.data.channel).toBe('C456');
      }
    });

    it('AppMentionInnerSchema fails without required user', () => {
      const result = AppMentionInnerSchema.safeParse({
        type: 'app_mention',
        channel: 'C456',
      });
      expect(result.success).toBe(false);
    });

    it('AppMentionInnerSchema fails without required channel', () => {
      const result = AppMentionInnerSchema.safeParse({
        type: 'app_mention',
        user: 'U123',
      });
      expect(result.success).toBe(false);
    });

    it('unknown inner event types fail safeParse', () => {
      const result = KnownInnerEventSchema.safeParse({
        type: 'message',
        user: 'U123',
        channel: 'C456',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bot message parsing via BaseInnerEventSchema', () => {
    it('EventCallbackSchema parses event with bot_id', () => {
      const result = EventCallbackSchema.safeParse({
        type: 'event_callback',
        team_id: 'T1',
        event: { type: 'message', bot_id: 'B123' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event?.bot_id).toBe('B123');
      }
    });

    it('EventCallbackSchema parses event with subtype bot_message', () => {
      const result = EventCallbackSchema.safeParse({
        type: 'event_callback',
        team_id: 'T1',
        event: { type: 'message', subtype: 'bot_message' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.event?.subtype).toBe('bot_message');
      }
    });

    it('BaseInnerEventSchema preserves extra fields via passthrough', () => {
      const result = EventCallbackSchema.safeParse({
        type: 'event_callback',
        event: { type: 'app_mention', user: 'U1', channel: 'C1', extra_field: 'kept' },
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.event) {
        expect((result.data.event as Record<string, unknown>).extra_field).toBe('kept');
      }
    });
  });
});
