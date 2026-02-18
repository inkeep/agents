import { describe, expect, it, vi } from 'vitest';

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
  },
}));

import type { AgentOption, ModalMetadata } from '../../slack/services/modals';
import { buildAgentSelectorModal, buildMessageShortcutModal } from '../../slack/services/modals';

const baseMetadata: ModalMetadata = {
  channel: 'C123',
  messageTs: '1234567890.123456',
  teamId: 'T123',
  slackUserId: 'U123',
  tenantId: 'tenant-1',
  isInThread: false,
};

const projects = [
  { id: 'proj-a', name: 'Project A' },
  { id: 'proj-b', name: 'Project B' },
];

const agentsA: AgentOption[] = [
  { id: 'agent-a1', name: 'Agent A1', projectId: 'proj-a', projectName: 'Project A' },
  { id: 'agent-a2', name: 'Agent A2', projectId: 'proj-a', projectName: 'Project A' },
];

const agentsB: AgentOption[] = [
  { id: 'agent-b1', name: 'Agent B1', projectId: 'proj-b', projectName: 'Project B' },
];

function findAgentBlock(blocks: any[]) {
  return blocks.find((b: any) => b.type === 'input' && b.element?.action_id === 'agent_select');
}

describe('buildAgentSelectorModal', () => {
  describe('dynamic agent block_id', () => {
    it('should use static block_id when no selectedProjectId', () => {
      const modal = buildAgentSelectorModal({
        projects,
        agents: agentsA,
        metadata: baseMetadata,
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.block_id).toBe('agent_select_block');
    });

    it('should use project-scoped block_id when selectedProjectId is set', () => {
      const modal = buildAgentSelectorModal({
        projects,
        agents: agentsA,
        metadata: baseMetadata,
        selectedProjectId: 'proj-a',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.block_id).toBe('agent_select_block_proj-a');
    });

    it('should produce different block_ids for different projects', () => {
      const modalA = buildAgentSelectorModal({
        projects,
        agents: agentsA,
        metadata: baseMetadata,
        selectedProjectId: 'proj-a',
      });
      const modalB = buildAgentSelectorModal({
        projects,
        agents: agentsB,
        metadata: baseMetadata,
        selectedProjectId: 'proj-b',
      });
      const blockA = findAgentBlock(modalA.blocks);
      const blockB = findAgentBlock(modalB.blocks);
      expect(blockA.block_id).not.toBe(blockB.block_id);
    });
  });

  describe('initial_option', () => {
    it('should set initial_option to first agent when agents exist', () => {
      const modal = buildAgentSelectorModal({
        projects,
        agents: agentsA,
        metadata: baseMetadata,
        selectedProjectId: 'proj-a',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      const parsed = JSON.parse(agentBlock.element.initial_option.value);
      expect(parsed.agentId).toBe('agent-a1');
      expect(parsed.projectId).toBe('proj-a');
    });

    it('should not set initial_option when agents list is empty', () => {
      const modal = buildAgentSelectorModal({
        projects,
        agents: [],
        metadata: baseMetadata,
        selectedProjectId: 'proj-a',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.element.initial_option).toBeUndefined();
    });

    it('should show "none" placeholder option when agents list is empty', () => {
      const modal = buildAgentSelectorModal({
        projects,
        agents: [],
        metadata: baseMetadata,
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.element.options).toHaveLength(1);
      expect(agentBlock.element.options[0].value).toBe('none');
    });
  });
});

describe('buildMessageShortcutModal', () => {
  describe('dynamic agent block_id', () => {
    it('should use static block_id when no selectedProjectId', () => {
      const modal = buildMessageShortcutModal({
        projects,
        agents: agentsA,
        metadata: baseMetadata,
        messageContext: 'some message',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.block_id).toBe('agent_select_block');
    });

    it('should use project-scoped block_id when selectedProjectId is set', () => {
      const modal = buildMessageShortcutModal({
        projects,
        agents: agentsB,
        metadata: baseMetadata,
        selectedProjectId: 'proj-b',
        messageContext: 'some message',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.block_id).toBe('agent_select_block_proj-b');
    });
  });

  describe('initial_option', () => {
    it('should set initial_option to first agent when agents exist', () => {
      const modal = buildMessageShortcutModal({
        projects,
        agents: agentsB,
        metadata: baseMetadata,
        selectedProjectId: 'proj-b',
        messageContext: 'some message',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      const parsed = JSON.parse(agentBlock.element.initial_option.value);
      expect(parsed.agentId).toBe('agent-b1');
    });

    it('should not set initial_option when agents list is empty', () => {
      const modal = buildMessageShortcutModal({
        projects,
        agents: [],
        metadata: baseMetadata,
        selectedProjectId: 'proj-b',
        messageContext: 'some message',
      });
      const agentBlock = findAgentBlock(modal.blocks);
      expect(agentBlock.element.initial_option).toBeUndefined();
    });
  });
});

describe('dynamic agent_select lookup', () => {
  function findAgentSelectInValues(values: Record<string, Record<string, unknown>>) {
    const entry = Object.entries(values).find(
      ([, block]) => (block as Record<string, unknown>).agent_select
    );
    const blockId = entry?.[0];
    const agentSelect = entry
      ? ((entry[1] as Record<string, unknown>).agent_select as
          | { selected_option?: { value?: string } }
          | undefined)
      : undefined;
    return { blockId, agentSelect };
  }

  it('should find agent_select in a static block_id', () => {
    const values = {
      project_select_block: { modal_project_select: {} },
      agent_select_block: {
        agent_select: {
          selected_option: { value: JSON.stringify({ agentId: 'a1', projectId: 'p1' }) },
        },
      },
      question_block: { question_input: { value: 'hello' } },
    };

    const { blockId, agentSelect } = findAgentSelectInValues(values);
    expect(blockId).toBe('agent_select_block');
    expect(agentSelect?.selected_option?.value).toContain('a1');
  });

  it('should find agent_select in a project-scoped block_id', () => {
    const values = {
      project_select_block: { modal_project_select: {} },
      'agent_select_block_proj-xyz': {
        agent_select: {
          selected_option: { value: JSON.stringify({ agentId: 'a2', projectId: 'proj-xyz' }) },
        },
      },
      question_block: { question_input: { value: 'hello' } },
    };

    const { blockId, agentSelect } = findAgentSelectInValues(values);
    expect(blockId).toBe('agent_select_block_proj-xyz');
    const value = agentSelect?.selected_option?.value;
    expect(value).toBeDefined();
    const parsed = JSON.parse(value as string);
    expect(parsed.agentId).toBe('a2');
    expect(parsed.projectId).toBe('proj-xyz');
  });

  it('should return undefined when no agent_select exists', () => {
    const values = {
      project_select_block: { modal_project_select: {} },
      question_block: { question_input: { value: 'hello' } },
    };

    const { blockId, agentSelect } = findAgentSelectInValues(values);
    expect(blockId).toBeUndefined();
    expect(agentSelect).toBeUndefined();
  });

  it('should return the correct block_id for error targeting', () => {
    const values = {
      'agent_select_block_proj-abc': {
        agent_select: {
          selected_option: { value: 'none' },
        },
      },
    };

    const { blockId, agentSelect } = findAgentSelectInValues(values);
    expect(blockId).toBe('agent_select_block_proj-abc');
    expect(agentSelect?.selected_option?.value).toBe('none');
  });
});
