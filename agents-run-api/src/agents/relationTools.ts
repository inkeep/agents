import {
  ContextResolver,
  type CredentialStoreReference,
  type CredentialStoreRegistry,
  CredentialStuffer,
  createMessage,
  executeInBranch,
  generateId,
  generateServiceToken,
  getCredentialReference,
  headers,
  SPAN_KEYS,
  TemplateEngine,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import { tool } from 'ai';
import z from 'zod';
import { A2AClient } from '../a2a/client';
import {
  DELEGATION_TOOL_BACKOFF_EXPONENT,
  DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS,
  DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS,
  DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS,
} from '../constants/execution-limits';
import { saveA2AMessageResponse } from '../data/conversations';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { agentSessionManager } from '../services/AgentSession';
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

  const finalDescription = `Hand off the conversation to agent ${config.id}.

Agent Information:
- ID: ${config.id}
- Name: ${config.name ?? 'No name provided'}
- Description: ${config.description ?? 'No description provided'}${toolsSection}${transferSection}${delegateSection}

Hand off the conversation to agent ${config.id} when the user's request would be better handled by this specialized agent.`;

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

  const finalDescription = `Delegate a specific task to another agent.

Agent Information:
- ID: ${config.id}
- Name: ${config.name}
- Description: ${config.description || 'No description provided'}
- Type: ${delegateRelation.type}${toolsSection}${transferSection}${delegateSection}

Delegate a specific task to agent ${config.id} when it seems like the agent can do relevant work.`;

  return finalDescription;
};

export const createTransferToAgentTool = ({
  transferConfig,
  callingAgentId,
  subAgent,
  streamRequestId,
}: {
  transferConfig: AgentConfig;
  callingAgentId: string;
  subAgent: any; // Will be properly typed as Agent, but avoiding circular import
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
  tenantId,
  projectId,
  agentId,
  contextId,
  metadata,
  sessionId,
  subAgent,
  credentialStoreRegistry,
}: {
  delegateConfig: DelegateRelation;
  callingAgentId: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  contextId: string;
  metadata: {
    conversationId: string;
    threadId: string;
    streamRequestId?: string;
    streamBaseUrl?: string;
    apiKey?: string;
  };
  sessionId?: string;
  subAgent: any; // Will be properly typed as Agent, but avoiding circular import
  credentialStoreRegistry?: CredentialStoreRegistry;
}) {
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
          const contextResolver = new ContextResolver(
            tenantId,
            projectId,
            dbClient,
            credentialStoreRegistry,
            delegateConfig.config.ref
          );
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
            const credentialReference = await executeInBranch(
              { dbClient, ref: delegateConfig.config.ref },
              async (db) => {
                return await getCredentialReference(db)({
                  scopes: {
                    tenantId,
                    projectId,
                  },
                  id,
                });
              }
            );
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
        const contextResolver = new ContextResolver(
          tenantId,
          projectId,
          dbClient,
          credentialStoreRegistry,
          delegateConfig.config.ref
        );
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
        resolvedHeaders = {
          Authorization: `Bearer ${metadata.apiKey}`,
          'x-inkeep-tenant-id': tenantId,
          'x-inkeep-project-id': projectId,
          'x-inkeep-agent-id': agentId,
          'x-inkeep-sub-agent-id': delegateConfig.config.id,
        };
      }

      const a2aClient = new A2AClient(delegateConfig.config.baseUrl, {
        headers: resolvedHeaders,
        ref: delegateConfig.config.ref,
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
      logger.info({ ref: delegateConfig.config.ref }, 'ref');

      await executeInBranch({ dbClient, ref: delegateConfig.config.ref }, async (db) => {
        return await createMessage(db)({
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
      });

      logger.info({ messageToSend }, 'Created message in database');

      const response = await a2aClient.sendMessage({
        message: messageToSend,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      await saveA2AMessageResponse(response, delegateConfig.config.ref, {
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
