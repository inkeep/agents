/**
 * Tests for Slack security utilities
 *
 * Tests cover:
 * - HMAC-SHA256 signature verification (verifySlackRequest)
 * - URL-encoded command body parsing (parseSlackCommandBody)
 * - Event body parsing for JSON and form-encoded (parseSlackEventBody)
 */

import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseSlackCommandBody,
  parseSlackEventBody,
  verifySlackRequest,
} from '../../slack/services/security';

describe('security', () => {
  describe('verifySlackRequest', () => {
    const signingSecret = 'test-signing-secret';

    function generateValidSignature(body: string, timestamp: string): string {
      const sigBaseString = `v0:${timestamp}:${body}`;
      return `v0=${crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex')}`;
    }

    function getCurrentTimestamp(): string {
      return String(Math.floor(Date.now() / 1000));
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-25T12:00:00Z'));
    });

    it('should return true for valid request signature', () => {
      const body = 'token=test&team_id=T123&user_id=U123&command=/inkeep&text=help';
      const timestamp = getCurrentTimestamp();
      const signature = generateValidSignature(body, timestamp);

      const result = verifySlackRequest(signingSecret, body, timestamp, signature);

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const body = 'token=test&team_id=T123';
      const timestamp = getCurrentTimestamp();
      const invalidSignature = 'v0=invalidhash';

      const result = verifySlackRequest(signingSecret, body, timestamp, invalidSignature);

      expect(result).toBe(false);
    });

    it('should return false for tampered body', () => {
      const originalBody = 'token=test&team_id=T123';
      const tamperedBody = 'token=test&team_id=T456';
      const timestamp = getCurrentTimestamp();
      const signature = generateValidSignature(originalBody, timestamp);

      const result = verifySlackRequest(signingSecret, tamperedBody, timestamp, signature);

      expect(result).toBe(false);
    });

    it('should return false for timestamp older than 5 minutes', () => {
      const body = 'token=test&team_id=T123';
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60);
      const signature = generateValidSignature(body, oldTimestamp);

      const result = verifySlackRequest(signingSecret, body, oldTimestamp, signature);

      expect(result).toBe(false);
    });

    it('should return true for timestamp exactly 5 minutes old', () => {
      const body = 'token=test&team_id=T123';
      const fiveMinutesAgo = String(Math.floor(Date.now() / 1000) - 5 * 60 + 1);
      const signature = generateValidSignature(body, fiveMinutesAgo);

      const result = verifySlackRequest(signingSecret, body, fiveMinutesAgo, signature);

      expect(result).toBe(true);
    });

    it('should return false for malformed timestamp', () => {
      const body = 'token=test&team_id=T123';
      const invalidTimestamp = 'not-a-number';
      const signature = 'v0=somehash';

      const result = verifySlackRequest(signingSecret, body, invalidTimestamp, signature);

      expect(result).toBe(false);
    });

    it('should handle empty body', () => {
      const body = '';
      const timestamp = getCurrentTimestamp();
      const signature = generateValidSignature(body, timestamp);

      const result = verifySlackRequest(signingSecret, body, timestamp, signature);

      expect(result).toBe(true);
    });

    it('should handle JSON body', () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });
      const timestamp = getCurrentTimestamp();
      const signature = generateValidSignature(body, timestamp);

      const result = verifySlackRequest(signingSecret, body, timestamp, signature);

      expect(result).toBe(true);
    });

    it('should return false when signatures have different lengths', () => {
      const body = 'token=test';
      const timestamp = getCurrentTimestamp();
      const shortSignature = 'v0=abc';

      const result = verifySlackRequest(signingSecret, body, timestamp, shortSignature);

      expect(result).toBe(false);
    });
  });

  describe('parseSlackCommandBody', () => {
    it('should parse URL-encoded command body', () => {
      const body =
        'token=test123&team_id=T0AA0UWRXJS&team_domain=inkeepBotTesting&channel_id=C123&channel_name=general&user_id=U0A9WJVPN1H&user_name=testuser&command=%2Finkeep&text=help&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands&trigger_id=123.456.abc';

      const result = parseSlackCommandBody(body);

      expect(result).toEqual({
        token: 'test123',
        team_id: 'T0AA0UWRXJS',
        team_domain: 'inkeepBotTesting',
        channel_id: 'C123',
        channel_name: 'general',
        user_id: 'U0A9WJVPN1H',
        user_name: 'testuser',
        command: '/inkeep',
        text: 'help',
        response_url: 'https://hooks.slack.com/commands',
        trigger_id: '123.456.abc',
      });
    });

    it('should handle empty body', () => {
      const result = parseSlackCommandBody('');
      expect(result).toEqual({});
    });

    it('should handle body with special characters', () => {
      const body = 'text=hello%20world%21&user_name=user%40company';

      const result = parseSlackCommandBody(body);

      expect(result).toEqual({
        text: 'hello world!',
        user_name: 'user@company',
      });
    });

    it('should handle body with plus signs', () => {
      const body = 'text=hello+world';

      const result = parseSlackCommandBody(body);

      expect(result).toEqual({
        text: 'hello world',
      });
    });

    it('should handle enterprise_id', () => {
      const body = 'team_id=T123&enterprise_id=E0AA0UUL7ML&user_id=U123';

      const result = parseSlackCommandBody(body);

      expect(result).toEqual({
        team_id: 'T123',
        enterprise_id: 'E0AA0UUL7ML',
        user_id: 'U123',
      });
    });
  });

  describe('parseSlackEventBody', () => {
    it('should parse JSON body with application/json content type', () => {
      const body = JSON.stringify({
        type: 'event_callback',
        team_id: 'T123',
        event: {
          type: 'app_mention',
          user: 'U123',
          text: '<@UBOT> hello',
          channel: 'C123',
          ts: '1234567890.123456',
        },
      });

      const result = parseSlackEventBody(body, 'application/json');

      expect(result).toEqual({
        type: 'event_callback',
        team_id: 'T123',
        event: {
          type: 'app_mention',
          user: 'U123',
          text: '<@UBOT> hello',
          channel: 'C123',
          ts: '1234567890.123456',
        },
      });
    });

    it('should parse URL verification challenge', () => {
      const body = JSON.stringify({
        type: 'url_verification',
        challenge: 'abc123xyz',
        token: 'verificationtoken',
      });

      const result = parseSlackEventBody(body, 'application/json');

      expect(result).toEqual({
        type: 'url_verification',
        challenge: 'abc123xyz',
        token: 'verificationtoken',
      });
    });

    it('should parse form-encoded body with payload parameter', () => {
      const payload = {
        type: 'block_actions',
        user: { id: 'U123', username: 'testuser' },
        trigger_id: '123.456.abc',
        actions: [{ action_id: 'share_to_channel', value: 'test' }],
      };
      const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;

      const result = parseSlackEventBody(body, 'application/x-www-form-urlencoded');

      expect(result).toEqual(payload);
    });

    it('should parse form-encoded body without payload parameter', () => {
      const body = 'type=interactive_message&user_id=U123&team_id=T123';

      const result = parseSlackEventBody(body, 'application/x-www-form-urlencoded');

      expect(result).toEqual({
        type: 'interactive_message',
        user_id: 'U123',
        team_id: 'T123',
      });
    });

    it('should handle content type with charset', () => {
      const body = JSON.stringify({ type: 'event_callback' });

      const result = parseSlackEventBody(body, 'application/json; charset=utf-8');

      expect(result).toEqual({ type: 'event_callback' });
    });

    it('should parse view_submission interactive payload', () => {
      const payload = {
        type: 'view_submission',
        view: {
          callback_id: 'agent_selector_modal',
          private_metadata: JSON.stringify({ channel: 'C123', teamId: 'T123' }),
          state: {
            values: {
              question_block: {
                question_input: { value: 'What is Inkeep?' },
              },
            },
          },
        },
        user: { id: 'U123', name: 'testuser' },
      };
      const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;

      const result = parseSlackEventBody(body, 'application/x-www-form-urlencoded');

      expect(result).toEqual(payload);
    });

    it('should throw for invalid JSON', () => {
      const invalidBody = 'not valid json';

      expect(() => parseSlackEventBody(invalidBody, 'application/json')).toThrow();
    });
  });
});
