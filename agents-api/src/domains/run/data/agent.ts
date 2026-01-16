import type {
  AgentCard,
  AgentWithinContextOfProjectSelectWithRelationIds,
  FullExecutionContext,
} from '@inkeep/agents-core';
import { getAgentFromProject, getSubAgentFromProject } from '../utils/project';
import type { RegisteredAgent } from '../a2a/types';
import { createTaskHandler, createTaskHandlerConfig } from '../agents/generateTaskHandler';

// Hydrate agent function
async function hydrateAgent({
  dbAgent,
  executionContext,
  baseUrl,
}: {
  dbAgent: AgentWithinContextOfProjectSelectWithRelationIds;
  executionContext: FullExecutionContext;
  baseUrl: string;
}): Promise<RegisteredAgent> {
  const { tenantId, projectId, agentId, project, resolvedRef, apiKey } = executionContext;
  try {
    // Check if defaultSubAgentId exists
    if (!dbAgent.defaultSubAgentId) {
      throw new Error(`Agent ${dbAgent.id} does not have a default agent configured`);
    }

    // Get the default agent for this agent to create the task handler
    const subAgentId = dbAgent.defaultSubAgentId;
    const defaultSubAgent = getSubAgentFromProject({ project, agentId, subAgentId });

    if (!defaultSubAgent) {
      throw new Error(
        `Default agent ${dbAgent.defaultSubAgentId} not found for agent ${dbAgent.id}`
      );
    }

    // Create task handler for the default agent
    const taskHandlerConfig = await createTaskHandlerConfig({
      executionContext,
      subAgentId: dbAgent.defaultSubAgentId,
      baseUrl,
      apiKey,
    });
    const taskHandler = createTaskHandler(taskHandlerConfig);

    // Create AgentCard for the agent (representing it as a single agent)
    const agentCard: AgentCard = {
      name: dbAgent.name,
      description: dbAgent.description || `Agent: ${dbAgent.name}`,
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
      subAgentId: dbAgent.id,
      tenantId,
      projectId,
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
  executionContext: FullExecutionContext
): Promise<RegisteredAgent | null> {
  const { project, agentId, baseUrl } = executionContext;
  const dbAgent = getAgentFromProject({ project, agentId });
  if (!dbAgent) {
    return null;
  }

  const agentFrameworkBaseUrl = `${baseUrl}/run/agents`;

  return hydrateAgent({ dbAgent, executionContext, baseUrl: agentFrameworkBaseUrl });
}
