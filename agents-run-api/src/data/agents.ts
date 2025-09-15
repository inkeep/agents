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
 * Generate an enhanced description that includes transfer and delegation information
 * This shows direct connections only (not the full transfer graph)
 */
export async function generateDescriptionWithTransfers(
  baseDescription: string,
  dbAgent: AgentSelect,
  graphId: string
): Promise<string> {
  try {
    // Get related agents for this agent in the graph
    const relatedAgents = await getRelatedAgentsForGraph(dbClient)({
      scopes: { tenantId: dbAgent.tenantId, projectId: dbAgent.projectId },
      graphId,
      agentId: dbAgent.id,
    });

    const { internalRelations, externalRelations } = relatedAgents;

    // Group by relation type
    const transfers = [
      ...internalRelations.filter((rel) => rel.relationType === 'transfer'),
      ...externalRelations.filter((rel) => rel.relationType === 'transfer'),
    ];

    const delegates = [
      ...internalRelations.filter((rel) => rel.relationType === 'delegate'),
      ...externalRelations.filter((rel) => rel.relationType === 'delegate'),
    ];

    if (transfers.length === 0 && delegates.length === 0) {
      return baseDescription;
    }

    let connectionInfo = '';

    // Add transfer information
    if (transfers.length > 0) {
      const transferList = transfers
        .map((relation: any) => {
          // Handle both internal and external relations
          if ('externalAgent' in relation && relation.externalAgent) {
            const { name, description } = relation.externalAgent;
            return `- ${name}: ${description || ''}`;
          } else if ('name' in relation) {
            const { name, description } = relation;
            return `- ${name}: ${description || ''}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
      connectionInfo += `\n\nCan transfer to:\n${transferList}`;
    }

    // Add delegation information
    if (delegates.length > 0) {
      const delegateList = delegates
        .map((relation: any) => {
          // Handle both internal and external relations
          if ('externalAgent' in relation && relation.externalAgent) {
            const { name, description } = relation.externalAgent;
            return `- ${name}: ${description || ''}`;
          } else if ('name' in relation) {
            const { name, description } = relation;
            return `- ${name}: ${description || ''}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
      connectionInfo += `\n\nCan delegate to:\n${delegateList}`;
    }

    return baseDescription + connectionInfo;
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

    // Generate enhanced description with transfer/delegation information
    const baseDescription = dbAgent.description || 'AI Agent';
    const enhancedDescription = await generateDescriptionWithTransfers(
      baseDescription,
      dbAgent,
      graphId
    );

    // Create AgentCard from database data using schema.ts types
    const agentCard: AgentCard = {
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
