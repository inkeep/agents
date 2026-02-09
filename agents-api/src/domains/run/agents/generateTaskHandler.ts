import {
  type AgentConversationHistoryConfig,
  type CredentialStoreRegistry,
  type DataPart,
  type FullExecutionContext,
  generateId,
  getMcpToolById,
  type McpTool,
  type Part,
  type SubAgentApiSelect,
  TaskState,
  type TextPart,
  withRef,
} from '@inkeep/agents-core';
import manageDbPool from 'src/data/db/manageDbPool';
import { getLogger } from '../../../logger';
import type { A2ATask, A2ATaskResult } from '../a2a/types';
import { agentSessionManager } from '../services/AgentSession';
import { getUserIdFromContext, type SandboxConfig } from '../types/executionContext';
import { resolveModelConfig } from '../utils/model-resolver';
import {
  enhanceInternalRelation,
  enhanceTeamRelation,
  getArtifactComponentsForSubAgent,
  getDataComponentsForSubAgent,
  getSkillsForSubAgent,
  getSubAgentRelations,
  getToolsForSubAgent,
} from '../utils/project';
import { Agent } from './Agent';
import { buildTransferRelationConfig } from './relationTools';
import { toolSessionManager } from './ToolSessionManager';

const logger = getLogger('generateTaskHandler');

/**
 * Serializable configuration for creating task handlers
 */
export interface TaskHandlerConfig {
  executionContext: FullExecutionContext;
  subAgentId: string;
  agentSchema: SubAgentApiSelect;
  name: string;
  baseUrl: string;
  apiKey?: string;
  description?: string;
  contextConfigId?: string;
  conversationHistoryConfig?: AgentConversationHistoryConfig;
  sandboxConfig?: SandboxConfig;
  /** User ID for user-scoped credential lookups (available when request is from authenticated user) */
  userId?: string;
}

export const createTaskHandler = (
  config: TaskHandlerConfig,
  credentialStoreRegistry?: CredentialStoreRegistry
) => {
  return async (task: A2ATask): Promise<A2ATaskResult> => {
    let agent: Agent | undefined; // Declare agent outside try block for cleanup access

    try {
      // Extract text parts (TextPart.text is required by the A2A spec)
      const textParts = task.input.parts
        .filter((part): part is TextPart => part.kind === 'text')
        .map((part) => part.text)
        .join(' ');

      // Extract data parts (e.g., from trigger payloads)
      const dataParts = task.input.parts.filter(
        (part): part is DataPart => part.kind === 'data' && part.data != null
      );

      // Build user message: combine text with any structured data
      let userMessage = textParts;

      // If there are data parts, append them as structured context for the LLM
      if (dataParts.length > 0) {
        const dataContext = dataParts
          .map((part) => {
            const metadata = part.metadata as Record<string, unknown> | undefined;
            const source = metadata?.source ? ` (source: ${metadata.source})` : '';
            return `\n\n<structured_data${source}>\n${JSON.stringify(part.data, null, 2)}\n</structured_data>`;
          })
          .join('');
        userMessage = `${textParts}${dataContext}`;
      }

      if (!userMessage.trim()) {
        return {
          status: {
            state: TaskState.Failed,
            message: 'No text content found in task input',
          },
          artifacts: [],
        };
      }

      // Extract forwarded headers from task metadata (passed from A2A handlers)
      const forwardedHeaders = task.context?.metadata?.forwardedHeaders as
        | Record<string, string>
        | undefined;

      // Get data from project context instead of database
      const { project, agentId, tenantId, projectId, resolvedRef } = config.executionContext;
      const currentAgent = project.agents[agentId];
      const currentSubAgent = currentAgent?.subAgents?.[config.subAgentId];

      if (!currentSubAgent) {
        return {
          status: {
            state: TaskState.Failed,
            message: `Sub-agent ${config.subAgentId} not found in project`,
          },
          artifacts: [],
        };
      }

      // Extract relations using helper functions
      const { externalRelations, teamRelations, transferRelations, internalDelegateRelations } =
        getSubAgentRelations({
          agent: currentAgent,
          project,
          subAgent: currentSubAgent,
        });

      // Combine transfer and delegate internal relations for processing
      const allInternalRelations = [...transferRelations, ...internalDelegateRelations];

      // Get tools, data components, and artifact components using helper functions
      const toolsForAgent = getToolsForSubAgent({
        agent: currentAgent,
        project,
        subAgent: currentSubAgent,
      });
      const dataComponents = getDataComponentsForSubAgent({ project, subAgent: currentSubAgent });
      const artifactComponents = getArtifactComponentsForSubAgent({
        project,
        subAgent: currentSubAgent,
      });

      // Enhance internal relations with description data from project context
      const enhancedInternalRelations = allInternalRelations.map((relation) => {
        try {
          return enhanceInternalRelation({
            relation,
            agent: currentAgent,
            project,
          });
        } catch (error) {
          logger.warn({ subAgentId: relation.id, error }, 'Failed to enhance agent description');
          return relation;
        }
      });

      // Enhance team relations with description data from project context
      const enhancedTeamRelations = teamRelations.map((relation) => {
        try {
          return enhanceTeamRelation({
            relation,
            project,
          });
        } catch (error) {
          logger.warn(
            { targetAgentId: relation.targetAgentId, error },
            'Failed to enhance team agent description'
          );
          return relation;
        }
      });

      const prompt = 'prompt' in config.agentSchema ? config.agentSchema.prompt || undefined : '';
      const models = 'models' in config.agentSchema ? config.agentSchema.models : undefined;
      const stopWhen = 'stopWhen' in config.agentSchema ? config.agentSchema.stopWhen : undefined;

      // Convert db tools to MCP tools and filter by selectedTools
      const toolsForAgentResult: McpTool[] =
        (await withRef(manageDbPool, resolvedRef, async (db) => {
          return await Promise.all(
            toolsForAgent.map(async (item) => {
              const mcpTool = await getMcpToolById(db)({
                scopes: { tenantId, projectId },
                toolId: item.tool.id,
                credentialStoreRegistry,
                userId: config.userId,
              });

              if (!mcpTool) {
                throw new Error(`Tool not found: ${item.tool.id}`);
              }

              if (item.relationshipId) {
                mcpTool.relationshipId = item.relationshipId;
              }
              // Filter available tools based on selectedTools for this agent-tool relationship
              if (item.selectedTools && item.selectedTools.length > 0) {
                const selectedToolsSet = new Set(item.selectedTools);
                mcpTool.availableTools =
                  mcpTool.availableTools?.filter((tool) => selectedToolsSet.has(tool.name)) || [];
              }

              return mcpTool;
            })
          );
        })) ?? [];

      const skills = getSkillsForSubAgent({ subAgent: currentSubAgent });

      console.log('\n\n\n\n\n\n\n\n\n\n\n', 'getSkillsForSubAgent', { skills });

      agent = new Agent(
        {
          id: config.subAgentId,
          tenantId,
          projectId,
          agentId,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          userId: config.userId,
          name: config.name,
          description: config.description || '',
          prompt,
          models: models || undefined,
          stopWhen: stopWhen || undefined,
          skills,
          subAgentRelations: enhancedInternalRelations.map((relation) => ({
            id: relation.id,
            tenantId,
            projectId,
            agentId,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            name: relation.name,
            description: relation.description || undefined,
            prompt: '',
            delegateRelations: [],
            subAgentRelations: [],
            transferRelations: [],
            relationId: relation.relationId,
          })),
          transferRelations: await Promise.all(
            enhancedInternalRelations
              .filter((relation) => relation.relationType === 'transfer')
              .map((relation) =>
                buildTransferRelationConfig(
                  {
                    relation,
                    executionContext: config.executionContext,
                    baseUrl: config.baseUrl,
                    apiKey: config.apiKey,
                  },
                  credentialStoreRegistry
                )
              )
          ),
          delegateRelations: [
            ...enhancedInternalRelations
              .filter((relation) => relation.relationType === 'delegate')
              .map((relation) => ({
                type: 'internal' as const,
                config: {
                  id: relation.id,
                  relationId: relation.relationId,
                  tenantId,
                  projectId,
                  agentId,
                  baseUrl: config.baseUrl,
                  apiKey: config.apiKey,
                  name: relation.name,
                  description: relation.description || undefined,
                  prompt: '',
                  delegateRelations: [],
                  subAgentRelations: [],
                  transferRelations: [],
                  tools: [],
                  project,
                },
              })),
            ...externalRelations.map((relation) => ({
              type: 'external' as const,
              config: {
                id: relation.externalAgent.id,
                name: relation.externalAgent.name,
                description: relation.externalAgent.description || '',
                ref: resolvedRef,
                baseUrl: relation.externalAgent.baseUrl,
                headers: relation.headers,
                credentialReferenceId: relation.externalAgent.credentialReferenceId,
                relationId: relation.relationId,
                relationType: 'delegate',
              },
            })),
            ...enhancedTeamRelations.map((relation) => ({
              type: 'team' as const,
              config: {
                id: relation.targetAgent.id,
                ref: resolvedRef,
                name: relation.targetAgent.name,
                description: relation.targetAgent.description || '',
                baseUrl: config.baseUrl,
                headers: relation.headers,
                relationId: relation.relationId,
              },
            })),
          ],
          tools: toolsForAgentResult,
          functionTools: [],
          dataComponents,
          artifactComponents,
          contextConfigId: config.contextConfigId || undefined,
          conversationHistoryConfig: config.conversationHistoryConfig,
          sandboxConfig: config.sandboxConfig,
          forwardedHeaders,
        },
        config.executionContext,
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
      const delegationId = task.context?.metadata?.delegationId;

      agent.setDelegationStatus(isDelegation);
      agent.setDelegationId(delegationId);

      if (isDelegation) {
        logger.info(
          { subAgentId: config.subAgentId, taskId: task.id, delegationId },
          'Delegated agent - streaming disabled'
        );

        if (streamRequestId && tenantId && projectId) {
          toolSessionManager.ensureAgentSession(
            streamRequestId,
            tenantId,
            projectId,
            contextId,
            task.id
          );
        }
      }

      logger.info({ contextId }, 'Context ID');
      logger.info(
        {
          userMessage: userMessage.substring(0, 500), // Truncate for logging
          inputPartsCount: task.input.parts.length,
          textPartsCount: task.input.parts.filter((p) => p.kind === 'text').length,
          dataPartsCount: task.input.parts.filter((p) => p.kind === 'data').length,
          hasDataParts: task.input.parts.some((p) => p.kind === 'data'),
        },
        'User Message with parts breakdown'
      );

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

      // Perform full cleanup of compression state when agent task completes
      agent.cleanupCompression();

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
                    artifactId: generateId(),
                    parts: [
                      {
                        kind: 'data',
                        data: artifactData,
                      },
                    ],
                    createdAt: new Date().toISOString(),
                  },
                ],
              };
            }
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

      const parts: Part[] = (response.formattedContent?.parts || []).map((part: any): Part => {
        if (part.kind === 'data') {
          return { kind: 'data' as const, data: part.data };
        }
        return { kind: 'text' as const, text: part.text };
      });

      return {
        status: { state: TaskState.Completed },
        artifacts: [
          {
            artifactId: generateId(),
            parts,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    } catch (error) {
      console.error('Task handler error:', error);

      // Cleanup compression state on error (if agent was created)
      try {
        if (agent) {
          agent.cleanupCompression();
        }
      } catch (cleanupError) {
        logger.warn({ cleanupError }, 'Failed to cleanup agent compression on error');
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const isConnectionRefused = errorMessage.includes(
        'Connection refused. Please check if the MCP server is running.'
      );

      return {
        status: {
          state: TaskState.Failed,
          message: errorMessage,
          type: isConnectionRefused ? 'connection_refused' : 'unknown',
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
 * Creates a task handler configuration from execution context and project data
 */
export const createTaskHandlerConfig = async (params: {
  executionContext: FullExecutionContext;
  subAgentId: string;
  baseUrl: string;
  apiKey?: string;
  sandboxConfig?: SandboxConfig;
}): Promise<TaskHandlerConfig> => {
  const { executionContext, subAgentId, baseUrl, apiKey, sandboxConfig } = params;
  const { project, agentId } = executionContext;

  const agent = project.agents[agentId];
  const subAgent = agent?.subAgents?.[subAgentId];

  if (!subAgent) {
    throw new Error(`Sub-agent not found: ${subAgentId}`);
  }

  // Cast to satisfy resolveModelConfig - it only uses the models property
  const effectiveModels = await resolveModelConfig(executionContext, subAgent);
  const effectiveConversationHistoryConfig = subAgent.conversationHistoryConfig;

  return {
    executionContext,
    subAgentId,
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
    baseUrl,
    apiKey,
    name: subAgent.name,
    description: subAgent.description || undefined,
    conversationHistoryConfig: effectiveConversationHistoryConfig as AgentConversationHistoryConfig,
    contextConfigId: agent?.contextConfig?.id || undefined,
    sandboxConfig,
    userId: getUserIdFromContext(executionContext),
  };
};
