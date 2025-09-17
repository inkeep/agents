import {
  type AgentSelect,
  type CredentialStoreRegistry,
  type ExecutionContext,
  getAgentById,
  getLogger,
  getRelatedAgentsForGraph,
} from '@inkeep/agents-core';
import type { AgentCard, RegisteredAgent } from '../a2a/types';
import { createTaskHandler, createTaskHandlerConfig } from '../agents/generateTaskHandler';
import dbClient from './db/dbClient';

// Agent hydration functions

const logger = getLogger('agents');

/**
 * Create an AgentCard from database agent data
 * Reusable function that standardizes agent card creation across the codebase
 * Used for external discovery via /.well-known/agent.json endpoint
 */
export function createAgentCard({
  dbAgent,
  baseUrl,
}: {
  dbAgent: AgentSelect;
  baseUrl: string;
}): AgentCard {
  // Use the agent's base description for external discovery
  // External systems don't need to know about internal transfer/delegate capabilities
  const description = dbAgent.description || 'AI Agent';

  // Create AgentCard from database data using schema.ts types
  return {
    name: dbAgent.name,
    description,
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
}

/**
 * Generate an enhanced description that includes transfer and delegation information
 * Used in generateTaskHandler to help agents understand what other agents can do
 *
 * @param baseDescription - The base description of the agent
 * @param internalRelations - Pre-computed internal relations
 * @param externalRelations - Pre-computed external relations
 */
export function generateDescriptionWithTransfers(
  baseDescription: string,
  internalRelations: any[],
  externalRelations: any[]
): string {
  // Filter relations by type
  const transfers = [
    ...internalRelations.filter((rel) => rel.relationType === 'transfer'),
    ...externalRelations.filter((rel) => rel.relationType === 'transfer'),
  ];

  const delegates = [
    ...internalRelations.filter((rel) => rel.relationType === 'delegate'),
    ...externalRelations.filter((rel) => rel.relationType === 'delegate'),
  ];

  // If no relations, return base description
  if (transfers.length === 0 && delegates.length === 0) {
    return baseDescription;
  }

  let enhancedDescription = baseDescription;

  // Add transfer information
  if (transfers.length > 0) {
    const transferList = transfers
      .map((rel) => {
        const name = rel.externalAgent?.name || rel.name;
        const desc = rel.externalAgent?.description || rel.description || '';
        return `- ${name}: ${desc}`;
      })
      .join('\n');
    enhancedDescription += `\n\nCan transfer to:\n${transferList}`;
  }

  // Add delegation information
  if (delegates.length > 0) {
    const delegateList = delegates
      .map((rel) => {
        const name = rel.externalAgent?.name || rel.name;
        const desc = rel.externalAgent?.description || rel.description || '';
        return `- ${name}: ${desc}`;
      })
      .join('\n');
    enhancedDescription += `\n\nCan delegate to:\n${delegateList}`;
  }

  return enhancedDescription;
}
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

    // Use the reusable agent card creation function
    const agentCard = createAgentCard({
      dbAgent,
      baseUrl,
    });

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
  const { tenantId, projectId, graphId, agentId, baseUrl, apiKey } = executionContext;

  if (!agentId) {
    throw new Error('Agent ID is required');
  }

  const dbAgent = await getAgentById(dbClient)({
    scopes: { tenantId, projectId, graphId: graphId },
    agentId,
  });
  if (!dbAgent) {
    return null;
  }

  const agentFrameworkBaseUrl = `${baseUrl}/agents`;

  return hydrateAgent({
    dbAgent,
    graphId,
    baseUrl: agentFrameworkBaseUrl,
    credentialStoreRegistry,
    apiKey,
  });
}
