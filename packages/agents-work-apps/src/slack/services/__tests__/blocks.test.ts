/**
 * Tests for Slack Block Kit message builders
 *
 * Tests all message builders in blocks/index.ts including:
 * - Context blocks and share buttons (centralized helpers)
 * - Help and command reference messages
 * - Agent list messages
 * - Error and success messages
 */

import { describe, expect, it } from 'vitest';
import {
  buildShareButtons,
  createAgentListMessage,
  createAlreadyLinkedMessage,
  createContextBlock,
  createErrorMessage,
  createNotLinkedMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../blocks';

describe('Slack Block Builders', () => {
  describe('createContextBlock', () => {
    it('should create a basic context block with agent name', () => {
      const result = createContextBlock({ agentName: 'Test Agent' });

      expect(result.type).toBe('context');
      expect(result.elements[0].type).toBe('mrkdwn');
      expect(result.elements[0].text).toBe('Powered by *Test Agent* via Inkeep');
    });

    it('should add private response prefix when isPrivate is true', () => {
      const result = createContextBlock({ agentName: 'Test Agent', isPrivate: true });

      expect(result.elements[0].text).toBe(
        '_Private response_ • Powered by *Test Agent* via Inkeep'
      );
    });

    it('should add shared by prefix when sharedBy is provided', () => {
      const result = createContextBlock({ agentName: 'Test Agent', sharedBy: 'U123ABC' });

      expect(result.elements[0].text).toBe(
        'Shared by <@U123ABC> • Powered by *Test Agent* via Inkeep'
      );
    });

    it('should combine sharedBy and isPrivate correctly', () => {
      const result = createContextBlock({
        agentName: 'Test Agent',
        sharedBy: 'U123ABC',
        isPrivate: true,
      });

      expect(result.elements[0].text).toBe(
        '_Private response_ • Shared by <@U123ABC> • Powered by *Test Agent* via Inkeep'
      );
    });
  });

  describe('buildShareButtons', () => {
    it('should create only share to channel button when no threadTs', () => {
      const result = buildShareButtons({
        channelId: 'C123',
        text: 'Response text',
        agentName: 'Test Agent',
      });

      expect(result.length).toBe(1);
      expect(result[0].action_id).toBe('share_to_channel');
      expect(result[0].text.text).toBe('Share to Channel');
    });

    it('should create both buttons when threadTs is provided', () => {
      const result = buildShareButtons({
        channelId: 'C123',
        text: 'Response text',
        agentName: 'Test Agent',
        threadTs: '1234567890.123456',
      });

      expect(result.length).toBe(2);
      expect(result[0].action_id).toBe('share_to_thread');
      expect(result[0].style).toBe('primary');
      expect(result[1].action_id).toBe('share_to_channel');
      expect(result[1].style).toBeUndefined();
    });

    it('should encode correct data in button values', () => {
      const result = buildShareButtons({
        channelId: 'C123ABC',
        text: 'Test response',
        agentName: 'My Agent',
        threadTs: '123.456',
      });

      const threadButton = JSON.parse(result[0].value);
      expect(threadButton.channelId).toBe('C123ABC');
      expect(threadButton.threadTs).toBe('123.456');
      expect(threadButton.text).toBe('Test response');
      expect(threadButton.agentName).toBe('My Agent');

      const channelButton = JSON.parse(result[1].value);
      expect(channelButton.channelId).toBe('C123ABC');
      expect(channelButton.text).toBe('Test response');
      expect(channelButton.agentName).toBe('My Agent');
      expect(channelButton.threadTs).toBeUndefined();
    });
  });

  describe('createErrorMessage', () => {
    it('should create error message with custom text', () => {
      const errorText = 'Something went wrong!';

      const result = createErrorMessage(errorText);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain(errorText);
    });

    it('should include error emoji', () => {
      const result = createErrorMessage('Error occurred');

      expect(JSON.stringify(result)).toContain('❌');
    });
  });

  describe('createAgentListMessage', () => {
    it('should create agent list message', () => {
      const agents = [
        { id: 'agent-1', name: 'Support Agent', projectName: 'Main Project' },
        { id: 'agent-2', name: 'Sales Agent', projectName: null },
        { id: 'agent-3', name: null, projectName: 'Other Project' },
      ];
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createAgentListMessage(agents, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Available Agents');
      expect(JSON.stringify(result)).toContain('Support Agent');
      expect(JSON.stringify(result)).toContain('Main Project');
    });

    it('should show more text when agents exceed 15', () => {
      const agents = Array.from({ length: 20 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        projectName: 'Project',
      }));

      const result = createAgentListMessage(agents, 'https://app.inkeep.com');

      expect(JSON.stringify(result)).toContain('and 5 more');
    });
  });

  describe('createUpdatedHelpMessage', () => {
    it('should create comprehensive help message', () => {
      const result = createUpdatedHelpMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('@Inkeep Usage');
      expect(JSON.stringify(result)).toContain('Agent picker');
      expect(JSON.stringify(result)).toContain('/inkeep Usage');
      expect(JSON.stringify(result)).toContain('/inkeep run');
      expect(JSON.stringify(result)).toContain('/inkeep list');
    });
  });

  describe('createAlreadyLinkedMessage', () => {
    it('should create already linked message', () => {
      const email = 'test@example.com';
      const linkedAt = '2026-01-25T12:00:00Z';
      const dashboardUrl = 'https://app.inkeep.com';

      const result = createAlreadyLinkedMessage(email, linkedAt, dashboardUrl);

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Already Linked');
      expect(JSON.stringify(result)).toContain(email);
      expect(JSON.stringify(result)).toContain('/inkeep unlink');
    });
  });

  describe('createUnlinkSuccessMessage', () => {
    it('should create unlink success message', () => {
      const result = createUnlinkSuccessMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Account Unlinked');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });

  describe('createNotLinkedMessage', () => {
    it('should create not linked message', () => {
      const result = createNotLinkedMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Not Linked');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });
});
