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
  buildDataComponentBlocks,
  buildSummaryBreadcrumbBlock,
  buildToolApprovalBlocks,
  buildToolApprovalDoneBlocks,
  buildToolApprovalExpiredBlocks,
  buildToolOutputErrorBlock,
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

    it('should include the error text directly without emoji prefix', () => {
      const result = createErrorMessage('Error occurred');

      expect(JSON.stringify(result)).toContain('Error occurred');
      expect(JSON.stringify(result)).not.toContain('❌');
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
      expect(JSON.stringify(result)).toContain('Already linked');
      expect(JSON.stringify(result)).toContain(email);
      expect(JSON.stringify(result)).toContain('/inkeep unlink');
    });
  });

  describe('createUnlinkSuccessMessage', () => {
    it('should create unlink success message', () => {
      const result = createUnlinkSuccessMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Account unlinked');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });

  describe('createNotLinkedMessage', () => {
    it('should create not linked message', () => {
      const result = createNotLinkedMessage();

      expect(result.blocks).toBeDefined();
      expect(JSON.stringify(result)).toContain('Not linked');
      expect(JSON.stringify(result)).toContain('/inkeep link');
    });
  });
});

describe('buildToolApprovalBlocks', () => {
  const buttonValue = JSON.stringify({ toolCallId: 'tc-1', conversationId: 'conv-1' });

  it('should include a section and actions block but no header or divider', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', buttonValue });

    const types = blocks.map((b: any) => b.type);
    expect(types).toContain('section');
    expect(types).toContain('actions');
    expect(types).not.toContain('header');
    expect(types).not.toContain('divider');
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

  it('should not add an input section when input is empty', () => {
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input: {}, buttonValue });

    const sections = blocks.filter((b: any) => b.type === 'section');
    expect(sections).toHaveLength(1);
  });

  it('should render input as key-value fields', () => {
    const input = { query: 'hello', limit: 10 };
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input, buttonValue });

    const inputSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    expect(inputSection).toBeDefined();
    expect(inputSection.fields).toHaveLength(2);
    const fieldTexts = inputSection.fields.map((f: any) => f.text);
    expect(fieldTexts.some((t: string) => t.includes('query'))).toBe(true);
    expect(fieldTexts.some((t: string) => t.includes('hello'))).toBe(true);
  });

  it('should truncate field values longer than 80 characters with ellipsis', () => {
    const input = { data: 'x'.repeat(100) };
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input, buttonValue });

    const inputSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    expect(inputSection).toBeDefined();
    const field = inputSection.fields[0];
    expect(field.text).toContain('…');
    const valueText = field.text.split('\n')[1];
    expect(valueText.length).toBeLessThanOrEqual(82);
  });

  it('should not truncate field values under 80 characters', () => {
    const input = { query: 'hello', limit: 10 };
    const blocks = buildToolApprovalBlocks({ toolName: 'search_web', input, buttonValue });

    const inputSection = blocks.find((b: any) => b.type === 'section' && b.fields);
    expect(inputSection).toBeDefined();
    for (const field of inputSection.fields) {
      expect(field.text).not.toContain('…');
    }
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

describe('mrkdwn special character escaping', () => {
  describe('buildToolApprovalBlocks', () => {
    it('should escape special characters in toolName', () => {
      const blocks = buildToolApprovalBlocks({
        toolName: 'search <web> & more',
        buttonValue: '{}',
      });
      const section = blocks.find((b: any) => b.type === 'section');
      expect(section.text.text).toContain('search &lt;web&gt; &amp; more');
      expect(section.text.text).not.toContain('<web>');
    });

    it('should escape special characters in input field keys and values', () => {
      const blocks = buildToolApprovalBlocks({
        toolName: 'tool',
        input: { '<key>': 'val & "more"', safe: 'normal' },
        buttonValue: '{}',
      });
      const inputSection = blocks.find((b: any) => b.type === 'section' && b.fields);
      const texts: string[] = inputSection.fields.map((f: any) => f.text);
      expect(texts.some((t) => t.includes('&lt;key&gt;'))).toBe(true);
      expect(texts.some((t) => t.includes('&amp;'))).toBe(true);
      expect(texts.some((t) => t.includes('<key>'))).toBe(false);
    });
  });

  describe('buildToolApprovalDoneBlocks', () => {
    it('should escape special characters in toolName', () => {
      const blocks = buildToolApprovalDoneBlocks({
        toolName: 'tool <x>',
        approved: true,
        actorUserId: 'U1',
      });
      const text: string = blocks[0].elements[0].text;
      expect(text).toContain('&lt;x&gt;');
      expect(text).not.toContain('<x>');
    });
  });

  describe('buildToolApprovalExpiredBlocks', () => {
    it('should escape special characters in toolName', () => {
      const blocks = buildToolApprovalExpiredBlocks({ toolName: 'tool & <x>' });
      const text: string = blocks[0].elements[0].text;
      expect(text).toContain('&amp;');
      expect(text).toContain('&lt;x&gt;');
    });
  });

  describe('buildToolOutputErrorBlock', () => {
    it('should escape special characters in toolName and errorText', () => {
      const block = buildToolOutputErrorBlock('my <tool>', 'failed: a > b & c');
      const text: string = block.elements[0].text;
      expect(text).toContain('&lt;tool&gt;');
      expect(text).toContain('a &gt; b &amp; c');
    });
  });

  describe('buildSummaryBreadcrumbBlock', () => {
    it('should escape special characters in labels', () => {
      const block = buildSummaryBreadcrumbBlock(['Step <1>', 'Step & 2']);
      const text: string = block.elements[0].text;
      expect(text).toContain('Step &lt;1&gt;');
      expect(text).toContain('Step &amp; 2');
    });
  });

  describe('buildDataComponentBlocks', () => {
    it('should escape special characters in flat record field keys and values', () => {
      const { blocks } = buildDataComponentBlocks({
        id: 'c1',
        data: { '<field>': 'val & more' },
      });
      const section = blocks.find((b: any) => b.type === 'section' && b.fields);
      const texts: string[] = section.fields.map((f: any) => f.text);
      expect(texts.some((t) => t.includes('&lt;field&gt;'))).toBe(true);
      expect(texts.some((t) => t.includes('&amp;'))).toBe(true);
    });
  });

  describe('createContextBlock', () => {
    it('should escape special characters in agentName', () => {
      const block = createContextBlock({ agentName: 'Agent <X> & Y' });
      const text: string = block.elements[0].text;
      expect(text).toContain('&lt;X&gt;');
      expect(text).toContain('&amp;');
      expect(text).not.toContain('<X>');
    });
  });
});
