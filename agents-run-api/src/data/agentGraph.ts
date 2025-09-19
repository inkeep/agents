import type { AgentCard, ExecutionContext } from '@inkeep/agents-core';
import { type AgentGraphSelect, getAgentById, getAgentGraphById } from '@inkeep/agents-core';
import type { RegisteredAgent } from '../a2a/types';
import { createTaskHandler, createTaskHandlerConfig } from '../agents/generateTaskHandler';
import dbClient from './db/dbClient';

// Hydrate graph function
async function hydrateGraph({
  dbGraph,
  baseUrl,
  apiKey,
}: {
  dbGraph: AgentGraphSelect;
  baseUrl: string;
  apiKey?: string;
}): Promise<RegisteredAgent> {
  try {
    // Check if defaultAgentId exists
    if (!dbGraph.defaultAgentId) {
      throw new Error(`Graph ${dbGraph.id} does not have a default agent configured`);
    }

    // Get the default agent for this graph to create the task handler
    const defaultAgent = await getAgentById(dbClient)({
      scopes: {
        tenantId: dbGraph.tenantId,
        projectId: dbGraph.projectId,
        graphId: dbGraph.id,
      },
      agentId: dbGraph.defaultAgentId,
    });

    if (!defaultAgent) {
      throw new Error(`Default agent ${dbGraph.defaultAgentId} not found for graph ${dbGraph.id}`);
    }

    // Create task handler for the default agent
    const taskHandlerConfig = await createTaskHandlerConfig({
      tenantId: dbGraph.tenantId,
      projectId: dbGraph.projectId,
      graphId: dbGraph.id,
      agentId: dbGraph.defaultAgentId,
      baseUrl: baseUrl,
      apiKey: apiKey,
    });
    const taskHandler = createTaskHandler(taskHandlerConfig);

    // Create AgentCard for the graph (representing it as a single agent)
    const agentCard: AgentCard = {
      name: dbGraph.name,
      description: dbGraph.description || `Agent graph: ${dbGraph.name}`,
      url: baseUrl ? `${baseUrl}/a2a` : '',
      version: '1.0.0',
      capabilities: {
        streaming: true, // Enable streaming for A2A compliance
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['text', 'text/plain'],
      defaultOutputModes: ['text', 'text/plain'],
      skills: [], // TODO: Could aggregate skills from all agents in the graph
      // Add provider info if available
      ...(baseUrl && {
        provider: {
          organization: 'Inkeep',
          url: baseUrl,
        },
      }),
    };

    return {
      agentId: dbGraph.id, // Use graph ID as agent ID for A2A purposes
      tenantId: dbGraph.tenantId,
      projectId: dbGraph.projectId,
      graphId: dbGraph.id,
      agentCard,
      taskHandler,
    };
  } catch (error) {
    console.error(`❌ Failed to hydrate graph ${dbGraph.id}:`, error);
    throw error;
  }
}

// A2A functions that hydrate graphs on-demand
export async function getRegisteredGraph(
  executionContext: ExecutionContext
): Promise<RegisteredAgent | null> {
  const { tenantId, projectId, graphId, baseUrl, apiKey } = executionContext;
  const dbGraph = await getAgentGraphById(dbClient)({ scopes: { tenantId, projectId, graphId } });
  if (!dbGraph) {
    return null;
  }

  const agentFrameworkBaseUrl = `${baseUrl}/agents`;

  return hydrateGraph({ dbGraph, baseUrl: agentFrameworkBaseUrl, apiKey });
}
