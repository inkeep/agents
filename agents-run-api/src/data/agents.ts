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
import { categorizeRelations, generateEnhancedDescription, type CombinedRelationInfo } from '../utils/agent-description-formatter';
import dbClient from './db/dbClient';

// Agent hydration functions

const logger = getLogger('agents');

/**
 * Create an AgentCard from database agent data with enhanced description
 * Reusable function that standardizes agent card creation across the codebase
 */
export async function createAgentCard({
  dbAgent,
  graphId,
  baseUrl,
  preComputedRelations,
}: {
  dbAgent: AgentSelect;
  graphId: string;
  baseUrl: string;
  preComputedRelations?: {
    internalRelations: CombinedRelationInfo[];
    externalRelations: CombinedRelationInfo[];
  };
}): Promise<AgentCard> {
  // Generate enhanced description with transfer/delegation information
  const baseDescription = dbAgent.description || 'AI Agent';
  const enhancedDescription = await generateDescriptionWithTransfers(
    baseDescription,
    dbAgent,
    graphId,
    preComputedRelations
  );

  // Create AgentCard from database data using schema.ts types
  return {
    name: dbAgent.name,
    description: enhancedDescription,
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
 * This shows direct connections only (not the full transfer graph)
 * 
 * @param baseDescription - The base description of the agent
 * @param dbAgent - The database agent record
 * @param graphId - The graph ID
 * @param preComputedRelations - Optional pre-computed relations to avoid redundant DB calls
 */
export async function generateDescriptionWithTransfers(
  baseDescription: string,
  dbAgent: AgentSelect,
  graphId: string,
  preComputedRelations?: {
    internalRelations: CombinedRelationInfo[];
    externalRelations: CombinedRelationInfo[];
  }
): Promise<string> {
  try {
    let internalRelations: CombinedRelationInfo[];
    let externalRelations: CombinedRelationInfo[];

    if (preComputedRelations) {
      // Use pre-computed relations to avoid redundant database calls
      ({ internalRelations, externalRelations } = preComputedRelations);
    } else {
      // Fallback to fetching relations from database
    const relatedAgents = await getRelatedAgentsForGraph(dbClient)({
      scopes: { tenantId: dbAgent.tenantId, projectId: dbAgent.projectId },
      graphId,
      agentId: dbAgent.id,
    });
      ({ internalRelations, externalRelations } = relatedAgents);
    }

    // Use shared utility to categorize and format relations
    const { transfers, delegates } = categorizeRelations(internalRelations, externalRelations);
    return generateEnhancedDescription(baseDescription, transfers, delegates);
  } catch (error) {
    logger.warn(
      {
        agentId: dbAgent.id,
        graphId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to generate enhanced description with transfers, using base description'
    );
    return baseDescription;
  }
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
    const agentCard = await createAgentCard({
      dbAgent,
      graphId,
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
    scopes: { tenantId, projectId },
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
