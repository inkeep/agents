import {
  type AgentConversationHistoryConfig,
  type CredentialStoreRegistry,
  dbResultToMcpTool,
  getAgentById,
  getArtifactComponentsForAgent,
  getDataComponentsForAgent,
  getRelatedAgentsForAgent,
  getSubAgentById,
  getToolsForAgent,
  type McpTool,
  type Part,
  type SubAgentApiSelect,
  TaskState,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import type { A2ATask, A2ATaskResult } from '../a2a/types';
import { generateDescriptionWithTransfers } from '../data/agents';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { agentSessionManager } from '../services/AgentSession';
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
  agentId: string;
  subAgentId: string;
  agentSchema: SubAgentApiSelect;
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
        getRelatedAgentsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            agentId: config.agentId,
          },
          subAgentId: config.subAgentId,
        }),
        getToolsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            agentId: config.agentId,
            subAgentId: config.subAgentId,
          },
        }),
        getDataComponentsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            agentId: config.agentId,
            subAgentId: config.subAgentId,
          },
        }),
        getArtifactComponentsForAgent(dbClient)({
          scopes: {
            tenantId: config.tenantId,
            projectId: config.projectId,
            agentId: config.agentId,
            subAgentId: config.subAgentId,
          },
        }),
      ]);

      logger.info({ toolsForAgent, internalRelations, externalRelations }, 'agent stuff');

      const enhancedInternalRelations = await Promise.all(
        internalRelations.map(async (relation) => {
          try {
            const relatedAgent = await getSubAgentById(dbClient)({
              scopes: {
                tenantId: config.tenantId,
                projectId: config.projectId,
                agentId: config.agentId,
              },
              subAgentId: relation.id,
            });
            if (relatedAgent) {
              const relatedAgentRelations = await getRelatedAgentsForAgent(dbClient)({
                scopes: {
                  tenantId: config.tenantId,
                  projectId: config.projectId,
                  agentId: config.agentId,
                },
                subAgentId: relation.id,
              });

              const enhancedDescription = generateDescriptionWithTransfers(
                relation.description || '',
                relatedAgentRelations.internalRelations,
                relatedAgentRelations.externalRelations
              );
              return { ...relation, description: enhancedDescription };
            }
          } catch (error) {
            logger.warn({ subAgentId: relation.id, error }, 'Failed to enhance agent description');
          }
          return relation;
        })
      );

      const prompt = 'prompt' in config.agentSchema ? config.agentSchema.prompt : '';
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
          id: config.subAgentId,
          tenantId: config.tenantId,
          projectId: config.projectId,
          agentId: config.agentId,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          name: config.name,
          description: config.description || '',
          prompt,
          models: models || undefined,
          stopWhen: stopWhen || undefined,
          subAgentRelations: enhancedInternalRelations.map((relation) => ({
            id: relation.id,
            tenantId: config.tenantId,
            projectId: config.projectId,
            agentId: config.agentId,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            name: relation.name,
            description: relation.description,
            prompt: '',
            delegateRelations: [],
            subAgentRelations: [],
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
              agentId: config.agentId,
              name: relation.name,
              description: relation.description,
              prompt: '',
              delegateRelations: [],
              subAgentRelations: [],
              transferRelations: [],
            })),
          delegateRelations: [
            ...enhancedInternalRelations
              .filter((relation) => relation.relationType === 'delegate')
              .map((relation) => ({
                type: 'internal' as const,
                config: {
                  id: relation.id,
                  tenantId: config.tenantId,
                  projectId: config.projectId,
                  agentId: config.agentId,
                  baseUrl: config.baseUrl,
                  apiKey: config.apiKey,
                  name: relation.name,
                  description: relation.description,
                  prompt: '',
                  delegateRelations: [],
                  subAgentRelations: [],
                  transferRelations: [],
                },
              })),
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

      const artifactStreamRequestId = task.context?.metadata?.streamRequestId;
      if (artifactStreamRequestId && artifactComponents.length > 0) {
        agentSessionManager.updateArtifactComponents(artifactStreamRequestId, artifactComponents);
      }

      let contextId = task.context?.conversationId;

      if (!contextId || contextId === 'default' || contextId === '') {
        const taskIdMatch = task.id.match(/^task_([^-]+-[^-]+-\d+)-/);
        if (taskIdMatch) {
          contextId = taskIdMatch[1];
          logger.info(
            {
              taskId: task.id,
              extractedContextId: contextId,
              subAgentId: config.subAgentId,
            },
            'Extracted contextId from task ID for delegation'
          );
        } else {
          contextId = 'default';
        }
      }

      const streamRequestId =
        task.context?.metadata?.stream_request_id || task.context?.metadata?.streamRequestId;

      const isDelegation = task.context?.metadata?.isDelegation === true;
      agent.setDelegationStatus(isDelegation);
      if (isDelegation) {
        logger.info(
          { subAgentId: config.subAgentId, taskId: task.id },
          'Delegated agent - streaming disabled'
        );

        if (streamRequestId && config.tenantId && config.projectId) {
          toolSessionManager.ensureAgentSession(
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
          if (
            toolCall.toolName.includes('transfer') ||
            toolCall.toolName.includes('transferToRefundAgent')
          ) {
            const toolResult = allToolResults.find(
              (result: any) => result.toolCallId === toolCall.toolCallId
            );

            logger.info(
              {
                toolCallName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                hasToolResult: !!toolResult,
                toolResultOutput: toolResult?.output,
                toolResultKeys: toolResult?.output ? Object.keys(toolResult.output) : [],
              },
              '[DEBUG] Transfer tool result found'
            );

            const isValidTransferResult = (
              output: unknown
            ): output is {
              type: 'transfer';
              targetSubAgentId: string;
              fromSubAgentId?: string;
            } => {
              return (
                typeof output === 'object' &&
                output !== null &&
                'type' in output &&
                'targetSubAgentId' in output &&
                (output as any).type === 'transfer' &&
                typeof (output as any).targetSubAgentId === 'string'
              );
            };

            const responseText =
              (response as any).text ||
              ((response as any).object ? JSON.stringify((response as any).object) : '');
            const transferReason =
              responseText ||
              allThoughts[allThoughts.length - 1]?.text ||
              'Agent requested transfer. No reason provided.';

            if (toolResult?.output && isValidTransferResult(toolResult.output)) {
              const transferResult = toolResult.output;

              logger.info(
                {
                  validationPassed: true,
                  transferResult,
                  targetSubAgentId: transferResult.targetSubAgentId,
                  fromSubAgentId: transferResult.fromSubAgentId,
                },
                '[DEBUG] Transfer validation passed, extracted data'
              );

              const artifactData = {
                type: 'transfer',
                targetSubAgentId: transferResult.targetSubAgentId,
                fromSubAgentId: transferResult.fromSubAgentId,
                task_id: task.id,
                reason: transferReason,
                original_message: userMessage,
              };

              logger.info(
                {
                  artifactData,
                  artifactDataKeys: Object.keys(artifactData),
                },
                '[DEBUG] Artifact data being returned'
              );

              return {
                status: {
                  state: TaskState.Completed,
                  message: `Transfer requested to ${transferResult.targetSubAgentId}`,
                },
                artifacts: [
                  {
                    artifactId: nanoid(),
                    parts: [
                      {
                        kind: 'data',
                        data: artifactData,
                      },
                    ],
                  },
                ],
              };
            } else {
              logger.warn(
                {
                  hasToolResult: !!toolResult,
                  hasOutput: !!toolResult?.output,
                  validationPassed: false,
                  output: toolResult?.output,
                },
                '[DEBUG] Transfer validation FAILED'
              );
            }
          }
        }
      }

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
  agentId: string;
  subAgentId: string;
  baseUrl: string;
  apiKey?: string;
}): Promise<TaskHandlerConfig> => {
  const subAgent = await getSubAgentById(dbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    subAgentId: params.subAgentId,
  });

  const agent = await getAgentById(dbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
  });

  if (!subAgent) {
    throw new Error(`Agent not found: ${params.subAgentId}`);
  }

  const effectiveModels = await resolveModelConfig(params.agentId, subAgent);
  const effectiveConversationHistoryConfig = subAgent.conversationHistoryConfig || { mode: 'full' };

  return {
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    subAgentId: params.subAgentId,
    agentSchema: {
      id: subAgent.id,
      name: subAgent.name,
      description: subAgent.description,
      prompt: subAgent.prompt,
      models: effectiveModels,
      conversationHistoryConfig: effectiveConversationHistoryConfig || null,
      stopWhen: subAgent.stopWhen || null,
      createdAt: subAgent.createdAt,
      updatedAt: subAgent.updatedAt,
    },
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    name: subAgent.name,
    description: subAgent.description,
    conversationHistoryConfig: effectiveConversationHistoryConfig as AgentConversationHistoryConfig,
    contextConfigId: agent?.contextConfigId || undefined,
  };
};
