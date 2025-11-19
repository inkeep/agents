import {
  type AgentConversationHistoryConfig,
  type CredentialStoreRegistry,
  dbResultToMcpTool,
  executeInBranch,
  generateId,
  getAgentById,
  getAgentWithDefaultSubAgent,
  getArtifactComponentsForAgent,
  getDataComponentsForAgent,
  getExternalAgentsForSubAgent,
  getRelatedAgentsForAgent,
  getSubAgentById,
  getTeamAgentsForSubAgent,
  getToolsForAgent,
  type McpTool,
  type Part,
  type ResolvedRef,
  type SubAgentApiSelect,
  TaskState,
} from '@inkeep/agents-core';
import type { A2ATask, A2ATaskResult } from '../a2a/types';
import { generateDescriptionWithRelationData } from '../data/agents';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { agentSessionManager } from '../services/AgentSession';
import type { SandboxConfig } from '../types/execution-context';
import { resolveModelConfig } from '../utils/model-resolver';
import { Agent } from './Agent';
import { toolSessionManager } from './ToolSessionManager';

const logger = getLogger('generateTaskHandler');

/**
 * Serializable configuration for creating task handlers
 */
export interface TaskHandlerConfig {
  ref: ResolvedRef;
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
  sandboxConfig?: SandboxConfig;
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
        internalRelations,
        externalRelations,
        teamRelations,
        toolsForAgent,
        dataComponents,
        artifactComponents,
      ] = await Promise.all([
        executeInBranch({ dbClient, ref: config.ref }, async (db) => {
          return await getRelatedAgentsForAgent(db)({
            scopes: {
              tenantId: config.tenantId,
              projectId: config.projectId,
              agentId: config.agentId,
            },
            subAgentId: config.subAgentId,
          });
        }),
        executeInBranch({ dbClient, ref: config.ref }, async (db) => {
          return await getExternalAgentsForSubAgent(db)({
            scopes: {
              tenantId: config.tenantId,
              projectId: config.projectId,
              agentId: config.agentId,
              subAgentId: config.subAgentId,
            },
          });
        }),
        executeInBranch({ dbClient, ref: config.ref }, async (db) => {
          return await getTeamAgentsForSubAgent(db)({
            scopes: {
              tenantId: config.tenantId,
              projectId: config.projectId,
              agentId: config.agentId,
              subAgentId: config.subAgentId,
            },
          });
        }),
        executeInBranch({ dbClient, ref: config.ref }, async (db) => {
          return await getToolsForAgent(db)({
            scopes: {
              tenantId: config.tenantId,
              projectId: config.projectId,
              agentId: config.agentId,
              subAgentId: config.subAgentId,
            },
          });
        }),
        executeInBranch({ dbClient, ref: config.ref }, async (db) => {
          return await getDataComponentsForAgent(db)({
            scopes: {
              tenantId: config.tenantId,
              projectId: config.projectId,
              agentId: config.agentId,
              subAgentId: config.subAgentId,
            },
          });
        }),
        executeInBranch({ dbClient, ref: config.ref }, async (db) => {
          return await getArtifactComponentsForAgent(db)({
            scopes: {
              tenantId: config.tenantId,
              projectId: config.projectId,
              agentId: config.agentId,
              subAgentId: config.subAgentId,
            },
          });
        }),
      ]);

      const enhancedInternalRelations = await Promise.all(
        internalRelations.data.map(async (relation) => {
          try {
            const relatedAgent = await executeInBranch(
              { dbClient, ref: config.ref },
              async (db) => {
                return await getSubAgentById(db)({
                  scopes: {
                    tenantId: config.tenantId,
                    projectId: config.projectId,
                    agentId: config.agentId,
                  },
                  subAgentId: relation.id,
                });
              }
            );
            if (relatedAgent) {
              const relatedAgentRelations = await executeInBranch(
                { dbClient, ref: config.ref },
                async (db) => {
                  return await getRelatedAgentsForAgent(db)({
                    scopes: {
                      tenantId: config.tenantId,
                      projectId: config.projectId,
                      agentId: config.agentId,
                    },
                    subAgentId: relation.id,
                  });
                }
              );
              const relatedAgentExternalAgentRelations = await executeInBranch(
                { dbClient, ref: config.ref },
                async (db) => {
                  return await getExternalAgentsForSubAgent(db)({
                    scopes: {
                      tenantId: config.tenantId,
                      projectId: config.projectId,
                      agentId: config.agentId,
                      subAgentId: relation.id,
                    },
                  });
                }
              );
              const relatedAgentTeamAgentRelations = await executeInBranch(
                { dbClient, ref: config.ref },
                async (db) => {
                  return await getTeamAgentsForSubAgent(db)({
                    scopes: {
                      tenantId: config.tenantId,
                      projectId: config.projectId,
                      agentId: config.agentId,
                      subAgentId: relation.id,
                    },
                  });
                }
              );
              const enhancedDescription = generateDescriptionWithRelationData(
                relation.description || '',
                relatedAgentRelations.data,
                relatedAgentExternalAgentRelations.data,
                relatedAgentTeamAgentRelations.data
              );
              return { ...relation, description: enhancedDescription };
            }
          } catch (error) {
            logger.warn({ subAgentId: relation.id, error }, 'Failed to enhance agent description');
          }
          return relation;
        })
      );

      const enhancedTeamRelations = await Promise.all(
        teamRelations.data.map(async (relation) => {
          try {
            // Get the default sub agent for the team agent
            const teamAgentWithDefault = await executeInBranch(
              { dbClient, ref: config.ref },
              async (db) => {
                return await getAgentWithDefaultSubAgent(db)({
                  scopes: {
                    tenantId: config.tenantId,
                    projectId: config.projectId,
                    agentId: relation.targetAgentId,
                  },
                });
              }
            );
            if (teamAgentWithDefault?.defaultSubAgent) {
              const defaultSubAgent = teamAgentWithDefault.defaultSubAgent;

              // Get related agents for the default sub agent
              const relatedAgentRelations = await executeInBranch(
                { dbClient, ref: config.ref },
                async (db) => {
                  return await getRelatedAgentsForAgent(db)({
                    scopes: {
                      tenantId: config.tenantId,
                      projectId: config.projectId,
                      agentId: relation.targetAgentId,
                    },
                    subAgentId: defaultSubAgent.id,
                  });
                }
              );
              // Get external agents for the default sub agent
              const relatedAgentExternalAgentRelations = await executeInBranch(
                { dbClient, ref: config.ref },
                async (db) => {
                  return await getExternalAgentsForSubAgent(db)({
                    scopes: {
                      tenantId: config.tenantId,
                      projectId: config.projectId,
                      agentId: relation.targetAgentId,
                      subAgentId: defaultSubAgent.id,
                    },
                  });
                }
              );

              // Get team agents for the default sub agent
              const relatedAgentTeamAgentRelations = await executeInBranch(
                { dbClient, ref: config.ref },
                async (db) => {
                  return await getTeamAgentsForSubAgent(db)({
                    scopes: {
                      tenantId: config.tenantId,
                      projectId: config.projectId,
                      agentId: relation.targetAgentId,
                      subAgentId: defaultSubAgent.id,
                    },
                  });
                }
              );

              const enhancedDescription = generateDescriptionWithRelationData(
                teamAgentWithDefault.description || '',
                relatedAgentRelations.data,
                relatedAgentExternalAgentRelations.data,
                relatedAgentTeamAgentRelations.data
              );

              return {
                ...relation,
                targetAgent: {
                  ...relation.targetAgent,
                  description: enhancedDescription,
                },
              };
            }
          } catch (error) {
            logger.warn(
              { targetAgentId: relation.targetAgentId, error },
              'Failed to enhance team agent description'
            );
          }
          return relation;
        })
      );

      const prompt = 'prompt' in config.agentSchema ? config.agentSchema.prompt : '';
      const models = 'models' in config.agentSchema ? config.agentSchema.models : undefined;
      const stopWhen = 'stopWhen' in config.agentSchema ? config.agentSchema.stopWhen : undefined;

      // Convert db tools to MCP tools and filter by selectedTools
      const toolsForAgentResult: McpTool[] =
        (await Promise.all(
          toolsForAgent.data.map(async (item) => {
            const mcpTool = await executeInBranch({ dbClient, ref: config.ref }, async (db) => {
              return await dbResultToMcpTool(item.tool, db, credentialStoreRegistry, item.id);
            });

            // Filter available tools based on selectedTools for this agent-tool relationship
            if (item.selectedTools && item.selectedTools.length > 0) {
              const selectedToolsSet = new Set(item.selectedTools);
              mcpTool.availableTools =
                mcpTool.availableTools?.filter((tool) => selectedToolsSet.has(tool.name)) || [];
            }

            return mcpTool;
          })
        )) ?? [];

      const agent = new Agent(
        {
          id: config.subAgentId,
          tenantId: config.tenantId,
          projectId: config.projectId,
          ref: config.ref,
          agentId: config.agentId,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          name: config.name,
          description: config.description || '',
          prompt,
          models: models || undefined,
          stopWhen: stopWhen || undefined,
          subAgentRelations: enhancedInternalRelations.map((relation) => ({
            ref: config.ref,
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
          transferRelations: await Promise.all(
            enhancedInternalRelations
              .filter((relation) => relation.relationType === 'transfer')
              .map(async (relation) => {
                // For internal agents, try to fetch tools and relations
                // For external/team agents, we'll only get tools (if available)
                const targetToolsForAgent = await executeInBranch(
                  { dbClient, ref: config.ref },
                  async (db) => {
                    return await getToolsForAgent(db)({
                      scopes: {
                        tenantId: config.tenantId,
                        projectId: config.projectId,
                        agentId: config.agentId,
                        subAgentId: relation.id,
                      },
                    });
                  }
                );

                // Try to get transfer and delegate relations for internal agents only
                let targetTransferRelations: any = { data: [] };
                let targetDelegateRelations: any = { data: [] };

                try {
                  // Only attempt to get relations for internal agents (same tenant/project/agent)
                  const [transferRel, delegateRel] = await Promise.all([
                    executeInBranch({ dbClient, ref: config.ref }, async (db) => {
                      return await getRelatedAgentsForAgent(db)({
                        scopes: {
                          tenantId: config.tenantId,
                          projectId: config.projectId,
                          agentId: config.agentId,
                        },
                        subAgentId: relation.id,
                      });
                    }),
                    executeInBranch({ dbClient, ref: config.ref }, async (db) => {
                      return await getExternalAgentsForSubAgent(db)({
                        scopes: {
                          tenantId: config.tenantId,
                          projectId: config.projectId,
                          agentId: config.agentId,
                          subAgentId: relation.id,
                        },
                      });
                    }),
                  ]);
                  targetTransferRelations = transferRel;
                  targetDelegateRelations = delegateRel;
                } catch (err: any) {
                  logger.info(
                    {
                      agentId: relation.id,
                      error: err?.message || 'Unknown error',
                    },
                    'Could not fetch relations for target agent (likely external/team agent), using basic info only'
                  );
                }

                const targetAgentTools: McpTool[] =
                  (await Promise.all(
                    targetToolsForAgent.data.map(async (item) => {
                      const mcpTool = await executeInBranch(
                        { dbClient, ref: config.ref },
                        async (db) => {
                          return await dbResultToMcpTool(
                            item.tool,
                            db,
                            credentialStoreRegistry,
                            item.id
                          );
                        }
                      );

                      // Filter available tools based on selectedTools for this agent-tool relationship
                      if (item.selectedTools && item.selectedTools.length > 0) {
                        const selectedToolsSet = new Set(item.selectedTools);
                        mcpTool.availableTools =
                          mcpTool.availableTools?.filter((tool) =>
                            selectedToolsSet.has(tool.name)
                          ) || [];
                      }

                      return mcpTool;
                    })
                  )) ?? [];

                // Build transfer relations for target agent (if available)
                const targetTransferRelationsConfig = targetTransferRelations.data
                  .filter((rel: any) => rel.relationType === 'transfer')
                  .map((rel: any) => ({
                    ref: config.ref,
                    baseUrl: config.baseUrl,
                    apiKey: config.apiKey,
                    id: rel.id,
                    tenantId: config.tenantId,
                    projectId: config.projectId,
                    agentId: config.agentId,
                    name: rel.name,
                    description: rel.description,
                    prompt: '',
                    delegateRelations: [],
                    subAgentRelations: [],
                    transferRelations: [],
                    // Note: Not including tools for nested relations to avoid infinite recursion
                  }));

                // Build delegate relations for target agent (if available)
                const targetDelegateRelationsConfig = targetDelegateRelations.data.map(
                  (rel: any) => ({
                    type: 'external' as const,
                    config: {
                      ref: config.ref,
                      id: rel.externalAgent.id,
                      name: rel.externalAgent.name,
                      description: rel.externalAgent.description || '',
                      baseUrl: rel.externalAgent.baseUrl,
                      headers: rel.headers,
                      credentialReferenceId: rel.externalAgent.credentialReferenceId,
                      relationId: rel.id,
                      relationType: 'delegate',
                    },
                  })
                );

                return {
                  ref: config.ref,
                  baseUrl: config.baseUrl,
                  apiKey: config.apiKey,
                  id: relation.id,
                  tenantId: config.tenantId,
                  projectId: config.projectId,
                  agentId: config.agentId,
                  name: relation.name,
                  description: relation.description,
                  prompt: '',
                  delegateRelations: targetDelegateRelationsConfig,
                  subAgentRelations: [],
                  transferRelations: targetTransferRelationsConfig,
                  tools: targetAgentTools, // Include target agent's tools for transfer descriptions
                };
              })
          ),
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
                  ref: config.ref,
                  name: relation.name,
                  description: relation.description,
                  prompt: '',
                  delegateRelations: [], // Simplified - no nested relations
                  subAgentRelations: [],
                  transferRelations: [],
                  tools: [], // Tools are defined in config files, not DB
                },
              })),
            ...externalRelations.data.map((relation) => ({
              type: 'external' as const,
              config: {
                ref: config.ref,
                id: relation.externalAgent.id,
                name: relation.externalAgent.name,
                description: relation.externalAgent.description || '',
                baseUrl: relation.externalAgent.baseUrl,
                headers: relation.headers,
                credentialReferenceId: relation.externalAgent.credentialReferenceId,
                relationId: relation.id,
                relationType: 'delegate',
              },
            })),
            ...enhancedTeamRelations.map((relation) => ({
              type: 'team' as const,
              config: {
                ref: config.ref,
                id: relation.targetAgent.id,
                name: relation.targetAgent.name,
                description: relation.targetAgent.description || '',
                baseUrl: config.baseUrl,
                headers: relation.headers,
                relationId: relation.id,
              },
            })),
          ],
          tools: toolsForAgentResult,
          functionTools: [], // All tools are now handled via MCP servers
          dataComponents: dataComponents,
          artifactComponents: artifactComponents,
          contextConfigId: config.contextConfigId || undefined,
          conversationHistoryConfig: config.conversationHistoryConfig,
          sandboxConfig: config.sandboxConfig,
        },
        config.ref,
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
                    artifactId: generateId(),
                    parts: [
                      {
                        kind: 'data',
                        data: artifactData,
                      },
                    ],
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

      const parts: Part[] = (response.formattedContent?.parts || []).map((part: any) => ({
        kind: part.kind as 'text' | 'data',
        ...(part.kind === 'text' && { text: part.text }),
        ...(part.kind === 'data' && { data: part.data }),
      }));

      return {
        status: { state: TaskState.Completed },
        artifacts: [
          {
            artifactId: generateId(),
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
  ref: ResolvedRef;
  tenantId: string;
  projectId: string;
  agentId: string;
  subAgentId: string;
  baseUrl: string;
  apiKey?: string;
  sandboxConfig?: SandboxConfig;
}): Promise<TaskHandlerConfig> => {
  const subAgent = await executeInBranch({ dbClient, ref: params.ref }, async (db) => {
    return await getSubAgentById(db)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
      subAgentId: params.subAgentId,
    });
  });

  const agent = await executeInBranch({ dbClient, ref: params.ref }, async (db) => {
    return await getAgentById(db)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
    });
  });

  if (!subAgent) {
    throw new Error(`Agent not found: ${params.subAgentId}`);
  }

  const effectiveModels = await resolveModelConfig(params.ref, params.agentId, subAgent);
  const effectiveConversationHistoryConfig = subAgent.conversationHistoryConfig;

  return {
    ref: params.ref,
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
    sandboxConfig: params.sandboxConfig,
  };
};
