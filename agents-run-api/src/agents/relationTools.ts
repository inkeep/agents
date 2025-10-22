import {
  A2A_RETRY_STATUS_CODES,
  ContextResolver,
  type CredentialStoreReference,
  type CredentialStoreRegistry,
  CredentialStuffer,
  createMessage,
  generateId,
  getCredentialReference,
  SPAN_KEYS,
} from '@inkeep/agents-core';
import { runtimeConfig } from '../env';
import { trace } from '@opentelemetry/api';
import { tool } from 'ai';
import z from 'zod';
import { A2AClient } from '../a2a/client';
import { saveA2AMessageResponse } from '../data/conversations';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { agentSessionManager } from '../services/AgentSession';
import type { AgentConfig, DelegateRelation } from './Agent';
import { toolSessionManager } from './ToolSessionManager';

const logger = getLogger('relationships Tools');

const generateTransferToolDescription = (config: AgentConfig): string => {
  return `Hand off the conversation to agent ${config.id}.

Agent Information:
- ID: ${config.id}
- Name: ${config.name ?? 'No name provided'}
- Description: ${config.description ?? 'No description provided'}

Hand off the conversation to agent ${config.id} when the user's request would be better handled by this specialized agent.`;
};

const generateDelegateToolDescription = (config: DelegateRelation['config']): string => {
  return `Delegate a specific task to another agent.

Agent Information:
- ID: ${config.id}
- Name: ${config.name}
- Description: ${config.description || 'No description provided'}

Delegate a specific task to agent ${config.id} when it seems like the agent can do relevant work.`;
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
  return tool({
    description: generateTransferToolDescription(transferConfig),
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
    description: generateDelegateToolDescription(delegateConfig.config),
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

      let resolvedHeaders: Record<string, string> = {};

      if (!isInternal) {
        if (
          (delegateConfig.config.credentialReferenceId || delegateConfig.config.headers) &&
          credentialStoreRegistry
        ) {
          const contextResolver = new ContextResolver(
            tenantId,
            projectId,
            dbClient,
            credentialStoreRegistry
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
            const credentialReference = await getCredentialReference(dbClient)({
              scopes: {
                tenantId,
                projectId,
              },
              id: delegateConfig.config.credentialReferenceId,
            });
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
        retryConfig: {
          strategy: 'backoff',
          retryConnectionErrors: true,
          statusCodes: [...A2A_RETRY_STATUS_CODES],
          backoff: {
            initialInterval: runtimeConfig.DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS,
            maxInterval: runtimeConfig.DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS,
            exponent: runtimeConfig.DELEGATION_TOOL_BACKOFF_EXPONENT,
            maxElapsedTime: runtimeConfig.DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS,
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

      await createMessage(dbClient)({
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
