import {
  type AgentApiSelect,
  type AgentConversationHistoryConfig,
  type CredentialStoreRegistry,
  dbResultToMcpTool,
  getAgentById,
  getAgentGraphById,
  getArtifactComponentsForAgent,
  getDataComponentsForAgent,
  getRelatedAgentsForGraph,
  getToolsForAgent,
  type McpTool,
  type Part,
  TaskState,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import type { A2ATask, A2ATaskResult } from '../a2a/types';
import { generateDescriptionWithTransfers } from '../data/agents';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { resolveModelConfig } from '../utils/model-resolver';
import { Agent } from './Agent';
import { toolSessionManager } from './ToolSessionManager';

const logger = getLogger('generateTaskHandler');

/**
 * Serializable configuration for creating task handlers
 */
export interface TaskHandlerConfig {
  tenantId: string;
  projectId: string;
  graphId: string;
  agentId: string;
  agentSchema: AgentApiSelect;
  name: string;
  baseUrl: string;
  apiKey?: string;
  description?: string;
  contextConfigId?: string;
  conversationHistoryConfig?: AgentConversationHistoryConfig;
}

export const createTaskHandler = (
  config: TaskHandlerConfig,
  credentialStoreRegistry?: CredentialStoreRegistry
) => {
  return async (task: A2ATask): Promise<A2ATaskResult> => {
    try {
      // Extract the user message from the task
      const userMessage = task.input.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join(' ');

      if (!userMessage.trim()) {
        return {
          status: {
            state: TaskState.Failed,
            message: 'No text content found in task input',
          },
          artifacts: [],
        };
      }

      const [
        { internalRelations, externalRelations },
        toolsForAgent,
        dataComponents,
        artifactComponents,
      ] = await Promise.all([
        getRelatedAgentsForGraph(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            graphId: config.graphId,
          },
          agentId: config.agentId,
        }),
        getToolsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            graphId: config.graphId,
            agentId: config.agentId,
          },
        }),
        getDataComponentsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            graphId: config.graphId,
            agentId: config.agentId,
          },
        }),
        getArtifactComponentsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            graphId: config.graphId,
            agentId: config.agentId,
          },
        }),
      ]);

      logger.info({ toolsForAgent, internalRelations, externalRelations }, 'agent stuff');

      // Enhance internal relation descriptions with their transfer/delegation info
      // This allows agents to see the full capability graph for routing decisions
      // We batch the operations to be more efficient than the original N+1 approach
      const enhancedInternalRelations = await Promise.all(
        internalRelations.map(async (relation) => {
          try {
            const relatedAgent = await getAgentById(dbClient)({
              scopes: {
                tenantId: config.tenantId,
                projectId: config.projectId,
                graphId: config.graphId,
              },
              agentId: relation.id,
            });
            if (relatedAgent) {
              // Get this agent's relations for enhanced description
              const relatedAgentRelations = await getRelatedAgentsForGraph(dbClient)({
                scopes: {
                  tenantId: config.tenantId,
                  projectId: config.projectId,
                  graphId: config.graphId,
                },
                agentId: relation.id,
              });

              // Use the optimized version that accepts pre-computed relations
              const enhancedDescription = generateDescriptionWithTransfers(
                relation.description || '',
                relatedAgentRelations.internalRelations,
                relatedAgentRelations.externalRelations
              );
              return { ...relation, description: enhancedDescription };
            }
          } catch (error) {
            logger.warn({ agentId: relation.id, error }, 'Failed to enhance agent description');
          }
          return relation;
        })
      );

      // Check if this is an internal agent (has prompt)
      const agentPrompt = 'prompt' in config.agentSchema ? config.agentSchema.prompt : '';
      const models = 'models' in config.agentSchema ? config.agentSchema.models : undefined;
      const stopWhen = 'stopWhen' in config.agentSchema ? config.agentSchema.stopWhen : undefined;

      const toolsForAgentResult: McpTool[] =
        (await Promise.all(
          toolsForAgent.data.map(
            async (item) => await dbResultToMcpTool(item.tool, dbClient, credentialStoreRegistry)
          )
        )) ?? [];

      const agent = new Agent(
        {
          id: config.agentId,
          tenantId: config.tenantId,
          projectId: config.projectId,
          graphId: config.graphId,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          name: config.name,
          description: config.description || '',
          agentPrompt,
          models: models || undefined,
          stopWhen: stopWhen || undefined,
          agentRelations: enhancedInternalRelations.map((relation) => ({
            id: relation.id,
            tenantId: config.tenantId,
            projectId: config.projectId,
            graphId: config.graphId,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            name: relation.name,
            description: relation.description,
            agentPrompt: '',
            delegateRelations: [],
            agentRelations: [],
            transferRelations: [],
          })),
          transferRelations: enhancedInternalRelations
            .filter((relation) => relation.relationType === 'transfer')
            .map((relation) => ({
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              id: relation.id,
              tenantId: config.tenantId,
              projectId: config.projectId,
              graphId: config.graphId,
              name: relation.name,
              description: relation.description,
              agentPrompt: '',
              delegateRelations: [],
              agentRelations: [],
              transferRelations: [],
            })),
          delegateRelations: [
            // Internal delegate relations
            ...enhancedInternalRelations
              .filter((relation) => relation.relationType === 'delegate')
              .map((relation) => ({
                type: 'internal' as const,
                config: {
                  id: relation.id,
                  tenantId: config.tenantId,
                  projectId: config.projectId,
                  graphId: config.graphId,
                  baseUrl: config.baseUrl,
                  apiKey: config.apiKey,
                  name: relation.name,
                  description: relation.description,
                  agentPrompt: '',
                  delegateRelations: [],
                  agentRelations: [],
                  transferRelations: [],
                },
              })),
            // External delegate relations
            ...externalRelations.map((relation) => ({
              type: 'external' as const,
              config: {
                id: relation.externalAgent.id,
                name: relation.externalAgent.name,
                description: relation.externalAgent.description || '',
                baseUrl: relation.externalAgent.baseUrl,
                relationType: relation.relationType || undefined,
              },
            })),
          ],
          tools: toolsForAgentResult,
          functionTools: [], // All tools are now handled via MCP servers
          dataComponents: dataComponents,
          artifactComponents: artifactComponents,
          contextConfigId: config.contextConfigId || undefined,
          conversationHistoryConfig: config.conversationHistoryConfig,
        },
        credentialStoreRegistry
      );

      // More robust contextId resolution for delegation scenarios
      let contextId = task.context?.conversationId;

      // If contextId is not set in task.context, try to extract it from the task.id
      // Many tasks are created with IDs like "task_math-demo-123456-chatcmpl-789"
      if (!contextId || contextId === 'default' || contextId === '') {
        const taskIdMatch = task.id.match(/^task_([^-]+-[^-]+-\d+)-/);
        if (taskIdMatch) {
          contextId = taskIdMatch[1];
          logger.info(
            {
              taskId: task.id,
              extractedContextId: contextId,
              agentId: config.agentId,
            },
            'Extracted contextId from task ID for delegation'
          );
        } else {
          contextId = 'default';
        }
      }

      // Extract streaming context from task metadata and get streamHelper from registry
      const streamRequestId =
        task.context?.metadata?.stream_request_id || task.context?.metadata?.streamRequestId;

      // Check if this is a delegation - delegated agents should not stream to user
      const isDelegation = task.context?.metadata?.isDelegation === true;
      agent.setDelegationStatus(isDelegation);
      if (isDelegation) {
        logger.info(
          { agentId: config.agentId, taskId: task.id },
          'Delegated agent - streaming disabled'
        );

        // Ensure ToolSession exists for delegated agents
        // Use streamRequestId as sessionId to match the parent GraphSession
        if (streamRequestId && config.tenantId && config.projectId) {
          toolSessionManager.ensureGraphSession(
            streamRequestId,
            config.tenantId,
            config.projectId,
            contextId,
            task.id
          );
        }
      }

      const response = await agent.generate(userMessage, {
        contextId,
        metadata: {
          conversationId: contextId,
          taskId: task.id,
          threadId: contextId, // using conversationId as threadId for now
          streamRequestId: streamRequestId,
          ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        },
      });

      // Process steps to extract tool calls and results from content arrays
      const stepContents =
        response.steps && Array.isArray(response.steps)
          ? response.steps.flatMap((step: any) => {
              return step.content && Array.isArray(step.content) ? step.content : [];
            })
          : [];

      const allToolCalls = stepContents.filter((content: any) => content.type === 'tool-call');
      const allToolResults = stepContents.filter((content: any) => content.type === 'tool-result');
      const allThoughts = stepContents.filter((content: any) => content.type === 'text');

      if (allToolCalls.length > 0) {
        for (const toolCall of allToolCalls) {
          // Check for transfer tool calls (we support multiple patterns)
          if (
            toolCall.toolName.includes('transfer') ||
            toolCall.toolName.includes('transferToRefundAgent')
          ) {
            // Look for the tool result
            const toolResult = allToolResults.find(
              (result: any) => result.toolCallId === toolCall.toolCallId
            );

            // Validate transfer result with proper type checking
            const isValidTransferResult = (
              output: unknown
            ): output is {
              type: 'transfer';
              target: string;
            } => {
              return (
                typeof output === 'object' &&
                output !== null &&
                'type' in output &&
                'target' in output &&
                (output as any).type === 'transfer' &&
                typeof (output as any).target === 'string' &&
                ((output as any).reason === undefined || typeof (output as any).reason === 'string')
              );
            };

            //In the agent.generate response, response.text is not always populated. In that case, use allThoughts to get the last text part found in the steps array.
            const responseText =
              (response as any).text ||
              ((response as any).object ? JSON.stringify((response as any).object) : '');
            const transferReason =
              responseText ||
              allThoughts[allThoughts.length - 1]?.text ||
              'Agent requested transfer. No reason provided.';

            if (toolResult?.output && isValidTransferResult(toolResult.output)) {
              const transferResult = toolResult.output;

              // Return transfer indication in A2A format
              return {
                status: {
                  state: TaskState.Completed,
                  message: `Transfer requested to ${transferResult.target}`,
                },
                artifacts: [
                  {
                    artifactId: nanoid(),
                    parts: [
                      {
                        kind: 'data',
                        data: {
                          type: 'transfer',
                          target: transferResult.target,
                          task_id: task.id,
                          reason: transferReason,
                          original_message: userMessage,
                        },
                      },
                    ],
                  },
                ],
              };
            }
          }
        }
      }

      // Use formatted content parts if available, otherwise fall back to response.text
      const parts: Part[] = (response.formattedContent?.parts || []).map((part: any) => ({
        kind: part.kind as 'text' | 'data',
        ...(part.kind === 'text' && { text: part.text }),
        ...(part.kind === 'data' && { data: part.data }),
      }));

      return {
        status: { state: TaskState.Completed },
        artifacts: [
          {
            artifactId: nanoid(),
            parts,
          },
        ],
      };
    } catch (error) {
      console.error('Task handler error:', error);

      return {
        status: {
          state: TaskState.Failed,
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
        artifacts: [],
      };
    }
  };
};

/**
 * Serializes a TaskHandlerConfig to JSON
 */
export const serializeTaskHandlerConfig = (config: TaskHandlerConfig): string => {
  return JSON.stringify(config, null, 2);
};

/**
 * Deserializes a TaskHandlerConfig from JSON
 */
export const deserializeTaskHandlerConfig = (configJson: string): TaskHandlerConfig => {
  return JSON.parse(configJson) as TaskHandlerConfig;
};

/**
 * Creates a task handler configuration from agent data
 */
export const createTaskHandlerConfig = async (params: {
  tenantId: string;
  projectId: string;
  graphId: string;
  agentId: string;
  baseUrl: string;
  apiKey?: string;
}): Promise<TaskHandlerConfig> => {
  const agent = await getAgentById(dbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      graphId: params.graphId,
    },
    agentId: params.agentId,
  });

  const agentGraph = await getAgentGraphById(dbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      graphId: params.graphId,
    },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${params.agentId}`);
  }

  // Inherit graph models if agent doesn't have one
  const effectiveModels = await resolveModelConfig(params.graphId, agent);
  const effectiveConversationHistoryConfig = agent.conversationHistoryConfig || { mode: 'full' };

  return {
    tenantId: params.tenantId,
    projectId: params.projectId,
    graphId: params.graphId,
    agentId: params.agentId,
    agentSchema: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      prompt: agent.prompt,
      models: effectiveModels,
      conversationHistoryConfig: effectiveConversationHistoryConfig || null,
      stopWhen: agent.stopWhen || null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    },
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    name: agent.name,
    description: agent.description,
    conversationHistoryConfig: effectiveConversationHistoryConfig as AgentConversationHistoryConfig,
    contextConfigId: agentGraph?.contextConfigId || undefined,
  };
};
