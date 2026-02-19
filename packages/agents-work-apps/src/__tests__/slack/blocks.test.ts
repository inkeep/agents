/**
 * Tests for Slack Block Kit message builders
 *
 * Tests all message builders in blocks/index.ts including:
 * - Context blocks and follow-up buttons (centralized helpers)
 * - Help and command reference messages
 * - Error and success messages
 */

import { describe, expect, it } from 'vitest';
import {
  buildToolApprovalBlocks,
  buildToolApprovalDoneBlocks,
  createAlreadyLinkedMessage,
  createContextBlock,
  createErrorMessage,
  createNotLinkedMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../../slack/services/blocks';

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

    it('should combine isPrivate correctly', () => {
      const result = createContextBlock({
        agentName: 'Test Agent',
        isPrivate: true,
      });

      expect(result.elements[0].text).toBe(
        '_Private response_ • Powered by *Test Agent* via Inkeep'
      );
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

  describe('createUpdatedHelpMessage', () => {
    it('should create comprehensive help message', () => {
      const result = createUpdatedHelpMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('How to Use');
      expect(JSON.stringify(result)).toContain('Public');
      expect(JSON.stringify(result)).toContain('Private');
      expect(JSON.stringify(result)).toContain('/inkeep status');
      expect(JSON.stringify(result)).toContain('Learn more');
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

describe('buildToolApprovalBlocks', () => {
  const buttonValue = JSON.stringify({ toolCallId: 'tc-1', conversationId: 'conv-1' });

  it('should include a header, section, divider, and actions block', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', buttonValue });

    const types = blocks.map((b: any) => b.type);
    expect(types).toContain('header');
    expect(types).toContain('section');
    expect(types).toContain('divider');
    expect(types).toContain('actions');
  });

  it('should include the tool name in the section text', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', buttonValue });

    const section = blocks.find((b: any) => b.type === 'section');
    expect(section.text.text).toContain('search_web');
  });

  it('should have correct action_ids on approve and deny buttons', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', buttonValue });

    const actions = blocks.find((b: any) => b.type === 'actions');
    const actionIds = actions.elements.map((e: any) => e.action_id);
    expect(actionIds).toContain('tool_approval_approve');
    expect(actionIds).toContain('tool_approval_deny');
  });

  it('should embed buttonValue in both buttons', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', buttonValue });

    const actions = blocks.find((b: any) => b.type === 'actions');
    for (const element of actions.elements) {
      expect(element.value).toBe(buttonValue);
    }
  });

  it('should not add a fields section when input is empty', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input: {}, buttonValue });

    const sections = blocks.filter((b: any) => b.type === 'section');
    const fieldSections = sections.filter((s: any) => s.fields);
    expect(fieldSections).toHaveLength(0);
  });

  it('should render input fields as mrkdwn field objects', () => {
    const input = { query: 'hello', limit: 10 };
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input, buttonValue });

    const fieldSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    expect(fieldSection).toBeDefined();
    expect(fieldSection.fields).toHaveLength(2);
    expect(fieldSection.fields[0].type).toBe('mrkdwn');
    expect(fieldSection.fields[0].text).toContain('*query*');
    expect(fieldSection.fields[0].text).toContain('hello');
  });

  it('should truncate string values longer than 80 characters', () => {
    const longValue = 'a'.repeat(100);
    const blocks = buildToolApprovalBlocks({
      toolName: 'search_web',
      input: { key: longValue },
      buttonValue,
    });

    const fieldSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    const fieldText: string = fieldSection.fields[0].text;
    expect(fieldText).toContain('…');
    expect(fieldText.length).toBeLessThan(longValue.length + 10);
  });

  it('should truncate non-string values to 80 characters of their JSON representation', () => {
    const bigObj = { nested: 'x'.repeat(100) };
    const blocks = buildToolApprovalBlocks({
      toolName: 'search_web',
      input: { key: bigObj },
      buttonValue,
    });

    const fieldSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    const fieldText: string = fieldSection.fields[0].text;
    const valueText = fieldText.split('\n')[1];
    expect(valueText.length).toBeLessThanOrEqual(80);
  });

  it('should render at most 10 input fields', () => {
    const input = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`key${i}`, `val${i}`]));
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input, buttonValue });

    const fieldSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    expect(fieldSection.fields).toHaveLength(10);
  });
});

describe('buildToolApprovalDoneBlocks', () => {
  it('should show approved status with actor mention', () => {
    const blocks = buildToolApprovalDoneBlocks({
      toolName: 'search_web',
      approved: true,
      actorUserId: 'U123',
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('context');
    const text: string = blocks[0].elements[0].text;
    expect(text).toContain('✅');
    expect(text).toContain('search_web');
    expect(text).toContain('<@U123>');
  });

  it('should show denied status with actor mention', () => {
    const blocks = buildToolApprovalDoneBlocks({
      toolName: 'search_web',
      approved: false,
      actorUserId: 'U456',
    });

    const text: string = blocks[0].elements[0].text;
    expect(text).toContain('❌');
    expect(text).toContain('search_web');
    expect(text).toContain('<@U456>');
  });
});
