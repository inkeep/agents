/**
 * Tests for Slack slash command types and utilities
 */

import { describe, expect, it } from 'vitest';
import type { SlackCommandPayload } from '../../slack/services/types';

describe('Slack Commands', () => {
  describe('SlackCommandPayload type', () => {
    it('should have correct required fields', () => {
      const payload: SlackCommandPayload = {
        command: '/inkeep',
        text: 'help',
        userId: 'U0A9WJVPN1H',
        userName: 'testuser',
        teamId: 'T0AA0UWRXJS',
        teamDomain: 'inkeepBotTesting',
        channelId: 'C123456',
        channelName: 'general',
        responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
        triggerId: '123.456.abc',
      };

      expect(payload.command).toBe('/inkeep');
      expect(payload.text).toBe('help');
      expect(payload.userId).toBe('U0A9WJVPN1H');
      expect(payload.teamId).toBe('T0AA0UWRXJS');
    });

    it('should allow optional enterpriseId', () => {
      const payload: SlackCommandPayload = {
        command: '/inkeep',
        text: 'list',
        userId: 'U123',
        userName: 'user',
        teamId: 'T123',
        teamDomain: 'team',
        enterpriseId: 'E0AA0UUL7ML',
        channelId: 'C123',
        channelName: 'general',
        responseUrl: 'https://hooks.slack.com/commands',
        triggerId: '123.456',
      };

      expect(payload.enterpriseId).toBe('E0AA0UUL7ML');
    });
  });
});
