import type { AgentCard, ExecutionContext } from '@inkeep/agents-core';
import { type AgentSelect, getAgentById, getSubAgentById } from '@inkeep/agents-core';
import type { RegisteredAgent } from '../a2a/types';
import { createTaskHandler, createTaskHandlerConfig } from '../agents/generateTaskHandler';
import dbClient from './db/dbClient';

// Hydrate agent function
async function hydrateGraph({
  dbGraph,
  baseUrl,
  apiKey,
}: {
  dbGraph: AgentSelect;
  baseUrl: string;
  apiKey?: string;
}): Promise<RegisteredAgent> {
  try {
    // Check if defaultSubAgentId exists
    if (!dbGraph.defaultSubAgentId) {
      throw new Error(`Agent ${dbGraph.id} does not have a default agent configured`);
    }

    // Get the default agent for this agent to create the task handler
    const defaultSubAgent = await getSubAgentById(dbClient)({
      scopes: {
        tenantId: dbGraph.tenantId,
        projectId: dbGraph.projectId,
        agentId: dbGraph.id,
      },
      subAgentId: dbGraph.defaultSubAgentId,
    });

    if (!defaultSubAgent) {
      throw new Error(
        `Default agent ${dbGraph.defaultSubAgentId} not found for agent ${dbGraph.id}`
      );
    }

    // Create task handler for the default agent
    const taskHandlerConfig = await createTaskHandlerConfig({
      tenantId: dbGraph.tenantId,
      projectId: dbGraph.projectId,
      agentId: dbGraph.id,
      subAgentId: dbGraph.defaultSubAgentId,
      baseUrl: baseUrl,
      apiKey: apiKey,
    });
    const taskHandler = createTaskHandler(taskHandlerConfig);

    // Create AgentCard for the agent (representing it as a single agent)
    const agentCard: AgentCard = {
      name: dbGraph.name,
      description: dbGraph.description || `Agent agent: ${dbGraph.name}`,
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
      subAgentId: dbGraph.id, // Use agent ID as agent ID for A2A purposes
      tenantId: dbGraph.tenantId,
      projectId: dbGraph.projectId,
      agentId: dbGraph.id,
      agentCard,
      taskHandler,
    };
  } catch (error) {
    console.error(`❌ Failed to hydrate agent ${dbGraph.id}:`, error);
    throw error;
  }
}

// A2A functions that hydrate agent on-demand
export async function getRegisteredAgent(
  executionContext: ExecutionContext
): Promise<RegisteredAgent | null> {
  const { tenantId, projectId, agentId, baseUrl, apiKey } = executionContext;
  const dbGraph = await getAgentById(dbClient)({
    scopes: { tenantId, projectId, agentId },
  });
  if (!dbGraph) {
    return null;
  }

  const agentFrameworkBaseUrl = `${baseUrl}/agents`;

  return hydrateGraph({ dbGraph, baseUrl: agentFrameworkBaseUrl, apiKey });
}
