/**
 * Step: Execute the scheduled trigger (runs the agent)
 *
 * This step has full Node.js access and handles the actual agent execution.
 */
import type { FullExecutionContext, Part, ResolvedRef } from '@inkeep/agents-core';
import {
  createMessage,
  createOrGetConversation,
  generateId,
  getFullProjectWithRelationIds,
  getProjectScopedRef,
  interpolateTemplate,
  resolveRef,
  setActiveAgentForConversation,
  withRef,
} from '@inkeep/agents-core';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { ExecutionHandler } from '../../handlers/executionHandler';
import { createSSEStreamHelper } from '../../utils/stream-helpers';
import { manageDbClient } from 'src/data/db';

const logger = getLogger('workflow-execute-scheduled-trigger');

type ExecuteScheduledTriggerParams = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  messageTemplate?: string | null;
  payload?: Record<string, unknown> | null;
  timeoutSeconds: number;
};

type ExecuteScheduledTriggerResult = {
  conversationId: string;
  success: boolean;
};

/**
 * Execute the scheduled trigger - runs the agent with the configured message.
 */
export async function executeScheduledTrigger(
  params: ExecuteScheduledTriggerParams
): Promise<ExecuteScheduledTriggerResult> {
  'use step';

  const {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    invocationId,
    messageTemplate,
    payload,
    timeoutSeconds,
  } = params;

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
    'Executing scheduled trigger'
  );

  // Get ref for the project
  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    throw new Error(`Failed to resolve ref for project ${projectId}`);
  }

  // Load project to get agent configuration
  const project = await withRef(manageDbPool, resolvedRef, async (db) => {
    return await getFullProjectWithRelationIds(db)({
      scopes: { tenantId, projectId },
    });
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Find the agent's default sub-agent
  const agent = project.agents?.[agentId];
  if (!agent) {
    throw new Error(`Agent ${agentId} not found in project`);
  }

  const defaultSubAgentId = agent.defaultSubAgentId;
  if (!defaultSubAgentId) {
    throw new Error(`Agent ${agentId} has no default sub-agent configured`);
  }

  // Generate message from template or use default
  let userMessage: string;
  if (messageTemplate && payload) {
    userMessage = interpolateTemplate(messageTemplate, payload);
  } else if (messageTemplate) {
    userMessage = messageTemplate;
  } else {
    userMessage = 'Scheduled trigger execution';
  }

  // Create message parts
  const messageParts: Part[] = [{ kind: 'text', text: userMessage }];

  // Create conversation
  const conversationId = generateId();

  await createOrGetConversation(runDbClient)({
    id: conversationId,
    tenantId,
    projectId,
    agentId,
    activeSubAgentId: defaultSubAgentId,
    ref: resolvedRef,
  });

  await setActiveAgentForConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    subAgentId: defaultSubAgentId,
    agentId,
    ref: resolvedRef,
  });

  // Create the user message
  await createMessage(runDbClient)({
    id: generateId(),
    tenantId,
    projectId,
    conversationId,
    role: 'user',
    content: {
      text: userMessage,
      parts: messageParts,
    },
    metadata: {
      a2a_metadata: {
        scheduledTriggerId,
        invocationId,
      },
    },
  });

  // Build execution context
  const executionContext: FullExecutionContext = {
    tenantId,
    projectId,
    agentId,
    baseUrl: env.INKEEP_AGENTS_API_URL || 'http://localhost:3002',
    apiKey: env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '',
    apiKeyId: 'scheduled-trigger-invocation',
    resolvedRef,
    project,
    metadata: {
      initiatedBy: {
        type: 'api_key',
        id: scheduledTriggerId,
      },
    },
  };

  const requestId = `scheduled-${invocationId}`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Create no-op stream helper (we're not streaming to client)
  const noOpStreamHelper = createSSEStreamHelper(
    {
      writeSSE: async () => {},
      sleep: async () => {},
    },
    requestId,
    timestamp
  );

  // Execute the agent
  const executionHandler = new ExecutionHandler();
  await executionHandler.execute({
    executionContext,
    conversationId,
    userMessage,
    messageParts,
    initialAgentId: agentId,
    requestId,
    sseHelper: noOpStreamHelper,
    emitOperations: false,
  });

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, invocationId, conversationId },
    'Scheduled trigger execution completed'
  );

  return {
    conversationId,
    success: true,
  };
}
