import {
  type AgentConversationHistoryConfig,
  type AgentStopWhen,
  type Artifact,
  type ArtifactComponentApiInsert,
  ContextResolver,
  type CredentialStoreRegistry,
  CredentialStuffer,
  type DataComponentApiInsert,
  getContextConfigById,
  getCredentialReference,
  getFullGraphDefinition,
  getLedgerArtifacts,
  getToolsForAgent,
  graphHasArtifactComponents,
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
  createDefaultConversationHistoryConfig,
  getFormattedConversationHistory,
} from '../data/conversations';

import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { graphSessionManager } from '../services/GraphSession';
import { IncrementalStreamParser } from '../services/IncrementalStreamParser';
import { ResponseFormatter } from '../services/ResponseFormatter';
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

// Constants for agent configuration
const CONSTANTS = {
  MAX_GENERATION_STEPS: 12,
  PHASE_1_TIMEOUT_MS: 270_000, // 4.5 minutes for streaming phase 1
  NON_STREAMING_PHASE_1_TIMEOUT_MS: 90_000, // 1.5 minutes for non-streaming phase 1
  PHASE_2_TIMEOUT_MS: 90_000, // 1.5 minutes for phase 2 structured output
} as const;

// Helper function to validate model strings
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
  graphId: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyId?: string;
  name: string;
  description: string;
  agentPrompt: string;
  agentRelations: AgentConfig[];
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
  stopWhen?: AgentStopWhen;
};

export type ExternalAgentConfig = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
};

export type DelegateRelation =
  | { type: 'internal'; config: AgentConfig }
  | { type: 'external'; config: ExternalAgentConfig };

export type ToolType = 'transfer' | 'delegation' | 'mcp' | 'tool';

// Type guard to validate MCP tools have the expected AI SDK structure
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

// LLM Generated Information as a config LLM? Separate Step?

export class Agent {
  private config: AgentConfig;
  private systemPromptBuilder = new SystemPromptBuilder('v1', new Phase1Config());
  private credentialStuffer?: CredentialStuffer;
  private streamHelper?: StreamHelper;
  private streamRequestId?: string;
  private conversationId?: string;
  private artifactComponents: ArtifactComponentApiInsert[] = [];
  private isDelegatedAgent: boolean = false;
  private contextResolver?: ContextResolver;
  private credentialStoreRegistry?: CredentialStoreRegistry;

  constructor(config: AgentConfig, credentialStoreRegistry?: CredentialStoreRegistry) {
    // Store artifact components separately
    this.artifactComponents = config.artifactComponents || [];

    // Process dataComponents (now only component-type)
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

    // If we have artifact components, add the default artifact data components for response hydration
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
      // Set default conversation history if not provided
      conversationHistoryConfig:
        config.conversationHistoryConfig || createDefaultConversationHistoryConfig(),
    };

    // Store the credential store registry
    this.credentialStoreRegistry = credentialStoreRegistry;

    // Use provided credential store registry if available
    if (credentialStoreRegistry) {
      this.contextResolver = new ContextResolver(
        config.tenantId,
        config.projectId,
        dbClient,
        credentialStoreRegistry
      );
      this.credentialStuffer = new CredentialStuffer(credentialStoreRegistry, this.contextResolver);
    }
  }

  /**
   * Get the maximum number of generation steps for this agent
   * Uses agent's stopWhen.stepCountIs config or defaults to CONSTANTS.MAX_GENERATION_STEPS
   */
  private getMaxGenerationSteps(): number {
    return this.config.stopWhen?.stepCountIs ?? CONSTANTS.MAX_GENERATION_STEPS;
  }

  /**
   * Sanitizes tool names at runtime for AI SDK compatibility.
   * The AI SDK requires tool names to match pattern ^[a-zA-Z0-9_-]{1,128}$
   */
  private sanitizeToolsForAISDK(tools: ToolSet): ToolSet {
    const sanitizedTools: ToolSet = {};

    for (const [originalKey, toolDef] of Object.entries(tools)) {
      // Sanitize the tool key (object property name)
      let sanitizedKey = originalKey.replace(/[^a-zA-Z0-9_-]/g, '_');
      sanitizedKey = sanitizedKey.replace(/_+/g, '_');
      sanitizedKey = sanitizedKey.replace(/^_+|_+$/g, '');

      if (!sanitizedKey || sanitizedKey.length === 0) {
        sanitizedKey = 'unnamed_tool';
      }

      if (sanitizedKey.length > 100) {
        sanitizedKey = sanitizedKey.substring(0, 100);
      }

      // Clone the tool with a sanitized ID
      const originalId = (toolDef as any).id || originalKey;
      let sanitizedId = originalId.replace(/[^a-zA-Z0-9_.-]/g, '_');
      sanitizedId = sanitizedId.replace(/_+/g, '_');
      sanitizedId = sanitizedId.replace(/^_+|_+$/g, '');

      if (sanitizedId.length > 128) {
        sanitizedId = sanitizedId.substring(0, 128);
      }

      // Create a new tool object with sanitized ID
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

    // Use structured output config if available, otherwise fall back to base
    const structuredConfig = this.config.models.structuredOutput;
    const baseConfig = this.config.models.base;

    // If structured output is explicitly configured, use only its config
    if (structuredConfig) {
      return {
        model: validateModel(structuredConfig.model, 'Structured output'),
        providerOptions: structuredConfig.providerOptions,
      };
    }

    // Fall back to base model settings if structured output not configured
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
   * Get streaming helper if this agent should stream to user
   * Returns undefined for delegated agents to prevent streaming data operations to user
   */
  getStreamingHelper(): StreamHelper | undefined {
    return this.isDelegatedAgent ? undefined : this.streamHelper;
  }

  /**
   * Wraps a tool with streaming lifecycle tracking (start, complete, error) and GraphSession recording
   */
  private wrapToolWithStreaming(
    toolName: string,
    toolDefinition: any,
    streamRequestId?: string,
    toolType?: ToolType
  ) {
    if (!toolDefinition || typeof toolDefinition !== 'object' || !('execute' in toolDefinition)) {
      return toolDefinition;
    }

    const originalExecute = toolDefinition.execute;
    return {
      ...toolDefinition,
      execute: async (args: any, context?: any) => {
        const startTime = Date.now();
        // Use the AI SDK's toolCallId consistently instead of generating our own
        const toolId = context?.toolCallId || generateToolId();

        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.setAttributes({
            'conversation.id': this.conversationId,
            'tool.purpose': toolDefinition.description || 'No description provided',
            'ai.toolType': toolType || 'unknown',
            'ai.agentName': this.config.name || 'unknown',
            'graph.id': this.config.graphId || 'unknown',
          });
        }

        // Check if this is an internal tool to skip from recording
        const isInternalTool =
          toolName.includes('save_tool_result') ||
          toolName.includes('thinking_complete') ||
          toolName.startsWith('transfer_to_') ||
          toolName.startsWith('delegate_to_');

        try {
          const result = await originalExecute(args, context);
          const duration = Date.now() - startTime;

          // Record complete tool execution in GraphSession (skip internal tools)
          if (streamRequestId && !isInternalTool) {
            graphSessionManager.recordEvent(streamRequestId, 'tool_execution', this.config.id, {
              toolName,
              args,
              result,
              toolId,
              duration,
            });
          }

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Record tool execution with error (skip internal tools)
          if (streamRequestId && !isInternalTool) {
            graphSessionManager.recordEvent(streamRequestId, 'tool_execution', this.config.id, {
              toolName,
              args,
              result: { error: errorMessage },
              toolId,
              duration,
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
    const createToolName = (prefix: string, agentId: string) =>
      `${prefix}_to_${agentId.toLowerCase().replace(/\s+/g, '_')}`;
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
              agent: this,
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
              graphId: this.config.graphId,
              contextId: runtimeContext?.contextId || 'default', // fallback for compatibility
              metadata: runtimeContext?.metadata || {
                conversationId: runtimeContext?.contextId || 'default',
                threadId: runtimeContext?.contextId || 'default',
                streamRequestId: runtimeContext?.metadata?.streamRequestId,
                apiKey: runtimeContext?.metadata?.apiKey,
              },
              sessionId,
              agent: this,
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
    const tools =
      (await Promise.all(this.config.tools?.map((tool) => this.getMcpTool(tool)) || [])) || [];

    // If no sessionId, return tools as-is (for system prompt building)
    if (!sessionId) {
      const combinedTools = tools.reduce((acc, tool) => {
        return Object.assign(acc, tool) as ToolSet;
      }, {} as ToolSet);

      // Just wrap with streaming capability
      const wrappedTools: ToolSet = {};
      for (const [toolName, toolDef] of Object.entries(combinedTools)) {
        wrappedTools[toolName] = this.wrapToolWithStreaming(
          toolName,
          toolDef,
          streamRequestId,
          'mcp'
        );
      }
      return wrappedTools;
    }

    // Wrap each MCP tool to record results immediately upon execution
    const wrappedTools: ToolSet = {};
    for (const toolSet of tools) {
      for (const [toolName, originalTool] of Object.entries(toolSet)) {
        // Type guard to ensure we have a valid AI SDK tool
        if (!isValidTool(originalTool)) {
          logger.error({ toolName }, 'Invalid MCP tool structure - missing required properties');
          continue;
        }

        // First wrap with session management
        const sessionWrappedTool = tool({
          description: originalTool.description,
          inputSchema: originalTool.inputSchema,
          execute: async (args, { toolCallId }) => {
            logger.debug({ toolName, toolCallId }, 'MCP Tool Called');

            try {
              // Call the original MCP tool with proper error handling
              const rawResult = await originalTool.execute(args, { toolCallId });

              // Parse any embedded JSON in the result
              const parsedResult = parseEmbeddedJson(rawResult);

              // Analyze result structure and add path hints for artifact creation
              const enhancedResult = this.enhanceToolResultWithStructureHints(parsedResult);

              // Record the enhanced result in the session manager

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

        // Then wrap with streaming capability
        wrappedTools[toolName] = this.wrapToolWithStreaming(
          toolName,
          sessionWrappedTool,
          streamRequestId,
          'mcp'
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
    const credentialReferenceId = tool.credentialReferenceId;

    const toolsForAgent = await getToolsForAgent(dbClient)({
      scopes: {
        tenantId: this.config.tenantId,
        projectId: this.config.projectId,
        graphId: this.config.graphId,
        agentId: this.config.id,
      },
    });

    const agentToolRelationHeaders =
      toolsForAgent.data.find((t) => t.toolId === tool.id)?.headers || undefined;

    const selectedTools =
      toolsForAgent.data.find((t) => t.toolId === tool.id)?.selectedTools || undefined;

    // Build server config with credentials using new architecture
    let serverConfig: McpServerConfig;

    if (credentialReferenceId && this.credentialStuffer) {
      // Database lookup to get credential store configuration
      const credentialReference = await getCredentialReference(dbClient)({
        scopes: {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
        },
        id: credentialReferenceId,
      });

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
    } else if (tool.headers && this.credentialStuffer) {
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
      // No credentials - build basic config
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

    // Create and connect MCP client
    const client = new McpClient({
      name: tool.name,
      server: serverConfig,
    });

    await client.connect();
    return client.tools();
  }

  getFunctionTools(streamRequestId?: string) {
    if (!this.config.functionTools) return {};

    const functionTools: ToolSet = {};

    for (const funcTool of this.config.functionTools) {
      // Convert function tool to AI SDK format and wrap with streaming
      const aiTool = tool({
        description: funcTool.description,
        inputSchema: funcTool.schema || z.object({}),
        execute: funcTool.execute,
      });

      functionTools[funcTool.name] = this.wrapToolWithStreaming(
        funcTool.name,
        aiTool,
        streamRequestId,
        'tool'
      );
    }

    return functionTools;
  }

  /**
   * Get resolved context using ContextResolver - will return cached data or fetch fresh data as needed
   */
  async getResolvedContext(
    conversationId: string,
    requestContext?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    try {
      if (!this.config.contextConfigId) {
        logger.debug({ graphId: this.config.graphId }, 'No context config found for graph');
        return null;
      }

      // Get context configuration
      const contextConfig = await getContextConfigById(dbClient)({
        scopes: { tenantId: this.config.tenantId, projectId: this.config.projectId },
        id: this.config.contextConfigId,
      });
      if (!contextConfig) {
        logger.warn({ contextConfigId: this.config.contextConfigId }, 'Context config not found');
        return null;
      }

      if (!this.contextResolver) {
        throw new Error('Context resolver not found');
      }

      // Resolve context with 'invocation' trigger to ensure fresh data for invocation definitions
      const result = await this.contextResolver.resolve(contextConfig, {
        triggerEvent: 'invocation',
        conversationId,
        requestContext: requestContext || {},
        tenantId: this.config.tenantId,
      });

      // Add built-in variables to resolved context
      const contextWithBuiltins = {
        ...result.resolvedContext,
        $now: new Date().toISOString(),
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
   * Get the graph prompt for this agent's graph
   */
  private async getGraphPrompt(): Promise<string | undefined> {
    try {
      const graphDefinition = await getFullGraphDefinition(dbClient)({
        scopes: {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          graphId: this.config.graphId,
        },
      });

      return graphDefinition?.graphPrompt || undefined;
    } catch (error) {
      logger.warn(
        {
          graphId: this.config.graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get graph prompt'
      );
      return undefined;
    }
  }

  /**
   * Check if any agent in the graph has artifact components configured
   */
  private async hasGraphArtifactComponents(): Promise<boolean> {
    try {
      const graphDefinition = await getFullGraphDefinition(dbClient)({
        scopes: {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          graphId: this.config.graphId,
        },
      });

      if (!graphDefinition) {
        return false;
      }

      // Check if any agent in the graph has artifact components
      return Object.values(graphDefinition.agents).some(
        (agent) =>
          'artifactComponents' in agent &&
          agent.artifactComponents &&
          agent.artifactComponents.length > 0
      );
    } catch (error) {
      logger.warn(
        {
          graphId: this.config.graphId,
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to check graph artifact components, assuming none exist'
      );
      // Fallback to current agent's artifact components if graph query fails
      return this.artifactComponents.length > 0;
    }
  }

  /**
   * Build adaptive system prompt for Phase 2 structured output generation
   * based on configured data components and artifact components across the graph
   */
  private async buildPhase2SystemPrompt(
    runtimeContext?: {
      contextId: string;
      metadata: {
        conversationId: string;
        threadId: string;
        streamRequestId?: string;
        streamBaseUrl?: string;
      };
    }
  ): Promise<string> {
    const phase2Config = new Phase2Config();
    const hasGraphArtifactComponents = await this.hasGraphArtifactComponents();

    // Get resolved context using ContextResolver
    const conversationId = runtimeContext?.metadata?.conversationId || runtimeContext?.contextId;
    const resolvedContext = conversationId ? await this.getResolvedContext(conversationId) : null;

    // Process agent prompt with context (same logic as buildSystemPrompt)
    let processedPrompt = this.config.agentPrompt;
    if (resolvedContext) {
      try {
        processedPrompt = TemplateEngine.render(this.config.agentPrompt, resolvedContext, {
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
        processedPrompt = this.config.agentPrompt;
      }
    }

    // Get reference artifacts from existing tasks (same logic as buildSystemPrompt)
    const referenceTaskIds: string[] = await listTaskIdsByContextId(dbClient)({
      contextId: this.conversationId || '',
    });

    const referenceArtifacts: Artifact[] = [];
    for (const taskId of referenceTaskIds) {
      const artifacts = await getLedgerArtifacts(dbClient)({
        scopes: {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
        },
        taskId: taskId,
      });
      referenceArtifacts.push(...artifacts);
    }

    return phase2Config.assemblePhase2Prompt({
      corePrompt: processedPrompt,
      dataComponents: this.config.dataComponents || [],
      artifactComponents: this.artifactComponents,
      hasArtifactComponents: this.artifactComponents && this.artifactComponents.length > 0,
      hasGraphArtifactComponents,
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
    // Get resolved context using ContextResolver
    const conversationId = runtimeContext?.metadata?.conversationId || runtimeContext?.contextId;

    // Set conversation ID if available
    if (conversationId) {
      this.setConversationId(conversationId);
    }

    const resolvedContext = conversationId ? await this.getResolvedContext(conversationId) : null;

    // Process agent prompt with context
    let processedPrompt = this.config.agentPrompt;
    if (resolvedContext) {
      try {
        processedPrompt = TemplateEngine.render(this.config.agentPrompt, resolvedContext, {
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
        processedPrompt = this.config.agentPrompt;
      }
    }

    // Get MCP tools, function tools, and relational tools
    const streamRequestId = runtimeContext?.metadata?.streamRequestId;
    const mcpTools = await this.getMcpTools(undefined, streamRequestId);
    const functionTools = this.getFunctionTools(streamRequestId);
    const relationTools = this.getRelationTools(runtimeContext);

    // Convert ToolSet objects to ToolData array format for system prompt
    const allTools = { ...mcpTools, ...functionTools, ...relationTools };

    const toolDefinitions = Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: (tool as any).description || '',
      inputSchema: (tool as any).inputSchema || (tool as any).parameters || {},
      usageGuidelines:
        name.startsWith('transfer_to_') || name.startsWith('delegate_to_')
          ? `Use this tool to ${name.startsWith('transfer_to_') ? 'transfer' : 'delegate'} to another agent when appropriate.`
          : 'Use this tool when appropriate for the task at hand.',
    }));

    // Get artifacts that match the conversation history scope
    const { getConversationScopedArtifacts } = await import('../data/conversations');
    const historyConfig =
      this.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

    const referenceArtifacts: Artifact[] = await getConversationScopedArtifacts({
      tenantId: this.config.tenantId,
      projectId: this.config.projectId,
      conversationId: runtimeContext?.contextId || '',
      historyConfig,
    });

    // Use component dataComponents for system prompt (artifacts already separated in constructor)
    const componentDataComponents = excludeDataComponents ? [] : this.config.dataComponents || [];

    // Use thinking/preparation mode when we have data components but are excluding them (Phase 1)
    const isThinkingPreparation =
      this.config.dataComponents && this.config.dataComponents.length > 0 && excludeDataComponents;

    // Get graph prompt for additional context
    let graphPrompt = await this.getGraphPrompt();

    // Process graph prompt with context variables
    if (graphPrompt && resolvedContext) {
      try {
        graphPrompt = TemplateEngine.render(graphPrompt, resolvedContext, {
          strict: false,
          preserveUnresolved: false,
        });
      } catch (error) {
        logger.error(
          {
            conversationId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to process graph prompt with context, using original'
        );
        // graphPrompt remains unchanged if processing fails
      }
    }

    // When excludeDataComponents = true (Phase 1 of two-phase), don't include artifact components
    // When excludeDataComponents = false (Phase 2 or single-phase), include artifact components
    const shouldIncludeArtifactComponents = !excludeDataComponents;

    // Check if any agent in the graph has artifact components (for referencing guidance)
    const hasGraphArtifactComponents = await this.hasGraphArtifactComponents();

    const config: SystemPromptV1 = {
      corePrompt: processedPrompt,
      graphPrompt,
      tools: toolDefinitions,
      dataComponents: componentDataComponents,
      artifacts: referenceArtifacts,
      artifactComponents: shouldIncludeArtifactComponents ? this.artifactComponents : [],
      hasGraphArtifactComponents,
      isThinkingPreparation,
      hasTransferRelations: (this.config.transferRelations?.length ?? 0) > 0,
      hasDelegateRelations: (this.config.delegateRelations?.length ?? 0) > 0,
    };
    return await this.systemPromptBuilder.buildSystemPrompt(config);
  }

  private getArtifactTools() {
    return tool({
      description:
        'Call this tool to get the artifact with the given artifactId. Only retrieve this when the description of the artifact is insufficient to understand the artifact and you need to see the actual artifact for more context. Please refrain from using this tool unless absolutely necessary.',
      inputSchema: z.object({
        artifactId: z.string().describe('The unique identifier of the artifact to get.'),
      }),
      execute: async ({ artifactId }) => {
        logger.info({ artifactId }, 'get_artifact executed');
        const artifact = await getLedgerArtifacts(dbClient)({
          scopes: {
            tenantId: this.config.tenantId,
            projectId: this.config.projectId,
          },
          artifactId,
        });
        if (!artifact) {
          throw new Error(`Artifact ${artifactId} not found`);
        }
        return { artifact: artifact[0] };
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
  private async getDefaultTools(sessionId?: string, streamRequestId?: string): Promise<ToolSet> {
    const defaultTools: ToolSet = {};

    // Add get_reference_artifact if any agent in the graph has artifact components
    // This enables cross-agent artifact collaboration within the same graph
    if (await this.graphHasArtifactComponents()) {
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
      } catch (error) {
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
            Object.keys(item).forEach((key) => fields.add(key));
          }
        });
      } else if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach((key) => fields.add(key));
        Object.values(obj).forEach((value) => {
          findCommonFields(value, depth + 1).forEach((field) => fields.add(field));
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
            summaryProps:
              '📝 Use relative selectors from that item (e.g., "title", "metadata.category", "properties.status")',
            fullProps:
              '📖 Use relative selectors for detailed data (e.g., "content.details", "specifications.data", "attributes")',
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

  // Check if any agents in the graph have artifact components
  private async graphHasArtifactComponents(): Promise<boolean> {
    try {
      return await graphHasArtifactComponents(dbClient)({
        scopes: {
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          graphId: this.config.graphId,
        },
      });
    } catch (error) {
      logger.error(
        { error, graphId: this.config.graphId },
        'Failed to check graph artifact components'
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
    return tracer.startActiveSpan('agent.generate', async (span) => {
      // Use the ToolSession created by GraphSession
      // All agents in this execution share the same session
      const contextId = runtimeContext?.contextId || 'default';
      const taskId = runtimeContext?.metadata?.taskId || 'unknown';
      const streamRequestId = runtimeContext?.metadata?.streamRequestId;
      const sessionId = streamRequestId || 'fallback-session';

      // Note: ToolSession is now created by GraphSession, not by agents
      // This ensures proper lifecycle management and session coordination

      try {
        // Set streaming helper from registry if available
        this.streamRequestId = streamRequestId;
        this.streamHelper = streamRequestId ? getStreamHelper(streamRequestId) : undefined;
        const conversationId = runtimeContext?.metadata?.conversationId;

        // Set conversation ID if available
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
              'agent.name': this.config.name,
              'session.id': sessionId || 'none',
            },
          },
          async (childSpan: Span) => {
            try {
              const result = await Promise.all([
                this.getMcpTools(sessionId, streamRequestId),
                this.buildSystemPrompt(runtimeContext, false), // Normal prompt with data components
                this.buildSystemPrompt(runtimeContext, true), // Thinking prompt without data components
                Promise.resolve(this.getFunctionTools(streamRequestId)),
                Promise.resolve(this.getRelationTools(runtimeContext, sessionId)),
                this.getDefaultTools(sessionId, streamRequestId),
              ]);

              childSpan.setStatus({ code: SpanStatusCode.OK });
              return result;
            } catch (err) {
              // Use helper function for consistent error handling
              setSpanWithError(childSpan, err);
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
            conversationHistory = await getFormattedConversationHistory({
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              conversationId: contextId,
              currentMessage: userMessage,
              options: historyConfig,
              filters: {},
            });
          } else if (historyConfig.mode === 'scoped') {
            conversationHistory = await getFormattedConversationHistory({
              tenantId: this.config.tenantId,
              projectId: this.config.projectId,
              conversationId: contextId,
              currentMessage: userMessage,
              options: historyConfig,
              filters: {
                agentId: this.config.id,
                taskId: taskId,
              },
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
        const MAX_ALLOWED_TIMEOUT_MS = 600_000; // 10 minutes maximum
        const configuredTimeout = modelSettings.maxDuration
          ? Math.min(modelSettings.maxDuration * 1000, MAX_ALLOWED_TIMEOUT_MS)
          : shouldStreamPhase1
            ? CONSTANTS.PHASE_1_TIMEOUT_MS
            : CONSTANTS.NON_STREAMING_PHASE_1_TIMEOUT_MS;

        // Ensure timeout doesn't exceed maximum
        const timeoutMs = Math.min(configuredTimeout, MAX_ALLOWED_TIMEOUT_MS);

        if (
          modelSettings.maxDuration &&
          modelSettings.maxDuration * 1000 > MAX_ALLOWED_TIMEOUT_MS
        ) {
          logger.warn(
            {
              requestedTimeout: modelSettings.maxDuration * 1000,
              appliedTimeout: timeoutMs,
              maxAllowed: MAX_ALLOWED_TIMEOUT_MS,
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
              // Track the last step's text reasoning
              const last = steps.at(-1);
              if (last && 'text' in last && last.text) {
                try {
                  await graphSessionManager.recordEvent(
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

              // Return the actual stop condition
              if (last && 'toolCalls' in last && last.toolCalls) {
                return last.toolCalls.some((tc: any) => tc.toolName.startsWith('transfer_to_'));
              }
              // Safety cap at configured max steps
              return steps.length >= this.getMaxGenerationSteps();
            },
            experimental_telemetry: {
              isEnabled: true,
              functionId: this.config.id,
              recordInputs: true,
              recordOutputs: true,
            },
            abortSignal: AbortSignal.timeout(timeoutMs),
          });

          // Create incremental parser that will format and stream to user
          const streamHelper = this.getStreamingHelper();
          if (!streamHelper) {
            throw new Error('Stream helper is unexpectedly undefined in streaming context');
          }
          // Get session info from tool session manager
          const session = toolSessionManager.getSession(sessionId);
          const artifactParserOptions = {
            sessionId,
            taskId: session?.taskId,
            projectId: session?.projectId,
            artifactComponents: this.artifactComponents,
            streamRequestId: this.getStreamRequestId(),
            agentId: this.config.id,
          };
          const parser = new IncrementalStreamParser(
            streamHelper,
            this.config.tenantId,
            contextId,
            artifactParserOptions
          );

          // Process the full stream - track all events including tool calls
          // Note: stopWhen will automatically stop on transfer_to_
          for await (const event of streamResult.fullStream) {
            switch (event.type) {
              case 'text-delta':
                await parser.processTextChunk(event.text);
                break;
              case 'tool-call':
                // Mark that a tool call happened
                parser.markToolResult();
                break;
              case 'tool-result':
                // Tool result finished, next text should have spacing
                parser.markToolResult();
                break;
              case 'finish':
                // Stream finished, check if it was due to tool calls
                if (event.finishReason === 'tool-calls') {
                  parser.markToolResult();
                }
                break;
              // Handle other event types if needed
            }
          }

          // Finalize the stream
          await parser.finalize();

          // Get the complete result for A2A protocol
          response = await streamResult;

          // Build formattedContent from collected parts
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
        } else {
          // Non-streaming Phase 1
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

          // Use generateText for Phase 1 planning
          response = await generateText({
            ...genConfig,
            messages,
            tools: sanitizedTools,
            stopWhen: async ({ steps }) => {
              // Track the last step's text reasoning
              const last = steps.at(-1);
              if (last && 'text' in last && last.text) {
                try {
                  await graphSessionManager.recordEvent(
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

              // Return the actual stop condition
              if (last && 'toolCalls' in last && last.toolCalls) {
                return last.toolCalls.some(
                  (tc: any) =>
                    tc.toolName.startsWith('transfer_to_') || tc.toolName === 'thinking_complete'
                );
              }
              // Safety cap at configured max steps
              return steps.length >= this.getMaxGenerationSteps();
            },
            experimental_telemetry: {
              isEnabled: true,
              functionId: this.config.id,
              recordInputs: true,
              recordOutputs: true,
              metadata: {
                phase: 'planning',
              },
            },
            abortSignal: AbortSignal.timeout(timeoutMs),
          });
        }

        // Resolve steps Promise so task handler can access the array properly
        if (response.steps) {
          const resolvedSteps = await response.steps;
          response = { ...response, steps: resolvedSteps };
        }

        // ----- PHASE 2: Structured Output Generation -----
        if (hasStructuredOutput && !hasToolCallWithPrefix('transfer_to_')(response)) {
          // Check if thinking_complete was called (successful Phase 1)
          const thinkingCompleteCall = response.steps
            ?.flatMap((s: any) => s.toolCalls || [])
            ?.find((tc: any) => tc.toolName === 'thinking_complete');

          if (thinkingCompleteCall) {
            // Build reasoning flow from Phase 1 steps
            const reasoningFlow: any[] = [];
            if (response.steps) {
              response.steps.forEach((step: any) => {
                // Add tool calls and results as formatted messages
                if (step.toolCalls && step.toolResults) {
                  step.toolCalls.forEach((call: any, index: number) => {
                    const result = step.toolResults[index];
                    if (result) {
                      const storedResult = toolSessionManager.getToolResult(
                        sessionId,
                        result.toolCallId
                      );
                      const toolName = storedResult?.toolName || call.toolName;

                      // Skip tool_thinking tool
                      if (toolName === 'thinking_complete') {
                        return;
                      }
                      // Default formatting for all other tools
                      const actualResult = storedResult?.result || result.result || result;
                      const actualArgs = storedResult?.args || call.args;

                      // Filter out _structureHints from the result for clean JSON output
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

                      // Format structure hints if present and artifact components are available
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

            // Build component schemas using reusable classes
            const componentSchemas: z.ZodType<any>[] = [];

            // Add data component schemas
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

            // Add artifact schemas only when artifact components are available
            if (this.artifactComponents.length > 0) {
              // Add one ArtifactCreate schema for each artifact component type
              const artifactCreateSchemas = ArtifactCreateSchema.getSchemas(
                this.artifactComponents
              );
              componentSchemas.push(...artifactCreateSchemas);
              // Add the single reference schema for all types
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

            // Phase 2: Generate structured output
            const structuredModelSettings = ModelFactory.prepareGenerationConfig(
              this.getStructuredOutputModel()
            );
            const phase2TimeoutMs = structuredModelSettings.maxDuration
              ? structuredModelSettings.maxDuration * 1000
              : CONSTANTS.PHASE_2_TIMEOUT_MS;

            // Check if we should stream Phase 2 structured output
            const shouldStreamPhase2 = this.getStreamingHelper();

            if (shouldStreamPhase2) {
              // Streaming Phase 2: Stream structured output with incremental parser
              const phase2Messages: any[] = [
                {
                  role: 'system',
                  content: await this.buildPhase2SystemPrompt(runtimeContext),
                },
              ];

              // Add conversation history if available
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
                  },
                },
                abortSignal: AbortSignal.timeout(phase2TimeoutMs),
              });

              // Create incremental parser for object streaming
              const streamHelper = this.getStreamingHelper();
              if (!streamHelper) {
                throw new Error('Stream helper is unexpectedly undefined in streaming context');
              }
              // Get session info for artifact parser
              const session = toolSessionManager.getSession(sessionId);
              const artifactParserOptions = {
                sessionId,
                taskId: session?.taskId,
                projectId: session?.projectId,
                artifactComponents: this.artifactComponents,
                streamRequestId: this.getStreamRequestId(),
                agentId: this.config.id,
              };
              const parser = new IncrementalStreamParser(
                streamHelper,
                this.config.tenantId,
                contextId,
                artifactParserOptions
              );

              // Process the object stream with better delta handling
              for await (const delta of streamResult.partialObjectStream) {
                if (delta) {
                  // Process object deltas directly
                  await parser.processObjectDelta(delta);
                }
              }

              // Finalize the stream
              await parser.finalize();

              // Get the complete structured response
              const structuredResponse = await streamResult;

              // Build formattedContent from collected parts
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

              // Merge structured output into response
              response = {
                ...response,
                object: structuredResponse.object,
              };
              textResponse = JSON.stringify(structuredResponse.object, null, 2);
            } else {
              // Non-streaming Phase 2: Use generateObject as fallback
              const { withJsonPostProcessing } = await import('../utils/json-postprocessor');

              // Build Phase 2 messages with conversation history
              const phase2Messages: any[] = [
                { role: 'system', content: await this.buildPhase2SystemPrompt(runtimeContext) },
              ];

              // Add conversation history if available
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
                    },
                  },
                  abortSignal: AbortSignal.timeout(phase2TimeoutMs),
                })
              );

              // Merge structured output into response
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

        // Mark span as successful
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        // Format response - handle object vs text responses differently
        // Only format if we don't already have formattedContent from streaming
        let formattedContent: MessageContent | null = response.formattedContent || null;

        if (!formattedContent) {
          // Create ResponseFormatter with proper context
          const session = toolSessionManager.getSession(sessionId);
          const responseFormatter = new ResponseFormatter(this.config.tenantId, {
            sessionId,
            taskId: session?.taskId,
            projectId: session?.projectId,
            contextId,
            artifactComponents: this.artifactComponents,
            streamRequestId: this.getStreamRequestId(),
            agentId: this.config.id,
          });

          if (response.object) {
            // For object responses, replace artifact markers and convert to parts array
            formattedContent = await responseFormatter.formatObjectResponse(
              response.object,
              contextId
            );
          } else if (textResponse) {
            // For text responses, apply artifact marker formatting to create text/data parts
            formattedContent = await responseFormatter.formatResponse(textResponse, contextId);
          }
        }

        const formattedResponse = {
          ...response,
          formattedContent: formattedContent,
        };

        // Record agent generation in GraphSession
        if (streamRequestId) {
          const generationType = response.object ? 'object_generation' : 'text_generation';

          graphSessionManager.recordEvent(streamRequestId, 'agent_generate', this.config.id, {
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

        // Don't clean up ToolSession here - let ToolSessionManager handle timeout-based cleanup
        // The ToolSession might still be needed by other agents in the graph execution

        return formattedResponse;
      } catch (error) {
        // Don't clean up ToolSession on error - let ToolSessionManager handle cleanup

        // Record exception and mark span as error
        setSpanWithError(span, error);
        span.end();
        throw error;
      }
    });
  }
}
