import {
  type AgentConversationHistoryConfig,
  type Artifact,
  type ArtifactComponentApiInsert,
  agentHasArtifactComponents,
  ContextResolver,
  type CredentialStoreRegistry,
  CredentialStuffer,
  type DataComponentApiInsert,
  executeInBranch,
  getContextConfigById,
  getCredentialReference,
  getFullAgentDefinition,
  getFunction,
  getFunctionToolsForSubAgent,
  getLedgerArtifacts,
  getToolsForAgent,
  listTaskIdsByContextId,
  MCPServerType,
  type MCPToolConfig,
  MCPTransportType,
  McpClient,
  type McpServerConfig,
  type McpTool,
  type MessageContent,
  type ModelSettings,
  type Models,
  type ResolvedRef,
  type SubAgentStopWhen,
  TemplateEngine,
} from '@inkeep/agents-core';
import { type Span, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  generateObject,
  generateText,
  streamObject,
  streamText,
  type Tool,
  type ToolSet,
  tool,
} from 'ai';
import { z } from 'zod';
import {
  AGENT_EXECUTION_MAX_GENERATION_STEPS,
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING,
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
  LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS,
} from '../constants/execution-limits';
import {
  createDefaultConversationHistoryConfig,
  getFormattedConversationHistory,
} from '../data/conversations';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { agentSessionManager } from '../services/AgentSession';
import { IncrementalStreamParser } from '../services/IncrementalStreamParser';
import { ResponseFormatter } from '../services/ResponseFormatter';
import type { SandboxConfig } from '../types/execution-context';
import { generateToolId } from '../utils/agent-operations';
import { ArtifactCreateSchema, ArtifactReferenceSchema } from '../utils/artifact-component-schema';
import { jsonSchemaToZod } from '../utils/data-component-schema';
import { parseEmbeddedJson } from '../utils/json-parser';
import type { StreamHelper } from '../utils/stream-helpers';
import { getStreamHelper } from '../utils/stream-registry';
import { setSpanWithError, tracer } from '../utils/tracer';
import { ModelFactory } from './ModelFactory';
import { createDelegateToAgentTool, createTransferToAgentTool } from './relationTools';
import { SystemPromptBuilder } from './SystemPromptBuilder';
import { toolSessionManager } from './ToolSessionManager';
import type { SystemPromptV1 } from './types';
import { Phase1Config } from './versions/v1/Phase1Config';
import { Phase2Config } from './versions/v1/Phase2Config';

/**
 * Creates a stopWhen condition that stops when any tool call name starts with the given prefix
 * @param prefix - The prefix to check for in tool call names
 * @returns A function that can be used as a stopWhen condition
 */
export function hasToolCallWithPrefix(prefix: string) {
  return ({ steps }: { steps: Array<any> }) => {
    const last = steps.at(-1);
    if (last && 'toolCalls' in last && last.toolCalls) {
      return last.toolCalls.some((tc: any) => tc.toolName.startsWith(prefix));
    }
    return false;
  };
}

const logger = getLogger('Agent');

function validateModel(modelString: string | undefined, modelType: string): string {
  if (!modelString?.trim()) {
    throw new Error(
      `${modelType} model is required. Please configure models at the project level.`
    );
  }
  return modelString.trim();
}

export type AgentConfig = {
  id: string;
  tenantId: string;
  projectId: string;
  ref: ResolvedRef;
  agentId: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyId?: string;
  name: string;
  description: string;
  prompt: string;
  subAgentRelations: AgentConfig[];
  transferRelations: AgentConfig[];
  delegateRelations: DelegateRelation[];
  tools?: McpTool[];
  artifacts?: Record<string, Artifact>;
  functionTools?: Array<{
    name: string;
    description: string;
    execute: (params: any) => Promise<any>;
    parameters?: Record<string, any>;
    schema?: any;
  }>;
  contextConfigId?: string;
  dataComponents?: DataComponentApiInsert[];
  artifactComponents?: ArtifactComponentApiInsert[];
  conversationHistoryConfig?: AgentConversationHistoryConfig;
  models?: Models;
  stopWhen?: SubAgentStopWhen;
  sandboxConfig?: SandboxConfig;
};

export type ExternalAgentRelationConfig = {
  relationId: string;
  id: string;
  name: string;
  description: string;
  ref: ResolvedRef;
  baseUrl: string;
  credentialReferenceId?: string | null;
  headers?: Record<string, string> | null;
  relationType: string;
};

export type TeamAgentRelationConfig = {
  relationId: string;
  id: string;
  ref: ResolvedRef;
  name: string;
  description: string;
  baseUrl: string;
  headers?: Record<string, string> | null;
};

export type DelegateRelation =
  | { type: 'internal'; config: AgentConfig }
  | { type: 'external'; config: ExternalAgentRelationConfig }
  | { type: 'team'; config: TeamAgentRelationConfig };

export type ToolType = 'transfer' | 'delegation' | 'mcp' | 'tool';

function isValidTool(
  tool: any
): tool is Tool<any, any> & { execute: (args: any, context?: any) => Promise<any> } {
  return (
    tool &&
    typeof tool === 'object' &&
    typeof tool.description === 'string' &&
    tool.inputSchema &&
    typeof tool.execute === 'function'
  );
}

export class Agent {
  private config: AgentConfig;
  private systemPromptBuilder = new SystemPromptBuilder('v1', new Phase1Config());
  private credentialStuffer?: CredentialStuffer;
  private streamHelper?: StreamHelper;
  private streamRequestId?: string;
  private conversationId?: string;
  private delegationId?: string;
  private artifactComponents: ArtifactComponentApiInsert[] = [];
  private isDelegatedAgent: boolean = false;
  private contextResolver?: ContextResolver;
  private credentialStoreRegistry?: CredentialStoreRegistry;
  private mcpClientCache: Map<string, McpClient> = new Map();
  private mcpConnectionLocks: Map<string, Promise<McpClient>> = new Map();
  private ref: ResolvedRef;

  constructor(
    config: AgentConfig,
    ref: ResolvedRef,
    credentialStoreRegistry?: CredentialStoreRegistry
  ) {
    this.artifactComponents = config.artifactComponents || [];

    this.ref = ref;

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
      this.artifactComponents.length > 0 &&
      config.dataComponents &&
      config.dataComponents.length > 0
    ) {
      processedDataComponents = [
        ArtifactReferenceSchema.getDataComponent(config.tenantId, config.projectId),
        ...processedDataComponents,
      ];
    }

    this.config = {
      ...config,
      dataComponents: processedDataComponents,
      conversationHistoryConfig:
        config.conversationHistoryConfig || createDefaultConversationHistoryConfig(),
    };

    this.credentialStoreRegistry = credentialStoreRegistry;

    if (credentialStoreRegistry) {
      this.contextResolver = new ContextResolver(
        config.tenantId,
        config.projectId,
        dbClient,
        credentialStoreRegistry,
        this.ref
      );
      this.credentialStuffer = new CredentialStuffer(credentialStoreRegistry, this.contextResolver);
    }
  }

  /**
   * Get the maximum number of generation steps for this agent
   * Uses agent's stopWhen.stepCountIs config or defaults to AGENT_EXECUTION_MAX_GENERATION_STEPS
   */
  private getMaxGenerationSteps(): number {
    return this.config.stopWhen?.stepCountIs ?? AGENT_EXECUTION_MAX_GENERATION_STEPS;
  }

  /**
   * Sanitizes tool names at runtime for AI SDK compatibility.
   * The AI SDK requires tool names to match pattern ^[a-zA-Z0-9_-]{1,128}$
   */
  private sanitizeToolsForAISDK(tools: ToolSet): ToolSet {
    const sanitizedTools: ToolSet = {};

    for (const [originalKey, toolDef] of Object.entries(tools)) {
      let sanitizedKey = originalKey.replace(/[^a-zA-Z0-9_-]/g, '_');
      sanitizedKey = sanitizedKey.replace(/_+/g, '_');
      sanitizedKey = sanitizedKey.replace(/^_+|_+$/g, '');

      if (!sanitizedKey || sanitizedKey.length === 0) {
        sanitizedKey = 'unnamed_tool';
      }

      if (sanitizedKey.length > 100) {
        sanitizedKey = sanitizedKey.substring(0, 100);
      }

      const originalId = (toolDef as any).id || originalKey;
      let sanitizedId = originalId.replace(/[^a-zA-Z0-9_.-]/g, '_');
      sanitizedId = sanitizedId.replace(/_+/g, '_');
      sanitizedId = sanitizedId.replace(/^_+|_+$/g, '');

      if (sanitizedId.length > 128) {
        sanitizedId = sanitizedId.substring(0, 128);
      }

      const sanitizedTool = {
        ...toolDef,
        id: sanitizedId,
      };

      sanitizedTools[sanitizedKey] = sanitizedTool;
    }

    return sanitizedTools;
  }

  /**
   * Get the primary model settings for text generation and thinking
   * Requires model to be configured at project level
   */
  private getPrimaryModel(): ModelSettings {
    if (!this.config.models?.base) {
      throw new Error(
        'Base model configuration is required. Please configure models at the project level.'
      );
    }
    return {
      model: validateModel(this.config.models.base.model, 'Base'),
      providerOptions: this.config.models.base.providerOptions,
    };
  }

  /**
   * Get the model settings for structured output generation
   * Falls back to base model if structured output not configured
   */
  private getStructuredOutputModel(): ModelSettings {
    if (!this.config.models) {
      throw new Error(
        'Model configuration is required. Please configure models at the project level.'
      );
    }

    const structuredConfig = this.config.models.structuredOutput;
    const baseConfig = this.config.models.base;

    if (structuredConfig) {
      return {
        model: validateModel(structuredConfig.model, 'Structured output'),
        providerOptions: structuredConfig.providerOptions,
      };
    }

    if (!baseConfig) {
      throw new Error(
        'Base model configuration is required for structured output fallback. Please configure models at the project level.'
      );
    }
    return {
      model: validateModel(baseConfig.model, 'Base (fallback for structured output)'),
      providerOptions: baseConfig.providerOptions,
    };
  }

  setConversationId(conversationId: string) {
    this.conversationId = conversationId;
  }

  /**
   * Set delegation status for this agent instance
   */
  setDelegationStatus(isDelegated: boolean) {
    this.isDelegatedAgent = isDelegated;
  }

  /**
   * Set delegation ID for this agent instance
   */
  setDelegationId(delegationId: string | undefined) {
    this.delegationId = delegationId;
  }

  /**
   * Get streaming helper if this agent should stream to user
   * Returns undefined for delegated agents to prevent streaming data operations to user
   */
  getStreamingHelper(): StreamHelper | undefined {
    return this.isDelegatedAgent ? undefined : this.streamHelper;
  }

  /**
   * Wraps a tool with streaming lifecycle tracking (start, complete, error) and AgentSession recording
   */
  private wrapToolWithStreaming(
    toolName: string,
    toolDefinition: any,
    streamRequestId?: string,
    toolType?: ToolType,
    relationshipId?: string
  ) {
    if (!toolDefinition || typeof toolDefinition !== 'object' || !('execute' in toolDefinition)) {
      return toolDefinition;
    }

    const originalExecute = toolDefinition.execute;
    return {
      ...toolDefinition,
      execute: async (args: any, context?: any) => {
        const startTime = Date.now();
        const toolCallId = context?.toolCallId || generateToolId();

        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.setAttributes({
            'conversation.id': this.conversationId,
            'tool.purpose': toolDefinition.description || 'No description provided',
            'ai.toolType': toolType || 'unknown',
            'subAgent.name': this.config.name || 'unknown',
            'subAgent.id': this.config.id || 'unknown',
            'agent.id': this.config.agentId || 'unknown',
          });
        }

        const isInternalTool =
          toolName.includes('save_tool_result') ||
          toolName.includes('thinking_complete') ||
          toolName.startsWith('transfer_to_');
        // Note: delegate_to_ tools are NOT internal - we want their results in conversation history

        if (streamRequestId && !isInternalTool) {
          agentSessionManager.recordEvent(streamRequestId, 'tool_call', this.config.id, {
            toolName,
            input: args,
            toolCallId,
            relationshipId,
          });
        }

        try {
          const result = await originalExecute(args, context);
          const duration = Date.now() - startTime;

          // Store tool result in conversation history
          const toolResultConversationId = this.getToolResultConversationId();
          if (streamRequestId && !isInternalTool && toolResultConversationId) {
            try {
              const messageId = generateId();
              const messagePayload = {
                id: messageId,
                tenantId: this.config.tenantId,
                projectId: this.config.projectId,
                conversationId: toolResultConversationId,
                role: 'assistant',
                content: {
                  text: this.formatToolResult(toolName, args, result, toolCallId),
                },
                visibility: 'internal',
                messageType: 'tool-result',
                fromSubAgentId: this.config.id,
                metadata: {
                  a2a_metadata: {
                    toolName,
                    toolCallId,
                    timestamp: Date.now(),
                    delegationId: this.delegationId,
                    isDelegated: this.isDelegatedAgent,
                  },
                },
              };

              await createMessage(dbClient)(messagePayload);
            } catch (error) {
              logger.warn(
                { error, toolName, toolCallId, conversationId: toolResultConversationId },
                'Failed to store tool result in conversation history'
              );
            }
          }

          if (streamRequestId && !isInternalTool) {
            agentSessionManager.recordEvent(streamRequestId, 'tool_result', this.config.id, {
              toolName,
              output: result,
              toolCallId,
              duration,
              relationshipId,
            });
          }

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          if (streamRequestId && !isInternalTool) {
            agentSessionManager.recordEvent(streamRequestId, 'tool_result', this.config.id, {
              toolName,
              output: null,
              toolCallId,
              duration,
              error: errorMessage,
              relationshipId,
            });
          }

          throw error;
        }
      },
    };
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
  ) {
    const { transferRelations = [], delegateRelations = [] } = this.config;
    const createToolName = (prefix: string, subAgentId: string) =>
      `${prefix}_to_${subAgentId.toLowerCase().replace(/\s+/g, '_')}`;
    return Object.fromEntries([
      ...transferRelations.map((agentConfig) => {
        const toolName = createToolName('transfer', agentConfig.id);
        return [
          toolName,
          this.wrapToolWithStreaming(
            toolName,
            createTransferToAgentTool({
              transferConfig: agentConfig,
              callingAgentId: this.config.id,
              subAgent: this,
              streamRequestId: runtimeContext?.metadata?.streamRequestId,
            }),
            runtimeContext?.metadata?.streamRequestId,
            'transfer'
          ),
        ];
      }),
      ...delegateRelations.map((relation) => {
        const toolName = createToolName('delegate', relation.config.id);

        return [
          toolName,
          this.wrapToolWithStreaming(
            toolName,
            createDelegateToAgentTool({
              delegateConfig: relation,
              callingAgentId: this.config.id,
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              agentId: this.config.agentId,
              contextId: runtimeContext?.contextId || 'default', // fallback for compatibility
              metadata: runtimeContext?.metadata || {
                conversationId: runtimeContext?.contextId || 'default',
                threadId: runtimeContext?.contextId || 'default',
                streamRequestId: runtimeContext?.metadata?.streamRequestId,
                apiKey: runtimeContext?.metadata?.apiKey,
              },
              sessionId,
              subAgent: this,
              credentialStoreRegistry: this.credentialStoreRegistry,
            }),
            runtimeContext?.metadata?.streamRequestId,
            'delegation'
          ),
        ];
      }),
    ]);
  }

  async getMcpTools(sessionId?: string, streamRequestId?: string) {
    const mcpTools =
      this.config.tools?.filter((tool) => {
        return tool.config?.type === 'mcp';
      }) || [];
    const tools = (await Promise.all(mcpTools.map((tool) => this.getMcpTool(tool)) || [])) || [];
    if (!sessionId) {
      const wrappedTools: ToolSet = {};
      for (const [index, toolSet] of tools.entries()) {
        const relationshipId = mcpTools[index]?.relationshipId;
        for (const [toolName, toolDef] of Object.entries(toolSet)) {
          wrappedTools[toolName] = this.wrapToolWithStreaming(
            toolName,
            toolDef,
            streamRequestId,
            'mcp',
            relationshipId
          );
        }
      }
      return wrappedTools;
    }

    const wrappedTools: ToolSet = {};
    for (const [index, toolSet] of tools.entries()) {
      const relationshipId = mcpTools[index]?.relationshipId;
      for (const [toolName, originalTool] of Object.entries(toolSet)) {
        if (!isValidTool(originalTool)) {
          logger.error({ toolName }, 'Invalid MCP tool structure - missing required properties');
          continue;
        }
        const sessionWrappedTool = tool({
          description: originalTool.description,
          inputSchema: originalTool.inputSchema,
          execute: async (args, { toolCallId }) => {
            logger.debug({ toolName, toolCallId }, 'MCP Tool Called');

            try {
              const rawResult = await originalTool.execute(args, { toolCallId });

              if (rawResult && typeof rawResult === 'object' && rawResult.isError) {
                const errorMessage = rawResult.content?.[0]?.text || 'MCP tool returned an error';
                logger.error(
                  { toolName, toolCallId, errorMessage, rawResult },
                  'MCP tool returned error status'
                );

                toolSessionManager.recordToolResult(sessionId, {
                  toolCallId,
                  toolName,
                  args,
                  result: { error: errorMessage, failed: true },
                  timestamp: Date.now(),
                });

                if (streamRequestId) {
                  agentSessionManager.recordEvent(streamRequestId, 'error', this.config.id, {
                    message: `MCP tool "${toolName}" failed: ${errorMessage}`,
                    code: 'mcp_tool_error',
                    severity: 'error',
                    context: {
                      toolName,
                      toolCallId,
                      errorMessage,
                      relationshipId,
                    },
                  });
                }

                const activeSpan = trace.getActiveSpan();
                if (activeSpan) {
                  const error = new Error(
                    `Tool "${toolName}" failed: ${errorMessage}. This tool is currently unavailable. Please try a different approach or inform the user of the issue.`
                  );
                  activeSpan.recordException(error);
                  activeSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: `MCP tool returned error: ${errorMessage}`,
                  });
                }

                throw new Error(
                  `Tool "${toolName}" failed: ${errorMessage}. This tool is currently unavailable. Please try a different approach or inform the user of the issue.`
                );
              }

              const parsedResult = parseEmbeddedJson(rawResult);

              const enhancedResult = this.enhanceToolResultWithStructureHints(parsedResult);

              toolSessionManager.recordToolResult(sessionId, {
                toolCallId,
                toolName,
                args,
                result: enhancedResult,
                timestamp: Date.now(),
              });

              return { result: enhancedResult, toolCallId };
            } catch (error) {
              logger.error({ toolName, toolCallId, error }, 'MCP tool execution failed');
              throw error;
            }
          },
        });

        wrappedTools[toolName] = this.wrapToolWithStreaming(
          toolName,
          sessionWrappedTool,
          streamRequestId,
          'mcp',
          relationshipId
        );
      }
    }

    return wrappedTools;
  }

  /**
   * Convert database McpTool to builder MCPToolConfig format
   */
  private convertToMCPToolConfig(
    tool: McpTool,
    agentToolRelationHeaders?: Record<string, string>
  ): MCPToolConfig {
    if (tool.config.type !== 'mcp') {
      throw new Error(`Cannot convert non-MCP tool to MCP config: ${tool.id}`);
    }

    return {
      id: tool.id,
      name: tool.name,
      description: tool.name, // Use name as description fallback
      serverUrl: tool.config.mcp.server.url,
      activeTools: tool.config.mcp.activeTools,
      mcpType: tool.config.mcp.server.url.includes('api.nango.dev')
        ? MCPServerType.nango
        : MCPServerType.generic,
      transport: tool.config.mcp.transport,
      headers: {
        ...tool.headers,
        ...agentToolRelationHeaders,
      },
    };
  }

  async getMcpTool(tool: McpTool) {
    const cacheKey = `${this.config.tenantId}-${this.config.projectId}-${tool.id}-${tool.credentialReferenceId || 'no-cred'}`;

    const credentialReferenceId = tool.credentialReferenceId;

    const toolsForAgent = await executeInBranch(
      {
        dbClient: dbClient,
        ref: this.ref,
      },
      async (db) => {
        return await getToolsForAgent(db)({
          scopes: {
            tenantId: this.config.tenantId,
            projectId: this.config.projectId,
            agentId: this.config.agentId,
            subAgentId: this.config.id,
          },
        });
      }
    );

    const agentToolRelationHeaders =
      toolsForAgent.data.find((t) => t.toolId === tool.id)?.headers || undefined;

    const selectedTools =
      toolsForAgent.data.find((t) => t.toolId === tool.id)?.selectedTools || undefined;

    let serverConfig: McpServerConfig;

    if (credentialReferenceId && this.credentialStuffer) {
      const credentialReference = await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getCredentialReference(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
            },
            id: credentialReferenceId,
          });
        }
      );

      if (!credentialReference) {
        throw new Error(`Credential store not found: ${credentialReferenceId}`);
      }

      const storeReference = {
        credentialStoreId: credentialReference.credentialStoreId,
        retrievalParams: credentialReference.retrievalParams || {},
      };

      serverConfig = await this.credentialStuffer.buildMcpServerConfig(
        {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          contextConfigId: this.config.contextConfigId || undefined,
          conversationId: this.conversationId || undefined,
        },
        this.convertToMCPToolConfig(tool, agentToolRelationHeaders),
        storeReference,
        selectedTools
      );
    } else if (this.credentialStuffer) {
      serverConfig = await this.credentialStuffer.buildMcpServerConfig(
        {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          contextConfigId: this.config.contextConfigId || undefined,
          conversationId: this.conversationId || undefined,
        },
        this.convertToMCPToolConfig(tool, agentToolRelationHeaders),
        undefined,
        selectedTools
      );
    } else {
      // Type guard - should only reach here for MCP tools
      if (tool.config.type !== 'mcp') {
        throw new Error(`Cannot build server config for non-MCP tool: ${tool.id}`);
      }

      serverConfig = {
        type: tool.config.mcp.transport?.type || MCPTransportType.streamableHttp,
        url: tool.config.mcp.server.url,
        activeTools: tool.config.mcp.activeTools,
        selectedTools,
        headers: agentToolRelationHeaders,
      };
    }

    logger.info(
      {
        toolName: tool.name,
        credentialReferenceId,
        transportType: serverConfig.type,
        headers: tool.headers,
      },
      'Built MCP server config with credentials'
    );

    let client = this.mcpClientCache.get(cacheKey);

    if (client && !client.isConnected()) {
      this.mcpClientCache.delete(cacheKey);
      client = undefined;
    }

    if (!client) {
      let connectionPromise = this.mcpConnectionLocks.get(cacheKey);

      if (!connectionPromise) {
        connectionPromise = this.createMcpConnection(tool, serverConfig);
        this.mcpConnectionLocks.set(cacheKey, connectionPromise);
      }

      try {
        client = await connectionPromise;
        this.mcpClientCache.set(cacheKey, client);
      } catch (error) {
        this.mcpConnectionLocks.delete(cacheKey);
        logger.error(
          {
            toolName: tool.name,
            subAgentId: this.config.id,
            cacheKey,
            error: error instanceof Error ? error.message : String(error),
          },
          'MCP connection failed'
        );
        throw error;
      }
    }

    const tools = await client.tools();

    if (!tools || Object.keys(tools).length === 0) {
      const streamRequestId = this.getStreamRequestId();
      if (streamRequestId) {
        tracer.startActiveSpan(
          'ai.toolCall',
          {
            attributes: {
              'ai.toolCall.name': tool.name,
              'ai.toolCall.args': JSON.stringify({ operation: 'mcp_tool_discovery' }),
              'ai.toolCall.result': JSON.stringify({
                status: 'no_tools_available',
                message: `MCP server has 0 effective tools. Double check the selected tools in your agent and the active tools in the MCP server configuration.`,
                serverUrl: tool.config.type === 'mcp' ? tool.config.mcp.server.url : 'unknown',
                originalToolName: tool.name,
              }),
              'ai.toolType': 'mcp',
              'subAgent.name': this.config.name || 'unknown',
              'subAgent.id': this.config.id || 'unknown',
              'conversation.id': this.conversationId || 'unknown',
              'agent.id': this.config.agentId || 'unknown',
              'tenant.id': this.config.tenantId || 'unknown',
              'project.id': this.config.projectId || 'unknown',
            },
          },
          (span) => {
            setSpanWithError(span, new Error(`0 effective tools available for ${tool.name}`));
            agentSessionManager.recordEvent(streamRequestId, 'error', this.config.id, {
              message: `MCP server has 0 effective tools. Double check the selected tools in your graph and the active tools in the MCP server configuration.`,
              code: 'no_tools_available',
              severity: 'error',
              context: {
                toolName: tool.name,
                serverUrl: tool.config.type === 'mcp' ? tool.config.mcp.server.url : 'unknown',
                operation: 'mcp_tool_discovery',
              },
            });
            span.end();
          }
        );
      }
    }

    return tools;
  }

  private async createMcpConnection(
    tool: McpTool,
    serverConfig: McpServerConfig
  ): Promise<McpClient> {
    const client = new McpClient({
      name: tool.name,
      server: serverConfig,
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      logger.error(
        {
          toolName: tool.name,
          subAgentId: this.config.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Agent failed to connect to MCP server'
      );
      if (error instanceof Error) {
        if (error?.cause && JSON.stringify(error.cause).includes('ECONNREFUSED')) {
          const errorMessage = 'Connection refused. Please check if the MCP server is running.';
          throw new Error(errorMessage);
        }
        if (error.message.includes('404')) {
          const errorMessage = 'Error accessing endpoint (HTTP 404)';
          throw new Error(errorMessage);
        }
        throw new Error(`MCP server connection failed: ${error.message}`);
      }

      throw error;
    }
  }

  async getFunctionTools(sessionId?: string, streamRequestId?: string) {
    const functionTools: ToolSet = {};

    try {
      const functionToolsForAgent = await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getFunctionToolsForSubAgent(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              agentId: this.config.agentId,
            },
            subAgentId: this.config.id,
          });
        }
      );

      const functionToolsData = functionToolsForAgent.data || [];

      if (functionToolsData.length === 0) {
        return functionTools;
      }

      const { SandboxExecutorFactory } = await import('../tools/SandboxExecutorFactory');
      const sandboxExecutor = SandboxExecutorFactory.getInstance();

      for (const functionToolDef of functionToolsData) {
        const functionId = functionToolDef.functionId;
        if (!functionId) {
          logger.warn(
            { functionToolId: functionToolDef.id },
            'Function tool missing functionId reference'
          );
          continue;
        }

        const functionData = await executeInBranch(
          {
            dbClient: dbClient,
            ref: this.ref,
          },
          async (db) => {
            return await getFunction(db)({
              functionId,
              scopes: {
                tenantId: this.config.tenantId || 'default',
                projectId: this.config.projectId || 'default',
              },
            });
          }
        );
        if (!functionData) {
          logger.warn(
            { functionId, functionToolId: functionToolDef.id },
            'Function not found in functions table'
          );
          continue;
        }

        const zodSchema = jsonSchemaToZod(functionData.inputSchema);

        const aiTool = tool({
          description: functionToolDef.description || functionToolDef.name,
          inputSchema: zodSchema,
          execute: async (args, { toolCallId }) => {
            logger.debug(
              { toolName: functionToolDef.name, toolCallId, args },
              'Function Tool Called'
            );

            try {
              const defaultSandboxConfig: SandboxConfig = {
                provider: 'native',
                runtime: 'node22',
                timeout: FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
                vcpus: FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
              };

              const result = await sandboxExecutor.executeFunctionTool(functionToolDef.id, args, {
                description: functionToolDef.description || functionToolDef.name,
                inputSchema: functionData.inputSchema || {},
                executeCode: functionData.executeCode,
                dependencies: functionData.dependencies || {},
                sandboxConfig: this.config.sandboxConfig || defaultSandboxConfig,
              });

              toolSessionManager.recordToolResult(sessionId || '', {
                toolCallId,
                toolName: functionToolDef.name,
                args,
                result,
                timestamp: Date.now(),
              });

              return { result, toolCallId };
            } catch (error) {
              logger.error(
                {
                  toolName: functionToolDef.name,
                  toolCallId,
                  error: error instanceof Error ? error.message : String(error),
                },
                'Function tool execution failed'
              );
              throw error;
            }
          },
        });

        functionTools[functionToolDef.name] = this.wrapToolWithStreaming(
          functionToolDef.name,
          aiTool,
          streamRequestId || '',
          'tool'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load function tools from database');
    }

    return functionTools;
  }

  /**
   * Get resolved context using ContextResolver - will return cached data or fetch fresh data as needed
   */
  async getResolvedContext(
    conversationId: string,
    headers?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    try {
      if (!this.config.contextConfigId) {
        logger.debug({ agentId: this.config.agentId }, 'No context config found for agent');
        return null;
      }

      const contextConfigId = this.config.contextConfigId;
      const contextConfig = await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getContextConfigById(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              agentId: this.config.agentId,
            },
            id: contextConfigId,
          });
        }
      );
      if (!contextConfig) {
        logger.warn({ contextConfigId: this.config.contextConfigId }, 'Context config not found');
        return null;
      }

      if (!this.contextResolver) {
        throw new Error('Context resolver not found');
      }

      const result = await this.contextResolver.resolve(contextConfig, {
        triggerEvent: 'invocation',
        conversationId,
        headers: headers || {},
        tenantId: this.config.tenantId,
      });

      const contextWithBuiltins = {
        ...result.resolvedContext,
        $env: process.env,
      };

      logger.debug(
        {
          conversationId,
          contextConfigId: contextConfig.id,
          resolvedKeys: Object.keys(contextWithBuiltins),
          cacheHits: result.cacheHits.length,
          cacheMisses: result.cacheMisses.length,
          fetchedDefinitions: result.fetchedDefinitions.length,
          errors: result.errors.length,
        },
        'Context resolved for agent'
      );

      return contextWithBuiltins;
    } catch (error) {
      logger.error(
        {
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get resolved context'
      );
      return null;
    }
  }

  /**
   * Get the agent prompt for this agent's agent
   */
  private async getPrompt(): Promise<string | undefined> {
    try {
      const agentDefinition = await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getFullAgentDefinition(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              agentId: this.config.agentId,
            },
          });
        }
      );

      return agentDefinition?.prompt || undefined;
    } catch (error) {
      logger.warn(
        {
          agentId: this.config.agentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get agent prompt'
      );
      return undefined;
    }
  }

  /**
   * Check if any agent in the agent has artifact components configured
   */
  private async hasAgentArtifactComponents(): Promise<boolean> {
    try {
      const agentDefinition = await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getFullAgentDefinition(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              agentId: this.config.agentId,
            },
          });
        }
      );
      if (!agentDefinition) {
        return false;
      }

      return Object.values(agentDefinition.subAgents).some(
        (subAgent) =>
          'artifactComponents' in subAgent &&
          subAgent.artifactComponents &&
          subAgent.artifactComponents.length > 0
      );
    } catch (error) {
      logger.warn(
        {
          agentId: this.config.agentId,
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to check agent artifact components, assuming none exist'
      );
      return this.artifactComponents.length > 0;
    }
  }

  /**
   * Build adaptive system prompt for Phase 2 structured output generation
   * based on configured data components and artifact components across the agent
   */
  private async buildPhase2SystemPrompt(runtimeContext?: {
    contextId: string;
    metadata: {
      conversationId: string;
      threadId: string;
      streamRequestId?: string;
      streamBaseUrl?: string;
    };
  }): Promise<string> {
    const phase2Config = new Phase2Config();
    const hasAgentArtifactComponents = await this.hasAgentArtifactComponents();

    const conversationId = runtimeContext?.metadata?.conversationId || runtimeContext?.contextId;
    const resolvedContext = conversationId ? await this.getResolvedContext(conversationId) : null;

    let processedPrompt = this.config.prompt;
    if (resolvedContext) {
      try {
        processedPrompt = TemplateEngine.render(this.config.prompt, resolvedContext, {
          strict: false,
          preserveUnresolved: false,
        });
      } catch (error) {
        logger.error(
          {
            conversationId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to process agent prompt with context for Phase 2, using original'
        );
        processedPrompt = this.config.prompt;
      }
    }

    const referenceTaskIds: string[] = await executeInBranch(
      {
        dbClient: dbClient,
        ref: this.ref,
      },
      async (db) => {
        return await listTaskIdsByContextId(db)({
          contextId: this.conversationId || '',
        });
      }
    );

    const referenceArtifacts: Artifact[] = [];
    for (const taskId of referenceTaskIds) {
      const artifacts = await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getLedgerArtifacts(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
            },
            taskId: taskId,
          });
        }
      );
      referenceArtifacts.push(...artifacts);
    }

    return phase2Config.assemblePhase2Prompt({
      corePrompt: processedPrompt,
      dataComponents: this.config.dataComponents || [],
      artifactComponents: this.artifactComponents,
      hasArtifactComponents: this.artifactComponents && this.artifactComponents.length > 0,
      hasAgentArtifactComponents,
      artifacts: referenceArtifacts,
    });
  }

  private async buildSystemPrompt(
    runtimeContext?: {
      contextId: string;
      metadata: {
        conversationId: string;
        threadId: string;
        streamRequestId?: string;
        streamBaseUrl?: string;
      };
    },
    excludeDataComponents: boolean = false
  ): Promise<string> {
    const conversationId = runtimeContext?.metadata?.conversationId || runtimeContext?.contextId;

    if (conversationId) {
      this.setConversationId(conversationId);
    }

    const resolvedContext = conversationId ? await this.getResolvedContext(conversationId) : null;

    let processedPrompt = this.config.prompt;
    if (resolvedContext) {
      try {
        processedPrompt = TemplateEngine.render(this.config.prompt, resolvedContext, {
          strict: false,
          preserveUnresolved: false,
        });
      } catch (error) {
        logger.error(
          {
            conversationId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to process agent prompt with context, using original'
        );
        processedPrompt = this.config.prompt;
      }
    }

    const streamRequestId = runtimeContext?.metadata?.streamRequestId;
    const mcpTools = await this.getMcpTools(undefined, streamRequestId);
    const functionTools = await this.getFunctionTools(streamRequestId || '');
    const relationTools = this.getRelationTools(runtimeContext);

    const allTools = { ...mcpTools, ...functionTools, ...relationTools };

    logger.info(
      {
        mcpTools: Object.keys(mcpTools),
        functionTools: Object.keys(functionTools),
        relationTools: Object.keys(relationTools),
        allTools: Object.keys(allTools),
        functionToolsDetails: Object.entries(functionTools).map(([name, tool]) => ({
          name,
          hasExecute: typeof (tool as any).execute === 'function',
          hasDescription: !!(tool as any).description,
          hasInputSchema: !!(tool as any).inputSchema,
        })),
      },
      'Tools loaded for agent'
    );

    const toolDefinitions = Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: (tool as any).description || '',
      inputSchema: (tool as any).inputSchema || (tool as any).parameters || {},
      usageGuidelines:
        name.startsWith('transfer_to_') || name.startsWith('delegate_to_')
          ? `Use this tool to ${name.startsWith('transfer_to_') ? 'transfer' : 'delegate'} to another agent when appropriate.`
          : 'Use this tool when appropriate for the task at hand.',
    }));

    const { getConversationScopedArtifacts } = await import('../data/conversations');
    const historyConfig =
      this.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

    const referenceArtifacts: Artifact[] = await getConversationScopedArtifacts({
      tenantId: this.config.tenantId,
      projectId: this.config.projectId,
      conversationId: runtimeContext?.contextId || '',
      historyConfig,
      ref: this.ref,
    });

    const componentDataComponents = excludeDataComponents ? [] : this.config.dataComponents || [];

    const isThinkingPreparation =
      this.config.dataComponents && this.config.dataComponents.length > 0 && excludeDataComponents;

    let prompt = await this.getPrompt();

    if (prompt && resolvedContext) {
      try {
        prompt = TemplateEngine.render(prompt, resolvedContext, {
          strict: false,
          preserveUnresolved: false,
        });
      } catch (error) {
        logger.error(
          {
            conversationId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to process agent prompt with context, using original'
        );
      }
    }

    const shouldIncludeArtifactComponents = !excludeDataComponents;

    const hasAgentArtifactComponents = await this.hasAgentArtifactComponents();

    const config: SystemPromptV1 = {
      corePrompt: processedPrompt,
      prompt,
      tools: toolDefinitions,
      dataComponents: componentDataComponents,
      artifacts: referenceArtifacts,
      artifactComponents: shouldIncludeArtifactComponents ? this.artifactComponents : [],
      hasAgentArtifactComponents,
      isThinkingPreparation,
      hasTransferRelations: (this.config.transferRelations?.length ?? 0) > 0,
      hasDelegateRelations: (this.config.delegateRelations?.length ?? 0) > 0,
    };
    return await this.systemPromptBuilder.buildSystemPrompt(config);
  }

  private getArtifactTools() {
    return tool({
      description:
        'Call this tool to get the complete artifact data with the given artifactId. This retrieves the full artifact content (not just the summary). Only use this when you need the complete artifact data and the summary shown in your context is insufficient.',
      inputSchema: z.object({
        artifactId: z.string().describe('The unique identifier of the artifact to get.'),
        toolCallId: z.string().describe('The tool call ID associated with this artifact.'),
      }),
      execute: async ({ artifactId, toolCallId }) => {
        logger.info({ artifactId, toolCallId }, 'get_artifact_full executed');

        // Use shared ArtifactService from AgentSessionManager
        const streamRequestId = this.getStreamRequestId();
        const artifactService = agentSessionManager.getArtifactService(streamRequestId);

        if (!artifactService) {
          throw new Error(`ArtifactService not found for session ${streamRequestId}`);
        }

        const artifactData = await artifactService.getArtifactFull(artifactId, toolCallId);
        if (!artifactData) {
          throw new Error(`Artifact ${artifactId} with toolCallId ${toolCallId} not found`);
        }

        return {
          artifactId: artifactData.artifactId,
          name: artifactData.name,
          description: artifactData.description,
          type: artifactData.type,
          data: artifactData.data,
        };
      },
    });
  }

  // Create the thinking_complete tool to mark end of planning phase
  private createThinkingCompleteTool(): any {
    return tool({
      description:
        '🚨 CRITICAL: Call this tool IMMEDIATELY when you have gathered enough information to answer the user. This is MANDATORY - you CANNOT provide text responses in thinking mode, only tool calls. Call thinking_complete as soon as you have sufficient data to generate a structured response.',
      inputSchema: z.object({
        complete: z.boolean().describe('ALWAYS set to true - marks end of research phase'),
        summary: z
          .string()
          .describe(
            'Brief summary of what information was gathered and why it is sufficient to answer the user'
          ),
      }),
      execute: async (params) => params,
    });
  }

  // Provide a default tool set that is always available to the agent.
  private async getDefaultTools(streamRequestId?: string): Promise<ToolSet> {
    const defaultTools: ToolSet = {};

    // Add get_reference_artifact if any agent in the agent has artifact components
    // This enables cross-agent artifact collaboration within the same agent
    if (await this.agentHasArtifactComponents()) {
      defaultTools.get_reference_artifact = this.getArtifactTools();
    }

    // Note: save_tool_result tool is replaced by artifact:create response annotations
    // Agents with artifact components will receive creation instructions in their system prompt

    // Add thinking_complete tool if we have structured output components
    const hasStructuredOutput = this.config.dataComponents && this.config.dataComponents.length > 0;

    if (hasStructuredOutput) {
      const thinkingCompleteTool = this.createThinkingCompleteTool();
      if (thinkingCompleteTool) {
        defaultTools.thinking_complete = this.wrapToolWithStreaming(
          'thinking_complete',
          thinkingCompleteTool,
          streamRequestId,
          'tool'
        );
      }
    }

    return defaultTools;
  }

  private getStreamRequestId(): string {
    return this.streamRequestId || '';
  }

  /**
   * Format tool result for storage in conversation history
   */
  private formatToolResult(toolName: string, args: any, result: any, toolCallId: string): string {
    const input = args ? JSON.stringify(args, null, 2) : 'No input';

    // Handle string results that might be JSON - try to parse them
    let parsedResult = result;
    if (typeof result === 'string') {
      try {
        parsedResult = JSON.parse(result);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    // Clean result by removing _structureHints before storing
    // Check if _structureHints is nested inside the 'result' property
    const cleanResult =
      parsedResult && typeof parsedResult === 'object' && !Array.isArray(parsedResult)
        ? {
            ...parsedResult,
            result:
              parsedResult.result &&
              typeof parsedResult.result === 'object' &&
              !Array.isArray(parsedResult.result)
                ? Object.fromEntries(
                    Object.entries(parsedResult.result).filter(([key]) => key !== '_structureHints')
                  )
                : parsedResult.result,
          }
        : parsedResult;

    const output =
      typeof cleanResult === 'string' ? cleanResult : JSON.stringify(cleanResult, null, 2);

    return `## Tool: ${toolName}

### 🔧 TOOL_CALL_ID: ${toolCallId}

### Input
${input}

### Output
${output}`;
  }

  /**
   * Get the conversation ID for storing tool results
   * Always uses the real conversation ID - delegation filtering happens at query time
   */
  private getToolResultConversationId(): string | undefined {
    return this.conversationId;
  }

  /**
   * Analyze tool result structure and add helpful path hints for artifact creation
   * Only adds hints when artifact components are available
   */
  private enhanceToolResultWithStructureHints(result: any): any {
    if (!result) {
      return result;
    }

    // Only add structure hints if artifact components are available
    if (!this.artifactComponents || this.artifactComponents.length === 0) {
      return result;
    }

    // Parse embedded JSON if result is a string
    let parsedForAnalysis = result;
    if (typeof result === 'string') {
      try {
        parsedForAnalysis = parseEmbeddedJson(result);
      } catch (_error) {
        // If parsing fails, analyze the original result
        parsedForAnalysis = result;
      }
    }

    if (!parsedForAnalysis || typeof parsedForAnalysis !== 'object') {
      return result;
    }

    const findAllPaths = (obj: any, prefix = 'result', depth = 0): string[] => {
      if (depth > 8) return []; // Allow deeper exploration

      const paths: string[] = [];

      if (Array.isArray(obj)) {
        if (obj.length > 0) {
          // Add the array path itself
          paths.push(`${prefix}[array-${obj.length}-items]`);

          // Add filtering examples based on actual data
          if (obj[0] && typeof obj[0] === 'object') {
            const sampleItem = obj[0];
            Object.keys(sampleItem).forEach((key) => {
              const value = sampleItem[key];
              if (typeof value === 'string' && value.length < 50) {
                paths.push(`${prefix}[?${key}=='${value}']`);
              } else if (typeof value === 'boolean') {
                paths.push(`${prefix}[?${key}==${value}]`);
              } else if (key === 'id' || key === 'name' || key === 'type') {
                paths.push(`${prefix}[?${key}=='value']`);
              }
            });
          }

          // Recurse into array items to find nested structures (use filtering instead of selecting all)
          paths.push(...findAllPaths(obj[0], `${prefix}[?field=='value']`, depth + 1));
        }
      } else if (obj && typeof obj === 'object') {
        // Add each property path
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = `${prefix}.${key}`;

          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              paths.push(`${currentPath}[array]`);
            } else {
              paths.push(`${currentPath}[object]`);
            }
            // Recurse into nested structures
            paths.push(...findAllPaths(value, currentPath, depth + 1));
          } else {
            // Terminal field
            paths.push(`${currentPath}[${typeof value}]`);
          }
        });
      }

      return paths;
    };

    const findCommonFields = (obj: any, depth = 0): Set<string> => {
      if (depth > 5) return new Set();

      const fields = new Set<string>();
      if (Array.isArray(obj)) {
        // Check first few items for common field patterns
        obj.slice(0, 3).forEach((item) => {
          if (item && typeof item === 'object') {
            Object.keys(item).forEach((key) => {
              fields.add(key);
            });
          }
        });
      } else if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach((key) => {
          fields.add(key);
        });
        Object.values(obj).forEach((value) => {
          findCommonFields(value, depth + 1).forEach((field) => {
            fields.add(field);
          });
        });
      }
      return fields;
    };

    // Find deeply nested paths that might be good for filtering
    const findUsefulSelectors = (obj: any, prefix = 'result', depth = 0): string[] => {
      if (depth > 5) return [];

      const selectors: string[] = [];

      if (Array.isArray(obj) && obj.length > 0) {
        const firstItem = obj[0];
        if (firstItem && typeof firstItem === 'object') {
          // Add specific filtering examples based on actual data
          if (firstItem.title) {
            selectors.push(
              `${prefix}[?title=='${String(firstItem.title).replace(/'/g, "\\'")}'] | [0]`
            );
          }
          if (firstItem.type) {
            selectors.push(`${prefix}[?type=='${firstItem.type}'] | [0]`);
          }
          if (firstItem.record_type) {
            selectors.push(`${prefix}[?record_type=='${firstItem.record_type}'] | [0]`);
          }
          if (firstItem.url) {
            selectors.push(`${prefix}[?url!=null] | [0]`);
          }

          // Add compound filters for better specificity
          if (firstItem.type && firstItem.title) {
            selectors.push(
              `${prefix}[?type=='${firstItem.type}' && title=='${String(firstItem.title).replace(/'/g, "\\'")}'] | [0]`
            );
          }

          // Add direct indexed access as fallback
          selectors.push(`${prefix}[0]`);
        }
      } else if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            selectors.push(...findUsefulSelectors(value, `${prefix}.${key}`, depth + 1));
          }
        });
      }

      return selectors;
    };

    // Find nested content paths specifically
    const findNestedContentPaths = (obj: any, prefix = 'result', depth = 0): string[] => {
      if (depth > 6) return [];

      const paths: string[] = [];

      if (obj && typeof obj === 'object') {
        // Look for nested content structures
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = `${prefix}.${key}`;

          if (Array.isArray(value) && value.length > 0) {
            // Check if this is a content array with structured items
            const firstItem = value[0];
            if (firstItem && typeof firstItem === 'object') {
              if (firstItem.type === 'document' || firstItem.type === 'text') {
                paths.push(`${currentPath}[?type=='document'] | [0]`);
                paths.push(`${currentPath}[?type=='text'] | [0]`);

                // Add specific filtering based on actual content
                if (firstItem.title) {
                  const titleSample = String(firstItem.title).slice(0, 20);
                  paths.push(
                    `${currentPath}[?title && contains(title, '${titleSample.split(' ')[0]}')] | [0]`
                  );
                }
                if (firstItem.record_type) {
                  paths.push(`${currentPath}[?record_type=='${firstItem.record_type}'] | [0]`);
                }
              }
            }

            // Continue deeper into nested structures
            paths.push(...findNestedContentPaths(value, currentPath, depth + 1));
          } else if (value && typeof value === 'object') {
            paths.push(...findNestedContentPaths(value, currentPath, depth + 1));
          }
        });
      }

      return paths;
    };

    try {
      const allPaths = findAllPaths(parsedForAnalysis);
      const commonFields = Array.from(findCommonFields(parsedForAnalysis)).slice(0, 15);
      const usefulSelectors = findUsefulSelectors(parsedForAnalysis).slice(0, 10);
      const nestedContentPaths = findNestedContentPaths(parsedForAnalysis).slice(0, 8);

      // Get comprehensive path information
      const terminalPaths = allPaths
        .filter((p) => p.includes('[string]') || p.includes('[number]') || p.includes('[boolean]'))
        .slice(0, 20);
      const arrayPaths = allPaths.filter((p) => p.includes('[array')).slice(0, 15);
      const objectPaths = allPaths.filter((p) => p.includes('[object]')).slice(0, 15);

      // Combine all selector examples and remove duplicates
      const allSelectors = [...usefulSelectors, ...nestedContentPaths];
      const uniqueSelectors = [...new Set(allSelectors)].slice(0, 15);

      // Add structure hints to the original result (not the parsed version)
      const enhanced = {
        ...result,
        _structureHints: {
          terminalPaths: terminalPaths, // All field paths that contain actual values
          arrayPaths: arrayPaths, // All array structures found
          objectPaths: objectPaths, // All nested object structures
          commonFields: commonFields,
          exampleSelectors: uniqueSelectors,
          deepStructureExamples: nestedContentPaths,
          maxDepthFound: Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length)),
          totalPathsFound: allPaths.length,
          artifactGuidance: {
            creationFirst:
              '🚨 CRITICAL: Artifacts must be CREATED before they can be referenced. Use ArtifactCreate_[Type] components FIRST, then reference with Artifact components only if citing the SAME artifact again.',
            baseSelector:
              "🎯 CRITICAL: Use base_selector to navigate to ONE specific item. For deeply nested structures with repeated keys, use full paths with specific filtering (e.g., \"result.data.content.items[?type=='guide' && status=='active']\")",
            detailsSelector:
              '📝 Use relative selectors for specific fields (e.g., "title", "metadata.category", "properties.status", "content.details")',
            avoidLiterals:
              '❌ NEVER use literal values - always use field selectors to extract from data',
            avoidArrays:
              '✨ ALWAYS filter arrays to single items using [?condition] - NEVER use [*] notation which returns arrays',
            nestedKeys:
              '🔑 For structures with repeated keys (like result.content.data.content.items.content), use full paths with filtering at each level',
            filterTips:
              "💡 Use compound filters for precision: [?type=='document' && category=='api']",
            forbiddenSyntax:
              '🚫 FORBIDDEN JMESPATH PATTERNS:\n' +
              "❌ NEVER: [?title~'.*text.*'] (regex patterns with ~ operator)\n" +
              "❌ NEVER: [?field~'pattern.*'] (any ~ operator usage)\n" +
              "❌ NEVER: [?title~'Slack.*Discord.*'] (regex wildcards)\n" +
              "❌ NEVER: [?name~'https://.*'] (regex in URL matching)\n" +
              "❌ NEVER: [?text ~ contains(@, 'word')] (~ with @ operator)\n" +
              "❌ NEVER: contains(@, 'text') (@ operator usage)\n" +
              '❌ NEVER: [?field=="value"] (double quotes in filters)\n' +
              "❌ NEVER: result.items[?type=='doc'][?status=='active'] (chained filters)\n" +
              '✅ USE INSTEAD:\n' +
              "✅ [?contains(title, 'text')] (contains function)\n" +
              "✅ [?title=='exact match'] (exact string matching)\n" +
              "✅ [?contains(title, 'Slack') && contains(title, 'Discord')] (compound conditions)\n" +
              "✅ [?starts_with(url, 'https://')] (starts_with function)\n" +
              "✅ [?type=='doc' && status=='active'] (single filter with &&)",
            pathDepth: `📏 This structure goes ${Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length))} levels deep - use full paths to avoid ambiguity`,
          },
          note: `Comprehensive structure analysis: ${allPaths.length} paths found, ${Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length))} levels deep. Use specific filtering for precise selection.`,
        },
      };

      return enhanced;
    } catch (error) {
      logger.warn({ error }, 'Failed to enhance tool result with structure hints');
      return result;
    }
  }

  // Check if any agents in the agent have artifact components
  private async agentHasArtifactComponents(): Promise<boolean> {
    try {
      return await executeInBranch(
        {
          dbClient: dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await agentHasArtifactComponents(db)({
            scopes: {
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              agentId: this.config.agentId,
            },
          });
        }
      );
    } catch (error) {
      logger.error(
        { error, agentId: this.config.agentId },
        'Failed to check agent artifact components'
      );
      return false;
    }
  }

  async generate(
    userMessage: string,
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
  ) {
    return tracer.startActiveSpan(
      'agent.generate',
      {
        attributes: {
          'subAgent.id': this.config.id,
          'subAgent.name': this.config.name,
        },
      },
      async (span) => {
        // Use the ToolSession created by AgentSession
        // All agents in this execution share the same session
        const contextId = runtimeContext?.contextId || 'default';
        const taskId = runtimeContext?.metadata?.taskId || 'unknown';
        const streamRequestId = runtimeContext?.metadata?.streamRequestId;
        const sessionId = streamRequestId || 'fallback-session';

        // Note: ToolSession is now created by AgentSession, not by agents
        // This ensures proper lifecycle management and session coordination

        try {
          // Set streaming helper from registry if available
          this.streamRequestId = streamRequestId;
          this.streamHelper = streamRequestId ? getStreamHelper(streamRequestId) : undefined;

          // Update ArtifactService with this agent's artifact components
          if (streamRequestId && this.artifactComponents.length > 0) {
            agentSessionManager.updateArtifactComponents(streamRequestId, this.artifactComponents);
          }
          const conversationId = runtimeContext?.metadata?.conversationId;

          if (conversationId) {
            this.setConversationId(conversationId);
          }

          // Load all tools and both system prompts in parallel
          // Note: getDefaultTools needs to be called after streamHelper is set above
          const [
            mcpTools,
            systemPrompt,
            thinkingSystemPrompt,
            functionTools,
            relationTools,
            defaultTools,
          ] = await tracer.startActiveSpan(
            'agent.load_tools',
            {
              attributes: {
                'subAgent.name': this.config.name,
                'session.id': sessionId || 'none',
              },
            },
            async (childSpan: Span) => {
              try {
                const result = await Promise.all([
                  this.getMcpTools(sessionId, streamRequestId),
                  this.buildSystemPrompt(runtimeContext, false), // Normal prompt with data components
                  this.buildSystemPrompt(runtimeContext, true), // Thinking prompt without data components
                  this.getFunctionTools(sessionId, streamRequestId),
                  Promise.resolve(this.getRelationTools(runtimeContext, sessionId)),
                  this.getDefaultTools(streamRequestId),
                ]);

                childSpan.setStatus({ code: SpanStatusCode.OK });
                return result;
              } catch (err) {
                // Use helper function for consistent error handling
                const errorObj = err instanceof Error ? err : new Error(String(err));
                setSpanWithError(childSpan, errorObj);
                throw err;
              } finally {
                childSpan.end();
              }
            }
          );

          // Combine all tools for AI SDK
          const allTools = {
            ...mcpTools,
            ...functionTools,
            ...relationTools,
            ...defaultTools,
          };

          // Sanitize tool names at runtime for AI SDK compatibility
          const sanitizedTools = this.sanitizeToolsForAISDK(allTools);

          // Get conversation history
          let conversationHistory = '';
          const historyConfig =
            this.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

          if (historyConfig && historyConfig.mode !== 'none') {
            if (historyConfig.mode === 'full') {
              const filters = {
                delegationId: this.delegationId,
                isDelegated: this.isDelegatedAgent,
              };

              conversationHistory = await getFormattedConversationHistory({
                tenantId: this.config.tenantId,
                projectId: this.config.projectId,
                conversationId: contextId,
                currentMessage: userMessage,
                options: historyConfig,
                filters,
                ref: this.ref,
              });
            } else if (historyConfig.mode === 'scoped') {
              conversationHistory = await getFormattedConversationHistory({
                tenantId: this.config.tenantId,
                projectId: this.config.projectId,
                conversationId: contextId,
                currentMessage: userMessage,
                options: historyConfig,
                filters: {
                  subAgentId: this.config.id,
                  taskId: taskId,
                  delegationId: this.delegationId,
                  isDelegated: this.isDelegatedAgent,
                },
                ref: this.ref,
              });
            }
          }

          // Use the primary model for text generation
          const primaryModelSettings = this.getPrimaryModel();
          const modelSettings = ModelFactory.prepareGenerationConfig(primaryModelSettings);
          let response: any;
          let textResponse: string;

          // Check if we have structured output components
          const hasStructuredOutput =
            this.config.dataComponents && this.config.dataComponents.length > 0;

          // Phase 1: Stream only if no structured output needed
          const shouldStreamPhase1 = this.getStreamingHelper() && !hasStructuredOutput;

          // Extract maxDuration from config and convert to milliseconds, or use defaults
          // Add upper bound validation to prevent extremely long timeouts
          const configuredTimeout = modelSettings.maxDuration
            ? Math.min(modelSettings.maxDuration * 1000, LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS)
            : shouldStreamPhase1
              ? LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING
              : LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING;

          // Ensure timeout doesn't exceed maximum
          const timeoutMs = Math.min(configuredTimeout, LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS);

          if (
            modelSettings.maxDuration &&
            modelSettings.maxDuration * 1000 > LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS
          ) {
            logger.warn(
              {
                requestedTimeout: modelSettings.maxDuration * 1000,
                appliedTimeout: timeoutMs,
                maxAllowed: LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
              },
              'Requested timeout exceeded maximum allowed, capping to 10 minutes'
            );
          }

          // Build messages for Phase 1 - use thinking prompt if structured output needed
          const phase1SystemPrompt = hasStructuredOutput ? thinkingSystemPrompt : systemPrompt;
          const messages: any[] = [];
          messages.push({ role: 'system', content: phase1SystemPrompt });

          if (conversationHistory.trim() !== '') {
            messages.push({ role: 'user', content: conversationHistory });
          }
          messages.push({
            role: 'user',
            content: userMessage,
          });

          // ----- PHASE 1: Planning with tools -----

          if (shouldStreamPhase1) {
            // Streaming Phase 1: Natural text + tools (no structured output needed)
            const streamConfig = {
              ...modelSettings,
              toolChoice: 'auto' as const, // Allow natural text + tools
            };

            // Use streamText for Phase 1 (text-only responses)
            const streamResult = streamText({
              ...streamConfig,
              messages,
              tools: sanitizedTools,
              stopWhen: async ({ steps }) => {
                const last = steps.at(-1);
                if (last && 'text' in last && last.text) {
                  try {
                    await agentSessionManager.recordEvent(
                      this.getStreamRequestId(),
                      'agent_reasoning',
                      this.config.id,
                      {
                        parts: [{ type: 'text', content: last.text }],
                      }
                    );
                  } catch (error) {
                    logger.debug({ error }, 'Failed to track agent reasoning');
                  }
                }

                if (steps.length >= 2) {
                  const previousStep = steps[steps.length - 2];
                  if (previousStep && 'toolCalls' in previousStep && previousStep.toolCalls) {
                    const hasTransferCall = previousStep.toolCalls.some((tc: any) =>
                      tc.toolName.startsWith('transfer_to_')
                    );
                    if (
                      hasTransferCall &&
                      'toolResults' in previousStep &&
                      previousStep.toolResults
                    ) {
                      return true; // Stop after transfer tool has executed
                    }
                  }
                }

                return steps.length >= this.getMaxGenerationSteps();
              },
              experimental_telemetry: {
                isEnabled: true,
                functionId: this.config.id,
                recordInputs: true,
                recordOutputs: true,
                metadata: {
                  subAgentId: this.config.id,
                  subAgentName: this.config.name,
                },
              },
              abortSignal: AbortSignal.timeout(timeoutMs),
            });

            const streamHelper = this.getStreamingHelper();
            if (!streamHelper) {
              throw new Error('Stream helper is unexpectedly undefined in streaming context');
            }
            const session = toolSessionManager.getSession(sessionId);
            const artifactParserOptions = {
              sessionId,
              taskId: session?.taskId,
              projectId: session?.projectId,
              artifactComponents: this.artifactComponents,
              streamRequestId: this.getStreamRequestId(),
              subAgentId: this.config.id,
            };
            const parser = new IncrementalStreamParser(
              streamHelper,
              this.config.tenantId,
              contextId,
              this.ref,
              artifactParserOptions
            );

            for await (const event of streamResult.fullStream) {
              switch (event.type) {
                case 'text-delta':
                  await parser.processTextChunk(event.text);
                  break;
                case 'tool-call':
                  parser.markToolResult();
                  break;
                case 'tool-result':
                  parser.markToolResult();
                  break;
                case 'finish':
                  if (event.finishReason === 'tool-calls') {
                    parser.markToolResult();
                  }
                  break;
                case 'error': {
                  if (event.error instanceof Error) {
                    throw event.error;
                  }
                  const errorMessage = (event.error as any)?.error?.message;
                  throw new Error(errorMessage);
                }
              }
            }

            await parser.finalize();

            response = await streamResult;

            const collectedParts = parser.getCollectedParts();
            if (collectedParts.length > 0) {
              response.formattedContent = {
                parts: collectedParts.map((part) => ({
                  kind: part.kind,
                  ...(part.kind === 'text' && { text: part.text }),
                  ...(part.kind === 'data' && { data: part.data }),
                })),
              };
            }

            const streamedContent = parser.getAllStreamedContent();
            if (streamedContent.length > 0) {
              response.streamedContent = {
                parts: streamedContent.map((part: any) => ({
                  kind: part.kind,
                  ...(part.kind === 'text' && { text: part.text }),
                  ...(part.kind === 'data' && { data: part.data }),
                })),
              };
            }
          } else {
            let genConfig: any;
            if (hasStructuredOutput) {
              genConfig = {
                ...modelSettings,
                toolChoice: 'required' as const, // Force tool usage, prevent text generation
              };
            } else {
              genConfig = {
                ...modelSettings,
                toolChoice: 'auto' as const, // Allow both tools and text generation
              };
            }

            response = await generateText({
              ...genConfig,
              messages,
              tools: sanitizedTools,
              stopWhen: async ({ steps }) => {
                const last = steps.at(-1);
                if (last && 'text' in last && last.text) {
                  try {
                    await agentSessionManager.recordEvent(
                      this.getStreamRequestId(),
                      'agent_reasoning',
                      this.config.id,
                      {
                        parts: [{ type: 'text', content: last.text }],
                      }
                    );
                  } catch (error) {
                    logger.debug({ error }, 'Failed to track agent reasoning');
                  }
                }

                if (steps.length >= 2) {
                  const previousStep = steps[steps.length - 2];
                  if (previousStep && 'toolCalls' in previousStep && previousStep.toolCalls) {
                    const hasStopTool = previousStep.toolCalls.some(
                      (tc: any) =>
                        tc.toolName.startsWith('transfer_to_') ||
                        tc.toolName === 'thinking_complete'
                    );
                    if (hasStopTool && 'toolResults' in previousStep && previousStep.toolResults) {
                      return true; // Stop after transfer/thinking_complete tool has executed
                    }
                  }
                }

                return steps.length >= this.getMaxGenerationSteps();
              },
              experimental_telemetry: {
                isEnabled: true,
                functionId: this.config.id,
                recordInputs: true,
                recordOutputs: true,
                metadata: {
                  phase: 'planning',
                  subAgentId: this.config.id,
                  subAgentName: this.config.name,
                },
              },
              abortSignal: AbortSignal.timeout(timeoutMs),
            });
          }

          if (response.steps) {
            const resolvedSteps = await response.steps;
            response = { ...response, steps: resolvedSteps };
          }

          if (hasStructuredOutput && !hasToolCallWithPrefix('transfer_to_')(response)) {
            const thinkingCompleteCall = response.steps
              ?.flatMap((s: any) => s.toolCalls || [])
              ?.find((tc: any) => tc.toolName === 'thinking_complete');

            if (thinkingCompleteCall) {
              const reasoningFlow: any[] = [];
              if (response.steps) {
                response.steps.forEach((step: any) => {
                  if (step.toolCalls && step.toolResults) {
                    step.toolCalls.forEach((call: any, index: number) => {
                      const result = step.toolResults[index];
                      if (result) {
                        const storedResult = toolSessionManager.getToolResult(
                          sessionId,
                          result.toolCallId
                        );
                        const toolName = storedResult?.toolName || call.toolName;

                        if (toolName === 'thinking_complete') {
                          return;
                        }
                        const actualResult = storedResult?.result || result.result || result;
                        const actualArgs = storedResult?.args || call.args;

                        const cleanResult =
                          actualResult &&
                          typeof actualResult === 'object' &&
                          !Array.isArray(actualResult)
                            ? Object.fromEntries(
                                Object.entries(actualResult).filter(
                                  ([key]) => key !== '_structureHints'
                                )
                              )
                            : actualResult;

                        const input = actualArgs ? JSON.stringify(actualArgs, null, 2) : 'No input';
                        const output =
                          typeof cleanResult === 'string'
                            ? cleanResult
                            : JSON.stringify(cleanResult, null, 2);

                        let structureHintsFormatted = '';
                        if (
                          actualResult?._structureHints &&
                          this.artifactComponents &&
                          this.artifactComponents.length > 0
                        ) {
                          const hints = actualResult._structureHints;
                          structureHintsFormatted = `
### 📊 Structure Hints for Artifact Creation

**Terminal Field Paths (${hints.terminalPaths?.length || 0} found):**
${hints.terminalPaths?.map((path: string) => `  • ${path}`).join('\n') || '  None detected'}

**Array Structures (${hints.arrayPaths?.length || 0} found):**
${hints.arrayPaths?.map((path: string) => `  • ${path}`).join('\n') || '  None detected'}

**Object Structures (${hints.objectPaths?.length || 0} found):**
${hints.objectPaths?.map((path: string) => `  • ${path}`).join('\n') || '  None detected'}

**Example Selectors:**
${hints.exampleSelectors?.map((sel: string) => `  • ${sel}`).join('\n') || '  None detected'}

**Common Fields:**
${hints.commonFields?.map((field: string) => `  • ${field}`).join('\n') || '  None detected'}

**Structure Stats:** ${hints.totalPathsFound || 0} total paths, ${hints.maxDepthFound || 0} levels deep

**Note:** ${hints.note || 'Use these paths for artifact base selectors.'}

**Forbidden Syntax:** ${hints.forbiddenSyntax || 'Use these paths for artifact base selectors.'}
`;
                        }

                        const formattedResult = `## Tool: ${call.toolName}

### 🔧 TOOL_CALL_ID: ${result.toolCallId}

### Input
${input}

### Output
${output}${structureHintsFormatted}`;

                        reasoningFlow.push({
                          role: 'assistant',
                          content: formattedResult,
                        });
                      }
                    });
                  }
                });
              }

              const componentSchemas: z.ZodType<any>[] = [];

              if (this.config.dataComponents && this.config.dataComponents.length > 0) {
                this.config.dataComponents.forEach((dc) => {
                  const propsSchema = jsonSchemaToZod(dc.props);
                  componentSchemas.push(
                    z.object({
                      id: z.string(),
                      name: z.literal(dc.name),
                      props: propsSchema,
                    })
                  );
                });
              }

              if (this.artifactComponents.length > 0) {
                const artifactCreateSchemas = ArtifactCreateSchema.getSchemas(
                  this.artifactComponents
                );
                componentSchemas.push(...artifactCreateSchemas);
                componentSchemas.push(ArtifactReferenceSchema.getSchema());
              }

              let dataComponentsSchema: z.ZodType<any>;
              if (componentSchemas.length === 1) {
                dataComponentsSchema = componentSchemas[0];
              } else {
                dataComponentsSchema = z.union(
                  componentSchemas as [z.ZodType<any>, z.ZodType<any>, ...z.ZodType<any>[]]
                );
              }

              const structuredModelSettings = ModelFactory.prepareGenerationConfig(
                this.getStructuredOutputModel()
              );

              // Configure Phase 2 timeout with proper capping to MAX_ALLOWED
              const configuredPhase2Timeout = structuredModelSettings.maxDuration
                ? Math.min(
                    structuredModelSettings.maxDuration * 1000,
                    LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS
                  )
                : LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS;

              // Ensure timeout doesn't exceed maximum
              const phase2TimeoutMs = Math.min(
                configuredPhase2Timeout,
                LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS
              );

              if (
                structuredModelSettings.maxDuration &&
                structuredModelSettings.maxDuration * 1000 > LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS
              ) {
                logger.warn(
                  {
                    requestedTimeout: structuredModelSettings.maxDuration * 1000,
                    appliedTimeout: phase2TimeoutMs,
                    maxAllowed: LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
                    phase: 'structured_generation',
                  },
                  'Phase 2 requested timeout exceeded maximum allowed, capping to 10 minutes'
                );
              }

              const shouldStreamPhase2 = this.getStreamingHelper();

              if (shouldStreamPhase2) {
                const phase2Messages: any[] = [
                  {
                    role: 'system',
                    content: await this.buildPhase2SystemPrompt(runtimeContext),
                  },
                ];

                if (conversationHistory.trim() !== '') {
                  phase2Messages.push({ role: 'user', content: conversationHistory });
                }

                phase2Messages.push({ role: 'user', content: userMessage });
                phase2Messages.push(...reasoningFlow);

                const streamResult = streamObject({
                  ...structuredModelSettings,
                  messages: phase2Messages,
                  schema: z.object({
                    dataComponents: z.array(dataComponentsSchema),
                  }),
                  experimental_telemetry: {
                    isEnabled: true,
                    functionId: this.config.id,
                    recordInputs: true,
                    recordOutputs: true,
                    metadata: {
                      phase: 'structured_generation',
                      subAgentId: this.config.id,
                      subAgentName: this.config.name,
                    },
                  },
                  abortSignal: AbortSignal.timeout(phase2TimeoutMs),
                });

                const streamHelper = this.getStreamingHelper();
                if (!streamHelper) {
                  throw new Error('Stream helper is unexpectedly undefined in streaming context');
                }
                const session = toolSessionManager.getSession(sessionId);
                const artifactParserOptions = {
                  sessionId,
                  taskId: session?.taskId,
                  projectId: session?.projectId,
                  artifactComponents: this.artifactComponents,
                  streamRequestId: this.getStreamRequestId(),
                  subAgentId: this.config.id,
                };
                const parser = new IncrementalStreamParser(
                  streamHelper,
                  this.config.tenantId,
                  contextId,
                  this.ref,
                  artifactParserOptions
                );

                for await (const delta of streamResult.partialObjectStream) {
                  if (delta) {
                    await parser.processObjectDelta(delta);
                  }
                }

                await parser.finalize();

                const structuredResponse = await streamResult;

                const collectedParts = parser.getCollectedParts();
                if (collectedParts.length > 0) {
                  response.formattedContent = {
                    parts: collectedParts.map((part) => ({
                      kind: part.kind,
                      ...(part.kind === 'text' && { text: part.text }),
                      ...(part.kind === 'data' && { data: part.data }),
                    })),
                  };
                }

                response = {
                  ...response,
                  object: structuredResponse.object,
                };
                textResponse = JSON.stringify(structuredResponse.object, null, 2);
              } else {
                const { withJsonPostProcessing } = await import('../utils/json-postprocessor');

                const phase2Messages: any[] = [
                  { role: 'system', content: await this.buildPhase2SystemPrompt(runtimeContext) },
                ];

                if (conversationHistory.trim() !== '') {
                  phase2Messages.push({ role: 'user', content: conversationHistory });
                }

                phase2Messages.push({ role: 'user', content: userMessage });
                phase2Messages.push(...reasoningFlow);

                const structuredResponse = await generateObject(
                  withJsonPostProcessing({
                    ...structuredModelSettings,
                    messages: phase2Messages,
                    schema: z.object({
                      dataComponents: z.array(dataComponentsSchema),
                    }),
                    experimental_telemetry: {
                      isEnabled: true,
                      functionId: this.config.id,
                      recordInputs: true,
                      recordOutputs: true,
                      metadata: {
                        phase: 'structured_generation',
                        subAgentId: this.config.id,
                        subAgentName: this.config.name,
                      },
                    },
                    abortSignal: AbortSignal.timeout(phase2TimeoutMs),
                  })
                );

                response = {
                  ...response,
                  object: structuredResponse.object,
                };
                textResponse = JSON.stringify(structuredResponse.object, null, 2);
              }
            } else {
              textResponse = response.text || '';
            }
          } else {
            textResponse = response.steps[response.steps.length - 1].text || '';
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          let formattedContent: MessageContent | null = response.formattedContent || null;

          if (!formattedContent) {
            const session = toolSessionManager.getSession(sessionId);
            const responseFormatter = new ResponseFormatter(this.config.tenantId, this.ref, {
              sessionId,
              taskId: session?.taskId,
              projectId: session?.projectId,
              contextId,
              artifactComponents: this.artifactComponents,
              streamRequestId: this.getStreamRequestId(),
              subAgentId: this.config.id,
            });

            if (response.object) {
              formattedContent = await responseFormatter.formatObjectResponse(
                response.object,
                contextId
              );
            } else if (textResponse) {
              formattedContent = await responseFormatter.formatResponse(textResponse, contextId);
            }
          }

          const formattedResponse = {
            ...response,
            formattedContent: formattedContent,
          };

          if (streamRequestId) {
            const generationType = response.object ? 'object_generation' : 'text_generation';

            agentSessionManager.recordEvent(streamRequestId, 'agent_generate', this.config.id, {
              parts: (formattedContent?.parts || []).map((part) => ({
                type:
                  part.kind === 'text'
                    ? ('text' as const)
                    : part.kind === 'data'
                      ? ('tool_result' as const)
                      : ('text' as const),
                content: part.text || JSON.stringify(part.data),
              })),
              generationType,
            });
          }

          return formattedResponse;
        } catch (error) {
          // Don't clean up ToolSession on error - let ToolSessionManager handle cleanup
          const errorToThrow = error instanceof Error ? error : new Error(String(error));
          setSpanWithError(span, errorToThrow);
          span.end();
          throw errorToThrow;
        }
      }
    );
  }
}
