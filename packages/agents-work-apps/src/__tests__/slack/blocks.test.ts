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
  createStatusMessage,
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

  describe('createStatusMessage', () => {
    const dashboardUrl = 'https://app.inkeep.com/tenant-1/work-apps/slack';

    it('should show agent and project with links when both are available', () => {
      const result = createStatusMessage('user@example.com', '2026-01-25T12:00:00Z', dashboardUrl, {
        channelConfig: null,
        workspaceConfig: null,
        effective: {
          agentName: 'Support Agent',
          agentId: 'support-agent',
          projectId: 'proj-1',
          projectName: 'My Project',
          source: 'workspace',
        },
      });

      const json = JSON.stringify(result);
      expect(json).toContain('Connected to Inkeep');
      expect(json).toContain('user@example.com');
      expect(json).toContain(
        '<https://app.inkeep.com/tenant-1/projects/proj-1/agents/support-agent|Support Agent>'
      );
      expect(json).toContain('<https://app.inkeep.com/tenant-1/projects/proj-1/agents|My Project>');
    });

    it('should use agentId as display name when agentName is missing', () => {
      const result = createStatusMessage('user@example.com', '2026-01-25T12:00:00Z', dashboardUrl, {
        channelConfig: null,
        workspaceConfig: null,
        effective: {
          agentId: 'support-agent',
          projectId: 'proj-1',
          projectName: 'My Project',
          source: 'channel',
        },
      });

      const json = JSON.stringify(result);
      expect(json).toContain(
        '<https://app.inkeep.com/tenant-1/projects/proj-1/agents/support-agent|support-agent>'
      );
    });

    it('should use projectId as display name when projectName is missing', () => {
      const result = createStatusMessage('user@example.com', '2026-01-25T12:00:00Z', dashboardUrl, {
        channelConfig: null,
        workspaceConfig: null,
        effective: {
          agentName: 'Support Agent',
          agentId: 'support-agent',
          projectId: 'proj-1',
          source: 'workspace',
        },
      });

      const json = JSON.stringify(result);
      expect(json).toContain('<https://app.inkeep.com/tenant-1/projects/proj-1/agents|proj-1>');
    });

    it('should show no agent message when effective is null', () => {
      const result = createStatusMessage('user@example.com', '2026-01-25T12:00:00Z', dashboardUrl, {
        channelConfig: null,
        workspaceConfig: null,
        effective: null,
      });

      const json = JSON.stringify(result);
      expect(json).toContain('None configured');
      expect(json).not.toContain('Project:');
    });

    it('should always include project and agent links when effective config is present', () => {
      const result = createStatusMessage('user@example.com', '2026-01-25T12:00:00Z', dashboardUrl, {
        channelConfig: null,
        workspaceConfig: null,
        effective: {
          agentName: 'Support Agent',
          agentId: 'support-agent',
          projectId: 'proj-1',
          source: 'workspace',
        },
      });

      const json = JSON.stringify(result);
      expect(json).toContain(
        '<https://app.inkeep.com/tenant-1/projects/proj-1/agents/support-agent|Support Agent>'
      );
      expect(json).toContain('<https://app.inkeep.com/tenant-1/projects/proj-1/agents|proj-1>');
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
