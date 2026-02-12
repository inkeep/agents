import { z } from '@hono/zod-openapi';
import {
  type CredentialStoreReference,
  type CredentialStoreRegistry,
  CredentialStuffer,
  createMessage,
  type FullExecutionContext,
  generateId,
  generateServiceToken,
  getMcpToolById,
  headers,
  type McpTool,
  SPAN_KEYS,
  TemplateEngine,
  withRef,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import { tool } from 'ai';
import manageDbPool from 'src/data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { getInProcessFetch } from '../../../utils/in-process-fetch';
import { A2AClient } from '../a2a/client';
import {
  DELEGATION_TOOL_BACKOFF_EXPONENT,
  DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS,
  DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS,
  DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS,
} from '../constants/execution-limits';
import { ContextResolver } from '../context';
import { saveA2AMessageResponse } from '../data/conversations';
import { agentSessionManager } from '../services/AgentSession';
import { getUserIdFromContext } from '../types/executionContext';
import {
  getExternalAgentRelationsForTargetSubAgent,
  getToolsForSubAgent,
  getTransferRelationsForTargetSubAgent,
  type InternalRelation,
} from '../utils/project';
import type { AgentConfig, DelegateRelation } from './Agent';
import { toolSessionManager } from './ToolSessionManager';

const logger = getLogger('relationships Tools');

// Re-export A2A_RETRY_STATUS_CODES from agents-core for compatibility
const A2A_RETRY_STATUS_CODES = ['429', '500', '502', '503', '504'];

const generateTransferToolDescription = (config: AgentConfig): string => {
  // Generate tools section from the agent's available tools
  let toolsSection = '';

  // Generate transfer relations section
  let transferSection = '';
  if (config.transferRelations && config.transferRelations.length > 0) {
    const transferList = config.transferRelations
      .map(
        (transfer) =>
          `  - ${transfer.name || transfer.id}: ${transfer.description || 'No description available'}`
      )
      .join('\n');

    transferSection = `

Can Transfer To:
${transferList}`;
  }

  // Generate delegate relations section
  let delegateSection = '';
  if (config.delegateRelations && config.delegateRelations.length > 0) {
    const delegateList = config.delegateRelations
      .map(
        (delegate) =>
          `  - ${delegate.config.name || delegate.config.id}: ${delegate.config.description || 'No description available'} (${delegate.type})`
      )
      .join('\n');

    delegateSection = `

Can Delegate To:
${delegateList}`;
  }

  if (config.tools && config.tools.length > 0) {
    const toolDescriptions = config.tools
      .map((tool) => {
        const toolsList =
          tool.availableTools
            ?.map((t) => `  - ${t.name}: ${t.description || 'No description available'}`)
            .join('\n') || '';
        return `MCP Server: ${tool.name}\n${toolsList}`;
      })
      .join('\n\n');

    toolsSection = `

Available Tools & Capabilities:
${toolDescriptions}`;
  }

  const finalDescription = `🚨 CRITICAL TRANSFER PROTOCOL 🚨

This tool immediately transfers conversation control to agent ${config.id}. 

⚠️ MANDATORY BEHAVIOR:
1. DO NOT write any response to the user
2. DO NOT explain what you're doing  
3. DO NOT provide partial answers
4. ONLY call this tool and STOP

Agent Information:
- ID: ${config.id}
- Name: ${config.name ?? 'No name provided'}
- Description: ${config.description ?? 'No description provided'}${toolsSection}${transferSection}${delegateSection}

🔄 Use when: The user's request is better handled by this specialized agent.

⛔ VIOLATION WARNING: Any text generation before/after this tool call will create a disjointed user experience. The receiving agent will provide the complete response.`;

  return finalDescription;
};

const generateDelegateToolDescription = (delegateRelation: DelegateRelation): string => {
  const config = delegateRelation.config;

  let toolsSection = '';
  let transferSection = '';
  let delegateSection = '';

  // For internal delegate relations (AgentConfig), include rich information
  if (delegateRelation.type === 'internal' && 'tools' in config) {
    const agentConfig = config as AgentConfig;

    // Generate tools section
    if (agentConfig.tools && agentConfig.tools.length > 0) {
      const toolDescriptions = agentConfig.tools
        .map((tool) => {
          const toolsList =
            tool.availableTools
              ?.map((t) => `  - ${t.name}: ${t.description || 'No description available'}`)
              .join('\n') || '';
          return `MCP Server: ${tool.name}\n${toolsList}`;
        })
        .join('\n\n');

      toolsSection = `

Available Tools & Capabilities:
${toolDescriptions}`;
    }

    // Generate transfer relations section
    if (agentConfig.transferRelations && agentConfig.transferRelations.length > 0) {
      const transferList = agentConfig.transferRelations
        .map(
          (transfer) =>
            `  - ${transfer.name || transfer.id}: ${transfer.description || 'No description available'}`
        )
        .join('\n');

      transferSection = `

Can Transfer To:
${transferList}`;
    }

    // Generate delegate relations section
    if (agentConfig.delegateRelations && agentConfig.delegateRelations.length > 0) {
      const delegateList = agentConfig.delegateRelations
        .map(
          (delegate) =>
            `  - ${delegate.config.name || delegate.config.id}: ${delegate.config.description || 'No description available'} (${delegate.type})`
        )
        .join('\n');

      delegateSection = `

Can Delegate To:
${delegateList}`;
    }
  }

  const finalDescription = `Delegate a specific task to another agent and wait for their response.

Agent Information:
- ID: ${config.id}
- Name: ${config.name}
- Description: ${config.description || 'No description provided'}
- Type: ${delegateRelation.type}${toolsSection}${transferSection}${delegateSection}

Delegate a specific task to agent ${config.id} when it can do relevant work. The delegated agent will return results that you can incorporate into your response to the user.

NOTE: Unlike transfers, delegation returns control back to you with the delegated agent's results.`;

  return finalDescription;
};

export const createTransferToAgentTool = ({
  transferConfig,
  callingAgentId,
  streamRequestId,
}: {
  transferConfig: AgentConfig;
  callingAgentId: string;
  streamRequestId?: string;
}) => {
  const toolDescription = generateTransferToolDescription(transferConfig);

  return tool({
    description: toolDescription,
    inputSchema: z.object({}),
    execute: async () => {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        activeSpan.setAttributes({
          [SPAN_KEYS.TRANSFER_FROM_SUB_AGENT_ID]: callingAgentId,
          [SPAN_KEYS.TRANSFER_TO_SUB_AGENT_ID]: transferConfig.id ?? 'unknown',
        });
      }

      logger.info(
        {
          transferTo: transferConfig.id ?? 'unknown',
          fromSubAgent: callingAgentId,
        },
        'invoked transferToAgentTool'
      );

      if (streamRequestId) {
        agentSessionManager.recordEvent(streamRequestId, 'transfer', callingAgentId, {
          fromSubAgent: callingAgentId,
          targetSubAgent: transferConfig.id ?? 'unknown',
          reason: `Transfer to ${transferConfig.name || transferConfig.id}`,
        });
      }

      const transferResult = {
        type: 'transfer',
        targetSubAgentId: transferConfig.id ?? 'unknown', // Changed from "target" for type safety
        fromSubAgentId: callingAgentId, // Include the calling agent ID for tracking
      };

      logger.info(
        {
          transferResult,
          transferResultKeys: Object.keys(transferResult),
        },
        '[DEBUG] Transfer tool returning'
      );

      return transferResult;
    },
  });
};

export function createDelegateToAgentTool({
  delegateConfig,
  callingAgentId,
  executionContext,
  contextId,
  metadata,
  sessionId,
  credentialStoreRegistry,
}: {
  delegateConfig: DelegateRelation;
  callingAgentId: string;
  executionContext: FullExecutionContext;
  contextId: string;
  metadata: {
    conversationId: string;
    threadId: string;
    streamRequestId?: string;
    streamBaseUrl?: string;
    apiKey?: string;
  };
  sessionId?: string;
  credentialStoreRegistry?: CredentialStoreRegistry;
}) {
  const { tenantId, projectId, agentId, project } = executionContext;

  return tool({
    description: generateDelegateToolDescription(delegateConfig),
    inputSchema: z.object({ message: z.string() }),
    execute: async (input: { message: string }, context?: any) => {
      const delegationId = `del_${generateId()}`;

      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        activeSpan.setAttributes({
          [SPAN_KEYS.DELEGATION_FROM_SUB_AGENT_ID]: callingAgentId,
          [SPAN_KEYS.DELEGATION_TO_SUB_AGENT_ID]: delegateConfig.config.id ?? 'unknown',
          [SPAN_KEYS.DELEGATION_ID]: delegationId,
          [SPAN_KEYS.DELEGATION_TYPE]: delegateConfig.type,
        });
      }

      if (metadata.streamRequestId) {
        agentSessionManager.recordEvent(
          metadata.streamRequestId,
          'delegation_sent',
          callingAgentId,
          {
            delegationId,
            fromSubAgent: callingAgentId,
            targetSubAgent: delegateConfig.config.id,
            taskDescription: input.message,
          }
        );
      }

      const isInternal = delegateConfig.type === 'internal';
      const isExternal = delegateConfig.type === 'external';
      const isTeam = delegateConfig.type === 'team';

      let resolvedHeaders: Record<string, string> = {};

      if (isExternal) {
        if (
          (delegateConfig.config.credentialReferenceId || delegateConfig.config.headers) &&
          credentialStoreRegistry
        ) {
          const contextResolver = new ContextResolver(executionContext, credentialStoreRegistry);
          const credentialStuffer = new CredentialStuffer(credentialStoreRegistry, contextResolver);

          const credentialContext = {
            tenantId,
            projectId,
            conversationId: metadata.conversationId,
            contextConfigId: contextId,
            metadata: metadata as Record<string, unknown>,
          };

          let storeReference: CredentialStoreReference | undefined;
          if (delegateConfig.config.credentialReferenceId) {
            const id = delegateConfig.config.credentialReferenceId;
            const credentialReference = project.credentialReferences?.[id];
            if (credentialReference) {
              storeReference = {
                credentialStoreId: credentialReference.credentialStoreId,
                retrievalParams: credentialReference.retrievalParams || {},
              };
            }
          }
          resolvedHeaders = await credentialStuffer.getCredentialHeaders({
            context: credentialContext,
            storeReference,
            headers: delegateConfig.config.headers || undefined,
          });
        }
      } else if (isTeam) {
        const contextResolver = new ContextResolver(executionContext, credentialStoreRegistry);
        const context = await contextResolver.resolveHeaders(metadata.conversationId, contextId);

        for (const [key, value] of Object.entries(headers)) {
          resolvedHeaders[key] = TemplateEngine.render(value, context, { strict: true });
        }

        resolvedHeaders.Authorization = `Bearer ${await generateServiceToken({
          tenantId,
          projectId,
          originAgentId: agentId,
          targetAgentId: delegateConfig.config.id,
        })}`;
      } else {
        // For internal sub-agent calls, check if we're in a team delegation context.
        // If so, the inherited metadata.apiKey has the wrong audience (targets the parent agent),
        // so we need to generate a fresh JWT targeting this specific sub-agent.
        let authToken = metadata.apiKey;
        if (executionContext.metadata?.teamDelegation && authToken) {
          authToken = await generateServiceToken({
            tenantId,
            projectId,
            originAgentId: agentId,
            targetAgentId: delegateConfig.config.id,
          });
        }

        resolvedHeaders = {
          Authorization: `Bearer ${authToken}`,
          'x-inkeep-tenant-id': tenantId,
          'x-inkeep-project-id': projectId,
          'x-inkeep-agent-id': agentId,
          'x-inkeep-sub-agent-id': delegateConfig.config.id,
        };
      }

      const a2aClient = new A2AClient(delegateConfig.config.baseUrl, {
        headers: resolvedHeaders,
        retryConfig: {
          strategy: 'backoff',
          retryConnectionErrors: true,
          statusCodes: [...A2A_RETRY_STATUS_CODES],
          backoff: {
            initialInterval: DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS,
            maxInterval: DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS,
            exponent: DELEGATION_TOOL_BACKOFF_EXPONENT,
            maxElapsedTime: DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS,
          },
        },
        ...(isInternal || isTeam ? { fetchFn: getInProcessFetch() } : {}),
      });

      const messageToSend = {
        role: 'agent' as const,
        parts: [{ text: input.message, kind: 'text' as const }],
        messageId: generateId(),
        kind: 'message' as const,
        contextId,
        metadata: {
          ...metadata, // Keep all metadata including streamRequestId
          isDelegation: true, // Flag to prevent streaming in delegated agents
          delegationId, // Include delegation ID for tracking
          ...(isInternal
            ? { fromSubAgentId: callingAgentId }
            : { fromExternalAgentId: callingAgentId }),
        },
      };
      logger.info({ messageToSend }, 'messageToSend');

      await createMessage(runDbClient)({
        id: generateId(),
        tenantId: tenantId,
        projectId: projectId,
        conversationId: contextId,
        role: 'agent',
        content: {
          text: input.message,
        },
        visibility: isInternal ? 'internal' : 'external',
        messageType: 'a2a-request',
        fromSubAgentId: callingAgentId,
        ...(isInternal
          ? { toSubAgentId: delegateConfig.config.id }
          : { toExternalAgentId: delegateConfig.config.id }),
      });

      logger.info({ messageToSend }, 'Created message in database');

      const response = await a2aClient.sendMessage({
        message: messageToSend,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      await saveA2AMessageResponse(response, {
        tenantId,
        projectId,
        conversationId: contextId,
        messageType: 'a2a-response',
        visibility: isInternal ? 'internal' : 'external',
        toSubAgentId: callingAgentId,
        ...(isInternal
          ? { fromSubAgentId: delegateConfig.config.id }
          : { fromExternalAgentId: delegateConfig.config.id }),
      });

      if (sessionId && context?.toolCallId) {
        const toolResult = {
          toolCallId: context.toolCallId,
          toolName: `delegate_to_${delegateConfig.config.id}`,
          args: input,
          result: response.result,
          timestamp: Date.now(),
        };
        toolSessionManager.recordToolResult(sessionId, toolResult);
      }

      if (metadata.streamRequestId) {
        agentSessionManager.recordEvent(
          metadata.streamRequestId,
          'delegation_returned',
          callingAgentId,
          {
            delegationId,
            fromSubAgent: delegateConfig.config.id,
            targetSubAgent: callingAgentId,
            result: response.result,
          }
        );
      }

      return {
        toolCallId: context?.toolCallId,
        result: response.result,
      };
    },
  });
}

/**
 * Parameters for building a transfer relation config
 */
export type BuildTransferRelationConfigParams = {
  relation: InternalRelation;
  executionContext: FullExecutionContext;
  baseUrl: string;
  apiKey?: string;
};

/**
 * Build a transfer relation config for an internal relation.
 * Fetches tools, transfer relations, and external agent relations for the target sub-agent.
 */
export async function buildTransferRelationConfig(
  params: BuildTransferRelationConfigParams,
  credentialStoreRegistry?: CredentialStoreRegistry
): Promise<AgentConfig> {
  const { relation, executionContext, baseUrl, apiKey } = params;
  const { tenantId, projectId, project, agentId } = executionContext;

  const agent = executionContext.project.agents[agentId];

  const targetSubAgent = agent.subAgents?.[relation.id];

  if (!targetSubAgent) {
    throw new Error(`Target sub-agent not found: ${relation.id}`);
  }

  // Get tools for the target sub-agent
  const targetToolsForSubAgent = getToolsForSubAgent({
    agent,
    project,
    subAgent: targetSubAgent,
  });

  // Convert ToolForAgent[] to McpTool[] via Management API calls
  //TODO: add user id to the scopes

  const targetAgentTools: McpTool[] =
    (await withRef(manageDbPool, executionContext.resolvedRef, async (db) => {
      return await Promise.all(
        targetToolsForSubAgent.map(async (item) => {
          const mcpTool = await getMcpToolById(db)({
            scopes: { tenantId, projectId },
            toolId: item.tool.id,
            credentialStoreRegistry,
            userId: getUserIdFromContext(executionContext),
          });
          if (!mcpTool) {
            throw new Error(`Tool not found: ${item.tool.id}`);
          }
          if (item.relationshipId) {
            mcpTool.relationshipId = item.relationshipId;
          }
          if (item.selectedTools && item.selectedTools.length > 0) {
            const selectedToolsSet = new Set(item.selectedTools);
            mcpTool.availableTools =
              mcpTool.availableTools?.filter((tool) => selectedToolsSet.has(tool.name)) || [];
          }
          return mcpTool;
        })
      );
    })) ?? [];

  // Get transfer relations for the target sub-agent
  const targetTransferRelations = getTransferRelationsForTargetSubAgent({
    agent,
    subAgentId: relation.id,
  });

  // Get external agent relations for the target sub-agent
  const targetExternalAgentRelations = getExternalAgentRelationsForTargetSubAgent({
    agent,
    project,
    subAgentId: relation.id,
  });

  // Build transfer relations config for target agent (nested level)
  const targetTransferRelationsConfig: AgentConfig[] = targetTransferRelations.map((rel) => ({
    baseUrl,
    apiKey,
    id: rel.id,
    tenantId,
    projectId,
    agentId,
    name: rel.name,
    description: rel.description || undefined,
    prompt: '',
    delegateRelations: [],
    subAgentRelations: [],
    transferRelations: [],
    project,
    // Note: Not including tools for nested relations to avoid infinite recursion
  }));

  // Build delegate relations config for target agent (external agents only)
  const targetDelegateRelationsConfig: DelegateRelation[] = targetExternalAgentRelations.map(
    (rel) => ({
      type: 'external' as const,
      config: {
        relationId: rel.relationId || `external-${rel.externalAgent.id}`,
        id: rel.externalAgent.id,
        name: rel.externalAgent.name,
        description: rel.externalAgent.description || '',
        ref: executionContext.resolvedRef,
        baseUrl: rel.externalAgent.baseUrl,
        headers: rel.headers || undefined,
        credentialReferenceId: rel.externalAgent.credentialReferenceId,
        relationType: 'delegate',
      },
    })
  );

  return {
    baseUrl,
    apiKey,
    id: relation.id,
    tenantId,
    projectId,
    agentId,
    name: relation.name,
    description: relation.description || undefined,
    prompt: '',
    delegateRelations: targetDelegateRelationsConfig,
    subAgentRelations: [],
    transferRelations: targetTransferRelationsConfig,
    tools: targetAgentTools,
  };
}
