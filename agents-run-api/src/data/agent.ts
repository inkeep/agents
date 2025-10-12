import type { AgentCard, ExecutionContext } from '@inkeep/agents-core';
import { type AgentSelect, getAgentById, getSubAgentById } from '@inkeep/agents-core';
import type { RegisteredAgent } from '../a2a/types';
import { createTaskHandler, createTaskHandlerConfig } from '../agents/generateTaskHandler';
import dbClient from './db/dbClient';

// Hydrate agent function
async function hydrateAgent({
  dbAgent,
  baseUrl,
  apiKey,
}: {
  dbAgent: AgentSelect;
  baseUrl: string;
  apiKey?: string;
}): Promise<RegisteredAgent> {
  try {
    // Check if defaultSubAgentId exists
    if (!dbAgent.defaultSubAgentId) {
      throw new Error(`Agent ${dbAgent.id} does not have a default agent configured`);
    }

    // Get the default agent for this agent to create the task handler
    const defaultSubAgent = await getSubAgentById(dbClient)({
      scopes: {
        tenantId: dbAgent.tenantId,
        projectId: dbAgent.projectId,
        agentId: dbAgent.id,
      },
      subAgentId: dbAgent.defaultSubAgentId,
    });

    if (!defaultSubAgent) {
      throw new Error(
        `Default agent ${dbAgent.defaultSubAgentId} not found for agent ${dbAgent.id}`
      );
    }

    // Create task handler for the default agent
    const taskHandlerConfig = await createTaskHandlerConfig({
      tenantId: dbAgent.tenantId,
      projectId: dbAgent.projectId,
      agentId: dbAgent.id,
      subAgentId: dbAgent.defaultSubAgentId,
      baseUrl: baseUrl,
      apiKey: apiKey,
    });
    const taskHandler = createTaskHandler(taskHandlerConfig);

    // Create AgentCard for the agent (representing it as a single agent)
    const agentCard: AgentCard = {
      name: dbAgent.name,
      description: dbAgent.description || `Agent agent: ${dbAgent.name}`,
      url: baseUrl ? `${baseUrl}/a2a` : '',
      version: '1.0.0',
      capabilities: {
        streaming: true, // Enable streaming for A2A compliance
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['text', 'text/plain'],
      defaultOutputModes: ['text', 'text/plain'],
      skills: [], // TODO: Could aggregate skills from all agents in the agent
      // Add provider info if available
      ...(baseUrl && {
        provider: {
          organization: 'Inkeep',
          url: baseUrl,
        },
      }),
    };

    return {
      subAgentId: dbAgent.id, // Use agent ID as agent ID for A2A purposes
      tenantId: dbAgent.tenantId,
      projectId: dbAgent.projectId,
      agentId: dbAgent.id,
      agentCard,
      taskHandler,
    };
  } catch (error) {
    console.error(`❌ Failed to hydrate agent ${dbAgent.id}:`, error);
    throw error;
  }
}

// A2A functions that hydrate agent on-demand
export async function getRegisteredAgent(
  executionContext: ExecutionContext
): Promise<RegisteredAgent | null> {
  const { tenantId, projectId, agentId, baseUrl, apiKey } = executionContext;
  const dbAgent = await getAgentById(dbClient)({
    scopes: { tenantId, projectId, agentId },
  });
  if (!dbAgent) {
    return null;
  }

  const agentFrameworkBaseUrl = `${baseUrl}/agents`;

  return hydrateAgent({ dbAgent, baseUrl: agentFrameworkBaseUrl, apiKey });
}
