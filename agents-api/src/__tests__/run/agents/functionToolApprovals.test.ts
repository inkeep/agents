import { beforeEach, describe, expect, it, vi } from 'vitest';

const sandboxExecutorMock = vi.hoisted(() => {
  const executeFunctionTool = vi.fn().mockResolvedValue({ ok: true });
  class SandboxExecutorFactory {
    static getForSession() {
      return { executeFunctionTool };
    }
    executeFunctionTool = executeFunctionTool;
  }
  return { SandboxExecutorFactory, executeFunctionTool };
});

vi.mock('../../../domains/run/tools/SandboxExecutorFactory', () => ({
  SandboxExecutorFactory: sandboxExecutorMock.SandboxExecutorFactory,
}));
vi.mock('../../../domains/run/tools/SandboxExecutorFactory.js', () => ({
  SandboxExecutorFactory: sandboxExecutorMock.SandboxExecutorFactory,
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    withRef: vi.fn(async (_pool: any, _ref: any, fn: any) => await fn({})),
    getFunctionToolsForSubAgent: vi.fn(() => async () => ({
      data: [
        {
          id: 'ft_1',
          name: 'getWeather',
          description: 'Get weather',
          functionId: 'fn_1',
          relationshipId: 'rel_1',
          toolPolicies: { '*': { needsApproval: true } },
        },
      ],
      pagination: { page: 1, limit: 1000, total: 1, pages: 1 },
    })),
    // Avoid DB writes for tool-result history
    createMessage: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
  };
});

vi.mock('ai', () => ({
  tool: vi.fn().mockImplementation((config) => config),
}));

import type { FullExecutionContext } from '@inkeep/agents-core';
import { Agent, type AgentConfig } from '../../../domains/run/agents/Agent';
import { pendingToolApprovalManager } from '../../../domains/run/services/PendingToolApprovalManager';
import { toolApprovalUiBus } from '../../../domains/run/services/ToolApprovalUiBus';
import { INKEEP_TOOL_DENIED_KEY } from '../../../domains/run/utils/tool-result';

describe('Function tool approvals (toolPolicies)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const executionContext = {
    tenantId: 't',
    projectId: 'p',
    agentId: 'a',
    resolvedRef: { ref: 'main', type: 'branch' },
    project: {
      agents: {},
      tools: {},
      functions: {
        fn_1: {
          inputSchema: { type: 'object', properties: {} },
          executeCode: 'return { ok: true };',
          dependencies: {},
        },
      },
    },
    metadata: {},
  } as unknown as FullExecutionContext;

  const baseConfig: AgentConfig = {
    id: 'sa_1',
    tenantId: 't',
    projectId: 'p',
    agentId: 'a',
    baseUrl: 'http://localhost',
    name: 'SubAgent',
    transferRelations: [],
    delegateRelations: [],
    subAgentRelations: [],
    functionTools: [],
  };

  it('publishes approval-needed and returns denied sentinel when user denies', async () => {
    const agent = new Agent(baseConfig, executionContext);
    agent.setConversationId('conv_1');
    agent.setDelegationStatus(true);
    (agent as any).streamRequestId = 'req_1';

    const publishSpy = vi.spyOn(toolApprovalUiBus, 'publish').mockResolvedValue(undefined as any);
    vi.spyOn(pendingToolApprovalManager, 'waitForApproval').mockResolvedValue({
      approved: false,
      reason: 'no',
    });

    const tools = await agent.getFunctionTools('sess_1', 'req_1');
    expect(tools.getWeather).toBeTruthy();

    const result = await (tools.getWeather as any).execute(
      { city: 'SF' },
      { toolCallId: 'call_1' }
    );

    expect(result).toMatchObject({ [INKEEP_TOOL_DENIED_KEY]: true, toolCallId: 'call_1' });
    expect(sandboxExecutorMock.executeFunctionTool).not.toHaveBeenCalled();
    expect(publishSpy).toHaveBeenCalledWith(
      'req_1',
      expect.objectContaining({ type: 'approval-needed' })
    );
    expect(publishSpy).toHaveBeenCalledWith(
      'req_1',
      expect.objectContaining({ type: 'approval-resolved', toolCallId: 'call_1', approved: false })
    );
  });

  it('waits for approval and runs the function tool when approved', async () => {
    const agent = new Agent(baseConfig, executionContext);
    agent.setConversationId('conv_1');
    agent.setDelegationStatus(true);
    (agent as any).streamRequestId = 'req_2';

    const publishSpy = vi.spyOn(toolApprovalUiBus, 'publish').mockResolvedValue(undefined as any);
    vi.spyOn(pendingToolApprovalManager, 'waitForApproval').mockResolvedValue({ approved: true });

    const tools = await agent.getFunctionTools('sess_2', 'req_2');
    expect(tools.getWeather).toBeTruthy();

    const result = await (tools.getWeather as any).execute(
      { city: 'SF' },
      { toolCallId: 'call_2' }
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(sandboxExecutorMock.executeFunctionTool).toHaveBeenCalled();
    expect(publishSpy).toHaveBeenCalledWith(
      'req_2',
      expect.objectContaining({ type: 'approval-resolved', toolCallId: 'call_2', approved: true })
    );
  });
});
