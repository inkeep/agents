import {
  type ArtifactComponentApiInsert,
  type CredentialStoreRegistry,
  CredentialStuffer,
  type FullExecutionContext,
  type Part,
} from '@inkeep/agents-core';
import type { ToolSet } from 'ai';
import { ContextResolver } from '../context';
import { createDefaultConversationHistoryConfig } from '../data/conversations';
import { ArtifactReferenceSchema } from '../artifacts/artifact-component-schema';
import type { StreamHelper } from '../stream/stream-helpers';
import { AgentMcpManager } from './services/AgentMcpManager';
import {
  type AgentConfig,
  type AgentRunContext,
  type DelegateRelation,
  type ExternalAgentRelationConfig,
  hasToolCallWithPrefix,
  type ResolvedGenerationResponse,
  resolveGenerationResponse,
  type TeamAgentRelationConfig,
  type ToolType,
} from './agent-types';
import { getRelationTools, runGenerate } from './generation/generate';
import { SystemPromptBuilder } from './SystemPromptBuilder';
import { getFunctionTools } from './tools/function-tools';
import { getRelationshipIdForTool } from './tools/tool-wrapper';
import { PromptConfig } from './versions/v1/PromptConfig';

export class Agent {
  private ctx: AgentRunContext;

  constructor(
    config: AgentConfig,
    executionContext: FullExecutionContext,
    credentialStoreRegistry?: CredentialStoreRegistry
  ) {
    const artifactComponents: ArtifactComponentApiInsert[] = config.artifactComponents || [];

    let processedDataComponents = config.dataComponents || [];

    if (processedDataComponents.length > 0) {
      processedDataComponents.push({
        id: 'text-content',
        name: 'Text',
        description:
          'Natural conversational text for the user - write naturally without mentioning technical details. Avoid redundancy and repetition with data components.',
        props: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                'Natural conversational text - respond as if having a normal conversation, never mention JSON, components, schemas, or technical implementation. Avoid redundancy and repetition with data components.',
            },
          },
          required: ['text'],
        },
      });
    }

    if (
      artifactComponents.length > 0 &&
      config.dataComponents &&
      config.dataComponents.length > 0
    ) {
      processedDataComponents = [
        ArtifactReferenceSchema.getDataComponent(config.tenantId, config.projectId),
        ...processedDataComponents,
      ];
    }

    const processedConfig: AgentConfig = {
      ...config,
      dataComponents: processedDataComponents,
      conversationHistoryConfig:
        config.conversationHistoryConfig || createDefaultConversationHistoryConfig(),
    };

    let contextResolver: ContextResolver | undefined;
    let credentialStuffer: CredentialStuffer | undefined;

    if (credentialStoreRegistry) {
      contextResolver = new ContextResolver(executionContext, credentialStoreRegistry);
      credentialStuffer = new CredentialStuffer(credentialStoreRegistry, contextResolver);
    }

    const systemPromptBuilder = new SystemPromptBuilder('v1', new PromptConfig());

    const functionToolRelationshipIdByName = new Map<string, string>();

    const ctx: AgentRunContext = {
      config: processedConfig,
      executionContext,
      mcpManager: undefined as any,
      contextResolver,
      credentialStoreRegistry,
      credentialStuffer,
      systemPromptBuilder,
      streamHelper: undefined,
      streamRequestId: undefined,
      conversationId: undefined,
      delegationId: undefined,
      isDelegatedAgent: false,
      artifactComponents,
      currentCompressor: null,
      functionToolRelationshipIdByName,
    };

    ctx.mcpManager = new AgentMcpManager(
      processedConfig,
      executionContext,
      credentialStuffer,
      () => ctx.conversationId,
      () => ctx.streamRequestId,
      (toolName, toolType) => getRelationshipIdForTool(ctx, toolName, toolType as ToolType)
    );

    this.ctx = ctx;
  }

  get streamRequestId(): string | undefined {
    return this.ctx.streamRequestId;
  }

  set streamRequestId(value: string | undefined) {
    this.ctx.streamRequestId = value;
  }

  get mcpManager() {
    return this.ctx.mcpManager;
  }

  setConversationId(conversationId: string) {
    this.ctx.conversationId = conversationId;
  }

  setDelegationStatus(isDelegated: boolean) {
    this.ctx.isDelegatedAgent = isDelegated;
  }

  setDelegationId(delegationId: string | undefined) {
    this.ctx.delegationId = delegationId;
  }

  getStreamingHelper(): StreamHelper | undefined {
    return this.ctx.isDelegatedAgent ? undefined : this.ctx.streamHelper;
  }

  async getFunctionTools(sessionId?: string, streamRequestId?: string): Promise<ToolSet> {
    return getFunctionTools(this.ctx, sessionId, streamRequestId);
  }

  async generate(
    userParts: Part[],
    runtimeContext?: {
      contextId: string;
      metadata: {
        conversationId: string;
        threadId: string;
        taskId: string;
        streamRequestId: string;
        apiKey?: string;
      };
    }
  ): Promise<ResolvedGenerationResponse> {
    return runGenerate(this.ctx, userParts, runtimeContext);
  }

  getRelationTools(
    runtimeContext?: {
      contextId: string;
      metadata: {
        conversationId: string;
        threadId: string;
        streamRequestId?: string;
        streamBaseUrl?: string;
        apiKey?: string;
        baseUrl?: string;
      };
    },
    sessionId?: string
  ): Record<string, any> {
    return getRelationTools(this.ctx, runtimeContext, sessionId);
  }

  cleanupCompression(): void {
    if (this.ctx.currentCompressor) {
      this.ctx.currentCompressor.fullCleanup();
      this.ctx.currentCompressor = null;
    }
  }

  async cleanup(): Promise<void> {
    await this.ctx.mcpManager.cleanup();
    this.cleanupCompression();
  }
}

export type {
  AgentConfig,
  ExternalAgentRelationConfig,
  TeamAgentRelationConfig,
  DelegateRelation,
  ToolType,
  ResolvedGenerationResponse,
  AgentRunContext,
};
export { hasToolCallWithPrefix, resolveGenerationResponse };
