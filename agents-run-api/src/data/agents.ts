import type { AgentCard, RegisteredAgent } from '../a2a/types.js';
import { createTaskHandler, createTaskHandlerConfig } from '../agents/generateTaskHandler.js';
import dbClient from './db/dbClient.js';
import {
  type AgentSelect,
  ExecutionContext,
  getAgentById,
  listAgents,
  getLogger,
  CredentialStoreRegistry,
} from '@inkeep/agents-core';

// Agent hydration functions

const logger = getLogger('agents');
/**
 * Create a RegisteredAgent from database agent data
 * Hydrates agent directly from database schema using types from schema.ts
 */
async function hydrateAgent({
  dbAgent,
  graphId,
  baseUrl,
  apiKey,
  credentialStoreRegistry,
}: {
  dbAgent: AgentSelect;
  graphId: string;
  baseUrl: string;
  apiKey?: string;
  credentialStoreRegistry?: CredentialStoreRegistry;
}): Promise<RegisteredAgent> {
  try {
    // Create task handler for the agent
    const taskHandlerConfig = await createTaskHandlerConfig({
      tenantId: dbAgent.tenantId,
      projectId: dbAgent.projectId,
      graphId: graphId,
      agentId: dbAgent.id,
      baseUrl: baseUrl,
      apiKey: apiKey,
    });
    const taskHandler = createTaskHandler(taskHandlerConfig, credentialStoreRegistry);

    // Create AgentCard from database data using schema.ts types
    const agentCard: AgentCard = {
      name: dbAgent.name,
      description: dbAgent.description || 'AI Agent',
      url: baseUrl ? `${baseUrl}/a2a` : '',
      version: '1.0.0',
      capabilities: {
        streaming: true, // Enable streaming for A2A compliance
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['text', 'text/plain'],
      defaultOutputModes: ['text', 'text/plain'],
      skills: [],
      // Add provider info if available
      ...(baseUrl && {
        provider: {
          organization: 'Inkeep',
          url: baseUrl,
        },
      }),
    };

    return {
      agentId: dbAgent.id,
      tenantId: dbAgent.tenantId,
      projectId: dbAgent.projectId,
      graphId,
      agentCard,
      taskHandler,
    };
  } catch (error) {
    console.error(`❌ Failed to hydrate agent ${dbAgent.id}:`, error);
    throw error;
  }
}

// A2A functions that hydrate agents on-demand

export async function getRegisteredAgent(
  executionContext: ExecutionContext,
  credentialStoreRegistry?: CredentialStoreRegistry
): Promise<RegisteredAgent | null> {
  const { tenantId, projectId, graphId, agentId, baseUrl } = executionContext;

  if (!agentId) {
    throw new Error('Agent ID is required');
  }
  const dbAgent = await getAgentById(dbClient)({
    scopes: { tenantId, projectId },
    agentId,
  });
  if (!dbAgent) {
    return null;
  }

  const agentFrameworkBaseUrl = `${baseUrl}/agents`;

  return hydrateAgent({ dbAgent, graphId, baseUrl: agentFrameworkBaseUrl, credentialStoreRegistry });
}
