import {
  createMessage,
  createOrGetConversation,
  generateId,
  getFullProjectWithRelationIds,
  getMessagesByConversation,
  getProjectScopedRef,
  resolveRef,
  setActiveAgentForConversation,
  updateWorkflowExecution,
  type WorkflowExecutionStatus,
  withRef,
} from '@inkeep/agents-core';
import type { ModelMessage } from 'ai';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';

const logger = getLogger('workflow-agent-execution-steps');

export async function logStep(message: string, data: Record<string, unknown>) {
  'use step';
  logger.info(data, message);
}

export type SubAgentRelationInfo = {
  id: string;
  name: string;
  description: string | null;
};

export type AgentConfigResult = {
  success: boolean;
  systemPrompt?: string;
  modelConfig?: { model: string; providerOptions?: Record<string, unknown> };
  defaultSubAgentId?: string;
  transferRelations?: SubAgentRelationInfo[];
  delegateRelations?: SubAgentRelationInfo[];
  error?: string;
};

export async function loadAgentConfigStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  subAgentId?: string;
}): Promise<AgentConfigResult> {
  'use step';

  const { tenantId, projectId, agentId, conversationId } = params;

  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    return { success: false, error: `Failed to resolve ref for project ${projectId}` };
  }

  const project = await withRef(manageDbPool, resolvedRef, async (db) => {
    return await getFullProjectWithRelationIds(db)({
      scopes: { tenantId, projectId },
    });
  });

  if (!project) {
    return { success: false, error: `Project ${projectId} not found` };
  }

  const agent = project.agents?.[agentId];
  if (!agent) {
    return { success: false, error: `Agent ${agentId} not found in project` };
  }

  const targetSubAgentId = params.subAgentId ?? agent.defaultSubAgentId;
  if (!targetSubAgentId) {
    return { success: false, error: `Agent ${agentId} has no default sub-agent configured` };
  }

  const subAgent = agent.subAgents?.[targetSubAgentId];
  if (!subAgent) {
    return { success: false, error: `Sub-agent ${targetSubAgentId} not found` };
  }

  const systemPrompt = subAgent.prompt ?? undefined;

  const subAgentModels = subAgent.models;
  const projectModels = project.models;
  const modelSettings = subAgentModels?.base ?? projectModels?.base;
  const modelConfig = modelSettings?.model
    ? { model: modelSettings.model, providerOptions: modelSettings.providerOptions }
    : undefined;

  const transferRelations: SubAgentRelationInfo[] = (subAgent.canTransferTo || [])
    .map((relation) => {
      const target = agent.subAgents?.[relation.subAgentId];
      if (!target) return null;
      return { id: relation.subAgentId, name: target.name, description: target.description };
    })
    .filter((r): r is SubAgentRelationInfo => r !== null);

  const delegateRelations: SubAgentRelationInfo[] = (subAgent.canDelegateTo || [])
    .filter(
      (item): item is { subAgentId: string; subAgentSubAgentRelationId: string } =>
        'subAgentId' in item
    )
    .map((item) => {
      const target = agent.subAgents?.[item.subAgentId];
      if (!target) return null;
      return { id: item.subAgentId, name: target.name, description: target.description };
    })
    .filter((r): r is SubAgentRelationInfo => r !== null);

  await createOrGetConversation(runDbClient)({
    id: conversationId,
    tenantId,
    projectId,
    agentId,
    activeSubAgentId: targetSubAgentId,
    ref: resolvedRef,
  });

  await setActiveAgentForConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    subAgentId: targetSubAgentId,
    agentId,
    ref: resolvedRef,
  });

  return {
    success: true,
    systemPrompt,
    modelConfig,
    defaultSubAgentId: targetSubAgentId,
    transferRelations,
    delegateRelations,
  };
}

export async function loadConversationHistoryStep(params: {
  tenantId: string;
  projectId: string;
  conversationId: string;
}): Promise<ModelMessage[]> {
  'use step';

  const { tenantId, projectId, conversationId } = params;

  const dbMessages = await getMessagesByConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    pagination: { page: 1, limit: 100 },
  });

  const sorted = dbMessages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const messages: ModelMessage[] = [];

  for (const msg of sorted) {
    const text = msg.content?.text ?? '';
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: text });
    } else if (msg.role === 'assistant' || msg.role === 'agent') {
      messages.push({ role: 'assistant', content: text });
    }
  }

  return messages;
}

export async function persistAgentResponseStep(params: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  responseText: string;
  subAgentId: string;
}): Promise<void> {
  'use step';

  const { tenantId, projectId, conversationId, responseText, subAgentId } = params;

  await createMessage(runDbClient)({
    id: generateId(),
    tenantId,
    projectId,
    conversationId,
    role: 'assistant',
    content: { text: responseText },
    fromSubAgentId: subAgentId,
  });
}

export async function executeDelegationStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  targetSubAgentId: string;
  message: string;
}): Promise<{ success: boolean; result: string }> {
  'use step';

  const { tenantId, projectId, agentId, targetSubAgentId, message } = params;

  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);
  if (!resolvedRef) {
    return { success: false, result: 'Failed to resolve project ref' };
  }

  const project = await withRef(manageDbPool, resolvedRef, async (db) => {
    return await getFullProjectWithRelationIds(db)({
      scopes: { tenantId, projectId },
    });
  });
  if (!project) {
    return { success: false, result: 'Project not found' };
  }

  const agent = project.agents?.[agentId];
  const subAgent = agent?.subAgents?.[targetSubAgentId];
  if (!subAgent) {
    return { success: false, result: `Sub-agent ${targetSubAgentId} not found` };
  }

  const subAgentModels = subAgent.models;
  const projectModels = project.models;
  const modelSettings = subAgentModels?.base ?? projectModels?.base;
  if (!modelSettings?.model) {
    return { success: false, result: 'No model configured for delegate agent' };
  }

  const { ModelFactory } = await import('@inkeep/agents-core');
  const { generateText } = await import('ai');

  const model = ModelFactory.createModel({
    model: modelSettings.model,
    providerOptions: modelSettings.providerOptions as Record<string, unknown> | undefined,
  });

  const systemPrompt = subAgent.prompt || `You are ${subAgent.name}. ${subAgent.description || ''}`;

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
    maxSteps: 5,
  });

  return { success: true, result: result.text };
}

export async function updateExecutionStatusStep(params: {
  executionId: string;
  status: WorkflowExecutionStatus;
}): Promise<void> {
  'use step';

  await updateWorkflowExecution(runDbClient)({
    id: params.executionId,
    status: params.status,
  });
}
