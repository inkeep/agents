import { z } from '@hono/zod-openapi';
import {
  type AgentConversationHistoryConfig,
  type Artifact,
  type ArtifactComponentApiInsert,
  type CredentialStoreRegistry,
  CredentialStuffer,
  configureComposioMCPServer,
  createMessage,
  type DataComponentApiInsert,
  type DataPart,
  type FilePart,
  type FullExecutionContext,
  generateId,
  getFunctionToolsForSubAgent,
  isGithubWorkAppTool,
  JsonTransformer,
  MCPServerType,
  type MCPToolConfig,
  MCPTransportType,
  McpClient,
  type McpServerConfig,
  type McpTool,
  type MessageContent,
  ModelFactory,
  type ModelSettings,
  type Models,
  type Part,
  parseEmbeddedJson,
  type ResolvedRef,
  type SubAgentSkillWithIndex,
  type SubAgentStopWhen,
  TemplateEngine,
  unwrapError,
  withRef,
} from '@inkeep/agents-core';
import { type Span, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  type FinishReason,
  generateText,
  Output,
  type StepResult,
  type StreamTextResult,
  streamText,
  type Tool,
  type ToolSet,
  tool,
} from 'ai';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import {
  AGENT_EXECUTION_MAX_GENERATION_STEPS,
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING,
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
} from '../constants/execution-limits';
import { ContextResolver } from '../context';
import {
  createDefaultConversationHistoryConfig,
  getConversationHistoryWithCompression,
} from '../data/conversations';
import { agentSessionManager, type ToolCallData } from '../services/AgentSession';
import { getModelAwareCompressionConfig } from '../services/BaseCompressor';
import { IncrementalStreamParser } from '../services/IncrementalStreamParser';
import { MidGenerationCompressor } from '../services/MidGenerationCompressor';
import { pendingToolApprovalManager } from '../services/PendingToolApprovalManager';
import { ResponseFormatter } from '../services/ResponseFormatter';
import { toolApprovalUiBus } from '../services/ToolApprovalUiBus';
import type { ImageDetail } from '../types/chat';
import type { SandboxConfig } from '../types/executionContext';
import { generateToolId } from '../utils/agent-operations';
import { ArtifactCreateSchema, ArtifactReferenceSchema } from '../utils/artifact-component-schema';
import { formatOversizedRetrievalReason } from '../utils/artifact-utils';
import { withJsonPostProcessing } from '../utils/json-postprocessor';
import { extractTextFromParts } from '../utils/message-parts';
import { getCompressionConfigForModel, getModelContextWindow } from '../utils/model-context-utils';
import { SchemaProcessor } from '../utils/SchemaProcessor';
import type { StreamHelper } from '../utils/stream-helpers';
import { getStreamHelper } from '../utils/stream-registry';
import {
  type AssembleResult,
  type ContextBreakdown,
  calculateBreakdownTotal,
  estimateTokens,
} from '../utils/token-estimator';
import { createDeniedToolResult, isToolResultDenied } from '../utils/tool-result';
import { setSpanWithError, tracer } from '../utils/tracer';
import { createDelegateToAgentTool, createTransferToAgentTool } from './relationTools';
import { SystemPromptBuilder } from './SystemPromptBuilder';
import { toolSessionManager } from './ToolSessionManager';
import type { SystemPromptV1 } from './types';
import { PromptConfig, V1_BREAKDOWN_SCHEMA } from './versions/v1/PromptConfig';

type AiSdkTextPart = {
  type: 'text';
  text: string;
};

type AiSdkImagePart = {
  type: 'image';
  image: string | URL;
  experimental_providerMetadata?: { openai?: { imageDetail?: ImageDetail } };
};

type AiSdkContentPart = AiSdkTextPart | AiSdkImagePart;

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

/**
 * Shape of a generation response after all Promise-based getters have been resolved.
 *
 * The AI SDK's `GenerateTextResult` and `StreamTextResult` classes expose properties
 * like `text`, `steps`, `finishReason`, and `output` as **prototype getters** — not
 * own enumerable properties. When one of these class instances is spread with `{ ...result }`,
 * the spread operator copies only own enumerable properties and silently drops the getters,
 * causing those fields to become `undefined` on the resulting plain object.
 *
 * This type represents the safely-resolved plain object produced by
 * `resolveGenerationResponse`, where every needed getter has been awaited and
 * assigned as a concrete own property.
 */
export interface ResolvedGenerationResponse {
  steps: Array<StepResult<ToolSet>>;
  text: string;
  finishReason: FinishReason;
  output?: any;
  object?: any;
  formattedContent?: MessageContent | null;
}

/**
 * Resolves a generation response from either `generateText` or `streamText` into
 * a plain object with all needed values as own properties.
 *
 * **Why this exists:** The AI SDK returns class instances whose key properties
 * (`text`, `steps`, `finishReason`, `output`) are prototype getters.
 * `StreamTextResult` getters return `PromiseLike` values; `GenerateTextResult`
 * getters return direct values. In both cases, the spread operator `{ ...result }`
 * silently drops them. This function uses `Promise.resolve()` to safely resolve
 * both styles, then spreads them as explicit own properties so downstream code
 * (and further spreads) never loses them.
 */
export async function resolveGenerationResponse(
  response: Record<string, unknown>
): Promise<ResolvedGenerationResponse> {
  const stepsValue = response.steps;

  if (!stepsValue) {
    return response as unknown as ResolvedGenerationResponse;
  }

  try {
    const [steps, text, finishReason, output] = await Promise.all([
      Promise.resolve(
        stepsValue as PromiseLike<Array<StepResult<ToolSet>>> | Array<StepResult<ToolSet>>
      ),
      Promise.resolve(response.text as PromiseLike<string> | string),
      Promise.resolve(response.finishReason as PromiseLike<FinishReason> | FinishReason),
      Promise.resolve(response.output),
    ]);

    return {
      ...response,
      steps,
      text,
      finishReason,
      output,
    } as ResolvedGenerationResponse;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        responseKeys: Object.keys(response),
      },
      'Failed to resolve generation response properties - AI SDK response may be malformed'
    );
    throw new Error(
      `Failed to resolve generation response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

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
  agentId: string;
  relationId?: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyId?: string;
  name: string;
  description?: string;
  prompt?: string;
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
  skills?: SubAgentSkillWithIndex[];
  artifactComponents?: ArtifactComponentApiInsert[];
  conversationHistoryConfig?: AgentConversationHistoryConfig;
  models?: Models;
  stopWhen?: SubAgentStopWhen;
  sandboxConfig?: SandboxConfig;
  /** User ID for user-scoped credential lookup (from temp JWT) */
  userId?: string;
  /** Headers to forward to MCP servers (e.g., x-forwarded-cookie for user session auth) */
  forwardedHeaders?: Record<string, string>;
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
): tool is Tool & { execute: (args: any, context?: any) => Promise<any> } {
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
  private systemPromptBuilder = new SystemPromptBuilder('v1', new PromptConfig());
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
  private currentCompressor: MidGenerationCompressor | null = null;
  private executionContext: FullExecutionContext;
  private functionToolRelationshipIdByName: Map<string, string> = new Map();

  constructor(
    config: AgentConfig,
    executionContext: FullExecutionContext,
    credentialStoreRegistry?: CredentialStoreRegistry
  ) {
    this.artifactComponents = config.artifactComponents || [];
    this.executionContext = executionContext;

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
      this.contextResolver = new ContextResolver(executionContext, credentialStoreRegistry);
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

  #createRelationToolName(prefix: string, targetId: string): string {
    return `${prefix}_to_${targetId.toLowerCase().replace(/\s+/g, '_')}`;
  }

  #getRelationshipIdForTool(toolName: string, toolType?: ToolType): string | undefined {
    if (toolType === 'mcp') {
      const matchingTool = this.config.tools?.find((tool) => {
        if (tool.config?.type !== 'mcp') {
          return false;
        }

        if (tool.availableTools?.some((available) => available.name === toolName)) {
          return true;
        }

        if (tool.config.mcp.activeTools?.includes(toolName)) {
          return true;
        }

        return tool.name === toolName;
      });

      return matchingTool?.relationshipId;
    }

    if (toolType === 'tool') {
      return this.functionToolRelationshipIdByName.get(toolName);
    }

    if (toolType === 'delegation') {
      const relation = this.config.delegateRelations.find(
        (relation) => this.#createRelationToolName('delegate', relation.config.id) === toolName
      );

      return relation?.config.relationId;
    }
  }

  /**
   * Get the primary model settings for text generation
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

  /**
   * Get the model settings for summarization/distillation
   * Falls back to base model if summarizer not configured
   */
  private getSummarizerModel(): ModelSettings {
    if (!this.config.models) {
      throw new Error(
        'Model configuration is required. Please configure models at the project level.'
      );
    }

    const summarizerConfig = this.config.models.summarizer;
    const baseConfig = this.config.models.base;

    if (summarizerConfig) {
      return {
        model: validateModel(summarizerConfig.model, 'Summarizer'),
        providerOptions: summarizerConfig.providerOptions,
      };
    }

    if (!baseConfig) {
      throw new Error(
        'Base model configuration is required for summarizer fallback. Please configure models at the project level.'
      );
    }
    return {
      model: validateModel(baseConfig.model, 'Base (fallback for summarizer)'),
      providerOptions: baseConfig.providerOptions,
    };
  }

  setConversationId(conversationId: string) {
    this.conversationId = conversationId;
  }

  /**
   * Simple compression fallback: drop oldest messages to fit under token limit
   */

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
    options?: { needsApproval?: boolean; mcpServerId?: string; mcpServerName?: string }
  ) {
    if (!toolDefinition || typeof toolDefinition !== 'object' || !('execute' in toolDefinition)) {
      return toolDefinition;
    }
    const relationshipId = this.#getRelationshipIdForTool(toolName, toolType);

    const originalExecute = toolDefinition.execute;
    return {
      ...toolDefinition,
      execute: async (args: any, context?: any) => {
        const startTime = Date.now();
        const toolCallId = context?.toolCallId || generateToolId();
        const streamHelper = this.getStreamingHelper();

        const chunkString = (s: string, size = 16) => {
          const out: string[] = [];
          for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
          return out;
        };

        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          const attributes: Record<string, any> = {
            'conversation.id': this.conversationId,
            'tool.purpose': toolDefinition.description || 'No description provided',
            'ai.toolType': toolType || 'unknown',
            'subAgent.name': this.config.name || 'unknown',
            'subAgent.id': this.config.id || 'unknown',
            'agent.id': this.config.agentId || 'unknown',
          };

          if (options?.mcpServerId) {
            attributes['ai.toolCall.mcpServerId'] = options.mcpServerId;
          }
          if (options?.mcpServerName) {
            attributes['ai.toolCall.mcpServerName'] = options.mcpServerName;
          }

          activeSpan.setAttributes(attributes);
        }

        const isInternalTool =
          toolName.includes('save_tool_result') || toolName.startsWith('transfer_to_');
        // Note: delegate_to_ tools are internal for streaming/UI purposes.
        // We only stream tools that should surface in the user-facing UI.
        const isInternalToolForUi = isInternalTool || toolName.startsWith('delegate_to_');

        // Check if this tool needs approval first
        const needsApproval = options?.needsApproval || false;

        // Stream tool parts to the user-facing stream (delegated agents are intentionally suppressed)
        // This is separate from "data operations" / AgentSession events.
        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          const inputText = JSON.stringify(args ?? {});

          await streamHelper.writeToolInputStart({ toolCallId, toolName });

          for (const part of chunkString(inputText, 16)) {
            await streamHelper.writeToolInputDelta({ toolCallId, inputTextDelta: part });
          }

          await streamHelper.writeToolInputAvailable({
            toolCallId,
            toolName,
            input: args ?? {},
            providerMetadata: context?.providerMetadata,
          });
        }

        if (streamRequestId && !isInternalToolForUi) {
          const toolCallData: ToolCallData = {
            toolName,
            input: args,
            toolCallId,
            relationshipId,
            inDelegatedAgent: this.isDelegatedAgent,
          };

          // Add approval-specific data when needed
          if (needsApproval) {
            toolCallData.needsApproval = true;
            toolCallData.conversationId = this.conversationId;
          }

          await agentSessionManager.recordEvent(
            streamRequestId,
            'tool_call',
            this.config.id,
            toolCallData
          );
        }

        try {
          const result = await originalExecute(args, context);
          const duration = Date.now() - startTime;

          // Store tool result in conversation history
          const toolResultConversationId = this.getToolResultConversationId();

          if (streamRequestId && !isInternalToolForUi && toolResultConversationId) {
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

              await createMessage(runDbClient)(messagePayload);
            } catch (error) {
              logger.warn(
                { error, toolName, toolCallId, conversationId: toolResultConversationId },
                'Failed to store tool result in conversation history'
              );
            }
          }

          if (streamRequestId && !isInternalToolForUi) {
            agentSessionManager.recordEvent(streamRequestId, 'tool_result', this.config.id, {
              toolName,
              output: result,
              toolCallId,
              duration,
              relationshipId,
              needsApproval,
              inDelegatedAgent: this.isDelegatedAgent,
            });
          }

          const isDeniedResult = isToolResultDenied(result);

          if (streamRequestId && streamHelper && !isInternalToolForUi) {
            if (isDeniedResult) {
              await streamHelper.writeToolOutputDenied({ toolCallId });
            } else {
              await streamHelper.writeToolOutputAvailable({ toolCallId, output: result });
            }
          }

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const rootCause = unwrapError(error);
          const errorMessage = rootCause.message;

          if (streamRequestId && !isInternalToolForUi) {
            agentSessionManager.recordEvent(streamRequestId, 'tool_result', this.config.id, {
              toolName,
              output: null,
              toolCallId,
              duration,
              error: errorMessage,
              relationshipId,
              needsApproval,
              inDelegatedAgent: this.isDelegatedAgent,
            });
          }

          if (streamRequestId && streamHelper && !isInternalToolForUi) {
            await streamHelper.writeToolOutputError({ toolCallId, errorText: errorMessage });
          }

          throw rootCause;
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
    return Object.fromEntries([
      ...transferRelations.map((agentConfig) => {
        const toolName = this.#createRelationToolName('transfer', agentConfig.id);
        return [
          toolName,
          this.wrapToolWithStreaming(
            toolName,
            createTransferToAgentTool({
              transferConfig: agentConfig,
              callingAgentId: this.config.id,
              streamRequestId: runtimeContext?.metadata?.streamRequestId,
            }),
            runtimeContext?.metadata?.streamRequestId,
            'transfer'
          ),
        ];
      }),
      ...delegateRelations.map((relation) => {
        const toolName = this.#createRelationToolName('delegate', relation.config.id);

        return [
          toolName,
          this.wrapToolWithStreaming(
            toolName,
            createDelegateToAgentTool({
              delegateConfig: relation,
              callingAgentId: this.config.id,
              executionContext: this.executionContext,
              contextId: runtimeContext?.contextId || 'default', // fallback for compatibility
              metadata: runtimeContext?.metadata || {
                conversationId: runtimeContext?.contextId || 'default',
                threadId: runtimeContext?.contextId || 'default',
                streamRequestId: runtimeContext?.metadata?.streamRequestId,
                apiKey: runtimeContext?.metadata?.apiKey,
              },
              sessionId,
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
    const tools = await Promise.all(mcpTools.map((tool) => this.getMcpTool(tool)));
    if (!sessionId) {
      const wrappedTools: ToolSet = {};
      for (const toolSet of tools) {
        for (const [toolName, toolDef] of Object.entries(toolSet.tools)) {
          // Find toolPolicies for this tool
          const needsApproval = toolSet.toolPolicies?.[toolName]?.needsApproval || false;

          const enhancedTool = {
            ...(toolDef || {}),
            needsApproval,
          };

          wrappedTools[toolName] = this.wrapToolWithStreaming(
            toolName,
            enhancedTool,
            streamRequestId,
            'mcp',
            {
              needsApproval,
              mcpServerId: toolSet.mcpServerId,
              mcpServerName: toolSet.mcpServerName,
            }
          );
        }
      }
      return wrappedTools;
    }

    const wrappedTools: ToolSet = {};
    for (const toolResult of tools) {
      for (const [toolName, originalTool] of Object.entries(toolResult.tools)) {
        if (!isValidTool(originalTool)) {
          logger.error({ toolName }, 'Invalid MCP tool structure - missing required properties');
          continue;
        }

        // Check if this tool needs approval from toolPolicies
        const needsApproval = toolResult.toolPolicies?.[toolName]?.needsApproval || false;

        logger.debug(
          {
            toolName,
            toolPolicies: toolResult.toolPolicies,
            needsApproval,
            policyForThisTool: toolResult.toolPolicies?.[toolName],
          },
          'Tool approval check'
        );

        const sessionWrappedTool = tool({
          description: originalTool.description,
          inputSchema: originalTool.inputSchema,
          execute: async (args, { toolCallId, providerMetadata }: any) => {
            // Fix Claude's stringified JSON issue - convert any stringified JSON back to objects
            // This must happen first, before any logging or tracing, so spans show correct data
            let processedArgs: typeof args;
            try {
              processedArgs = parseEmbeddedJson(args);

              // Warn if we had to fix stringified JSON (indicates schema ambiguity issue)
              if (JSON.stringify(args) !== JSON.stringify(processedArgs)) {
                logger.warn(
                  { toolName, toolCallId },
                  'Fixed stringified JSON parameters (indicates schema ambiguity)'
                );
              }
            } catch (error) {
              logger.warn(
                { toolName, toolCallId, error: (error as Error).message },
                'Failed to parse embedded JSON, using original args'
              );
              processedArgs = args;
            }

            // Use processed args for all subsequent operations
            const finalArgs = processedArgs;

            // Check for approval requirement before execution
            if (needsApproval) {
              logger.info(
                { toolName, toolCallId, args: finalArgs },
                'Tool requires approval - waiting for user response'
              );

              // Add an event to the current active span if one exists
              const currentSpan = trace.getActiveSpan();
              if (currentSpan) {
                currentSpan.addEvent('tool.approval.requested', {
                  'tool.name': toolName,
                  'tool.callId': toolCallId,
                  'subAgent.id': this.config.id,
                });
              }

              // Emit an immediate span to mark that approval request was sent
              tracer.startActiveSpan(
                'tool.approval_requested',
                {
                  attributes: {
                    'tool.name': toolName,
                    'tool.callId': toolCallId,
                    'subAgent.id': this.config.id,
                    'subAgent.name': this.config.name,
                  },
                },
                (requestSpan: Span) => {
                  requestSpan.setStatus({ code: SpanStatusCode.OK });
                  requestSpan.end();
                }
              );

              // Emit a user-facing approval request stream part (tools in delegated agents are hidden)
              const streamHelper = this.getStreamingHelper();
              if (streamHelper) {
                await streamHelper.writeToolApprovalRequest({
                  approvalId: `aitxt-${toolCallId}`,
                  toolCallId,
                  toolName,
                  input: finalArgs as Record<string, unknown>,
                });
              } else if (this.isDelegatedAgent) {
                const streamRequestId = this.getStreamRequestId();
                if (streamRequestId) {
                  await toolApprovalUiBus.publish(streamRequestId, {
                    type: 'approval-needed',
                    toolCallId,
                    toolName,
                    input: finalArgs,
                    providerMetadata,
                    approvalId: `aitxt-${toolCallId}`,
                  });
                }
              }

              // Wait for approval (this promise resolves when user responds via API)
              const approvalResult = await pendingToolApprovalManager.waitForApproval(
                toolCallId,
                toolName,
                args,
                this.conversationId || 'unknown',
                this.config.id
              );

              if (!approvalResult.approved) {
                if (!streamHelper && this.isDelegatedAgent) {
                  const streamRequestId = this.getStreamRequestId();
                  if (streamRequestId) {
                    await toolApprovalUiBus.publish(streamRequestId, {
                      type: 'approval-resolved',
                      toolCallId,
                      approved: false,
                      reason: approvalResult.reason,
                    });
                  }
                }
                // User denied approval - return a message instead of executing the tool
                return tracer.startActiveSpan(
                  'tool.approval_denied',
                  {
                    attributes: {
                      'tool.name': toolName,
                      'tool.callId': toolCallId,
                      'subAgent.id': this.config.id,
                      'subAgent.name': this.config.name,
                      'tool.approval.reason': approvalResult.reason,
                    },
                  },
                  (denialSpan: Span) => {
                    logger.info(
                      { toolName, toolCallId, reason: approvalResult.reason },
                      'Tool execution denied by user'
                    );

                    denialSpan.setStatus({ code: SpanStatusCode.OK });
                    denialSpan.end();

                    return createDeniedToolResult(toolCallId, approvalResult.reason);
                  }
                );
              }

              // Tool was approved - create a span to show this
              tracer.startActiveSpan(
                'tool.approval_approved',
                {
                  attributes: {
                    'tool.name': toolName,
                    'tool.callId': toolCallId,
                    'subAgent.id': this.config.id,
                    'subAgent.name': this.config.name,
                  },
                },
                (approvedSpan: Span) => {
                  logger.info({ toolName, toolCallId }, 'Tool approved, continuing with execution');
                  approvedSpan.setStatus({ code: SpanStatusCode.OK });
                  approvedSpan.end();
                }
              );

              if (!streamHelper && this.isDelegatedAgent) {
                const streamRequestId = this.getStreamRequestId();
                if (streamRequestId) {
                  await toolApprovalUiBus.publish(streamRequestId, {
                    type: 'approval-resolved',
                    toolCallId,
                    approved: true,
                  });
                }
              }
            }

            logger.debug({ toolName, toolCallId }, 'MCP Tool Called');

            try {
              const rawResult = await originalTool.execute(finalArgs, { toolCallId });

              if (rawResult && typeof rawResult === 'object' && rawResult.isError) {
                const errorMessage = rawResult.content?.[0]?.text || 'MCP tool returned an error';
                logger.error(
                  { toolName, toolCallId, errorMessage, rawResult },
                  'MCP tool returned error status'
                );

                toolSessionManager.recordToolResult(sessionId, {
                  toolCallId,
                  toolName,
                  args: finalArgs,
                  result: { error: errorMessage, failed: true },
                  timestamp: Date.now(),
                });

                if (streamRequestId) {
                  const relationshipId = this.#getRelationshipIdForTool(toolName, 'mcp');
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
                    relationshipId,
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

              const enhancedResult = this.enhanceToolResultWithStructureHints(
                parsedResult,
                toolCallId
              );

              toolSessionManager.recordToolResult(sessionId, {
                toolCallId,
                toolName,
                args: finalArgs,
                result: enhancedResult,
                timestamp: Date.now(),
              });

              return enhancedResult;
            } catch (error) {
              const rootCause = unwrapError(error);
              logger.error(
                { toolName, toolCallId, error: rootCause.message },
                'MCP tool execution failed'
              );
              throw rootCause;
            }
          },
        });

        wrappedTools[toolName] = this.wrapToolWithStreaming(
          toolName,
          sessionWrappedTool,
          streamRequestId,
          'mcp',
          {
            needsApproval,
            mcpServerId: toolResult.mcpServerId,
            mcpServerName: toolResult.mcpServerName,
          }
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
      toolOverrides: tool.config.mcp.toolOverrides,
    };
  }

  async getMcpTool(tool: McpTool) {
    // Include forwarded headers hash in cache key to ensure user session-specific connections
    // This prevents reusing a connection created without cookies for requests that have them
    const forwardedHeadersHash = this.config.forwardedHeaders
      ? Object.keys(this.config.forwardedHeaders).sort().join(',')
      : 'no-fwd';
    const cacheKey = `${this.config.tenantId}-${this.config.projectId}-${tool.id}-${tool.credentialReferenceId || 'no-cred'}-${forwardedHeadersHash}`;

    const project = this.executionContext.project;

    const credentialReferenceId = tool.credentialReferenceId;

    // Get tool relation from project context instead of database
    const subAgent = project.agents[this.config.agentId]?.subAgents?.[this.config.id];
    const toolRelation = subAgent?.canUse?.find((t) => t.toolId === tool.id);
    const agentToolRelationHeaders = toolRelation?.headers || undefined;
    const selectedTools = toolRelation?.toolSelection || undefined;
    const toolPolicies = toolRelation?.toolPolicies || {};

    let serverConfig: McpServerConfig;

    // Check for user-scoped credential first (uses toolId + userId lookup)
    const isUserScoped = tool.credentialScope === 'user';
    const userId = this.config.userId;

    if (isUserScoped && userId && this.credentialStuffer) {
      // User-scoped: look up credential by (toolId, userId)
      const userCredentialReference = project.credentialReferences
        ? Object.values(project.credentialReferences).find(
            (c) => c.toolId === tool.id && c.userId === userId
          )
        : undefined;

      if (userCredentialReference) {
        const storeReference = {
          credentialStoreId: userCredentialReference.credentialStoreId,
          retrievalParams: userCredentialReference.retrievalParams || {},
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
      } else {
        // User hasn't connected their credential yet - build config without auth
        logger.warn(
          { toolId: tool.id, userId },
          'User-scoped tool has no credential connected for this user'
        );
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
      }
    } else if (credentialReferenceId && this.credentialStuffer) {
      // Project-scoped: look up credential by credentialReferenceId

      const credentialReference = project.credentialReferences?.[credentialReferenceId];

      if (!credentialReference) {
        throw new Error(`Credential reference not found: ${credentialReferenceId}`);
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

    // Inject github workapp tool id and authorization header if the tool is a github workapp
    if (isGithubWorkAppTool(tool)) {
      serverConfig.headers = {
        ...serverConfig.headers,
        'x-inkeep-tool-id': tool.id,
        Authorization: `Bearer ${env.GITHUB_MCP_API_KEY}`,
      };
    }

    // Inject user_id and x-api-key for Composio servers at runtime
    configureComposioMCPServer(
      serverConfig,
      this.config.tenantId,
      this.config.projectId,
      isUserScoped ? 'user' : 'project',
      userId
    );

    // Merge forwarded headers (user session auth) into server config
    if (this.config.forwardedHeaders && Object.keys(this.config.forwardedHeaders).length > 0) {
      serverConfig.headers = {
        ...serverConfig.headers,
        ...this.config.forwardedHeaders,
      };
    }

    logger.info(
      {
        toolName: tool.name,
        credentialReferenceId,
        transportType: serverConfig.type,
        headers: tool.headers,
        hasForwardedHeaders: !!this.config.forwardedHeaders,
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

    const originalTools = await client.tools();

    // Apply tool overrides if configured
    const tools = await this.applyToolOverrides(originalTools, tool);

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
            const relationshipId = this.#getRelationshipIdForTool(tool.name, 'mcp');
            agentSessionManager.recordEvent(streamRequestId, 'error', this.config.id, {
              message: `MCP server has 0 effective tools. Double check the selected tools in your graph and the active tools in the MCP server configuration.`,
              code: 'no_tools_available',
              severity: 'error',
              context: {
                toolName: tool.name,
                serverUrl: tool.config.type === 'mcp' ? tool.config.mcp.server.url : 'unknown',
                operation: 'mcp_tool_discovery',
              },
              relationshipId,
            });
            span.end();
          }
        );
      }
    }

    return { tools, toolPolicies, mcpServerId: tool.id, mcpServerName: tool.name };
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
    const project = this.executionContext.project;
    try {
      const functionToolsForAgent = await withRef(
        manageDbPool,
        this.executionContext.resolvedRef,
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

      const functionToolsData = functionToolsForAgent.data ?? [];

      if (functionToolsData.length === 0) {
        return functionTools;
      }

      this.functionToolRelationshipIdByName = new Map(
        (functionToolsData as Array<{ name: string; relationshipId?: string }>).flatMap((t) => {
          return t.relationshipId ? ([[t.name, t.relationshipId]] as Array<[string, string]>) : [];
        })
      );

      const { SandboxExecutorFactory } = await import('../tools/SandboxExecutorFactory');
      const sandboxExecutor = sessionId
        ? SandboxExecutorFactory.getForSession(sessionId)
        : new SandboxExecutorFactory();

      for (const functionToolDef of functionToolsData) {
        const functionId = functionToolDef.functionId;
        if (!functionId) {
          logger.warn(
            { functionToolId: functionToolDef.id },
            'Function tool missing functionId reference'
          );
          continue;
        }

        const functionData = project.functions?.[functionId];
        if (!functionData) {
          logger.warn(
            { functionId, functionToolId: functionToolDef.id },
            'Function not found in functions table'
          );
          continue;
        }

        const zodSchema = functionData.inputSchema
          ? z.fromJSONSchema(functionData.inputSchema)
          : z.string();
        const toolPolicies = (functionToolDef as any).toolPolicies as
          | Record<string, { needsApproval?: boolean }>
          | null
          | undefined;
        const needsApproval =
          !!toolPolicies?.['*']?.needsApproval ||
          !!toolPolicies?.[functionToolDef.name]?.needsApproval;

        const aiTool = tool({
          description: functionToolDef.description || functionToolDef.name,
          inputSchema: zodSchema,
          execute: async (args, { toolCallId, providerMetadata }: any) => {
            // Fix Claude's stringified JSON issue - convert any stringified JSON back to objects
            let processedArgs: typeof args;
            try {
              processedArgs = parseEmbeddedJson(args);

              // Warn if we had to fix stringified JSON (indicates schema ambiguity issue)
              if (JSON.stringify(args) !== JSON.stringify(processedArgs)) {
                logger.warn(
                  { toolName: functionToolDef.name, toolCallId },
                  'Fixed stringified JSON parameters (indicates schema ambiguity)'
                );
              }
            } catch (error) {
              logger.warn(
                { toolName: functionToolDef.name, toolCallId, error: (error as Error).message },
                'Failed to parse embedded JSON, using original args'
              );
              processedArgs = args;
            }

            // Use processed args for all subsequent operations
            const finalArgs = processedArgs;

            if (needsApproval) {
              logger.info(
                { toolName: functionToolDef.name, toolCallId, args: finalArgs },
                'Function tool requires approval - waiting for user response'
              );

              const currentSpan = trace.getActiveSpan();
              if (currentSpan) {
                currentSpan.addEvent('tool.approval.requested', {
                  'tool.name': functionToolDef.name,
                  'tool.callId': toolCallId,
                  'subAgent.id': this.config.id,
                });
              }

              tracer.startActiveSpan(
                'tool.approval_requested',
                {
                  attributes: {
                    'tool.name': functionToolDef.name,
                    'tool.callId': toolCallId,
                    'subAgent.id': this.config.id,
                    'subAgent.name': this.config.name,
                  },
                },
                (requestSpan: Span) => {
                  requestSpan.setStatus({ code: SpanStatusCode.OK });
                  requestSpan.end();
                }
              );

              const streamHelper = this.getStreamingHelper();
              if (streamHelper) {
                await streamHelper.writeToolApprovalRequest({
                  approvalId: `aitxt-${toolCallId}`,
                  toolCallId,
                  toolName: functionToolDef.name,
                  input: finalArgs as Record<string, unknown>,
                });
              } else if (this.isDelegatedAgent) {
                const streamRequestId = this.getStreamRequestId();
                if (streamRequestId) {
                  await toolApprovalUiBus.publish(streamRequestId, {
                    type: 'approval-needed',
                    toolCallId,
                    toolName: functionToolDef.name,
                    input: finalArgs,
                    providerMetadata,
                    approvalId: `aitxt-${toolCallId}`,
                  });
                }
              }

              const approvalResult = await pendingToolApprovalManager.waitForApproval(
                toolCallId,
                functionToolDef.name,
                args,
                this.conversationId || 'unknown',
                this.config.id
              );

              if (!approvalResult.approved) {
                if (!streamHelper && this.isDelegatedAgent) {
                  const streamRequestId = this.getStreamRequestId();
                  if (streamRequestId) {
                    await toolApprovalUiBus.publish(streamRequestId, {
                      type: 'approval-resolved',
                      toolCallId,
                      approved: false,
                      reason: approvalResult.reason,
                    });
                  }
                }

                return tracer.startActiveSpan(
                  'tool.approval_denied',
                  {
                    attributes: {
                      'tool.name': functionToolDef.name,
                      'tool.callId': toolCallId,
                      'subAgent.id': this.config.id,
                      'subAgent.name': this.config.name,
                    },
                  },
                  (denialSpan: Span) => {
                    logger.info(
                      { toolName: functionToolDef.name, toolCallId, reason: approvalResult.reason },
                      'Function tool execution denied by user'
                    );

                    denialSpan.setStatus({ code: SpanStatusCode.OK });
                    denialSpan.end();

                    return createDeniedToolResult(toolCallId, approvalResult.reason);
                  }
                );
              }

              tracer.startActiveSpan(
                'tool.approval_approved',
                {
                  attributes: {
                    'tool.name': functionToolDef.name,
                    'tool.callId': toolCallId,
                    'subAgent.id': this.config.id,
                    'subAgent.name': this.config.name,
                  },
                },
                (approvedSpan: Span) => {
                  logger.info(
                    { toolName: functionToolDef.name, toolCallId },
                    'Function tool approved, continuing with execution'
                  );
                  approvedSpan.setStatus({ code: SpanStatusCode.OK });
                  approvedSpan.end();
                }
              );

              if (!streamHelper && this.isDelegatedAgent) {
                const streamRequestId = this.getStreamRequestId();
                if (streamRequestId) {
                  await toolApprovalUiBus.publish(streamRequestId, {
                    type: 'approval-resolved',
                    toolCallId,
                    approved: true,
                  });
                }
              }
            }

            logger.debug(
              { toolName: functionToolDef.name, toolCallId, args: finalArgs },
              'Function Tool Called'
            );

            try {
              const defaultSandboxConfig: SandboxConfig = {
                provider: 'native',
                runtime: 'node22',
                timeout: FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
                vcpus: FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
              };

              const result = await sandboxExecutor.executeFunctionTool(
                functionToolDef.id,
                finalArgs as Record<string, unknown>,
                {
                  description: functionToolDef.description || functionToolDef.name,
                  inputSchema: functionData.inputSchema || {},
                  executeCode: functionData.executeCode,
                  dependencies: functionData.dependencies || {},
                  sandboxConfig: this.config.sandboxConfig || defaultSandboxConfig,
                }
              );

              toolSessionManager.recordToolResult(sessionId || '', {
                toolCallId,
                toolName: functionToolDef.name,
                args: finalArgs,
                result,
                timestamp: Date.now(),
              });

              return result;
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
          'tool',
          { needsApproval }
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
      const project = this.executionContext.project;

      if (!this.config.contextConfigId) {
        logger.debug({ agentId: this.config.agentId }, 'No context config found for agent');
        return null;
      }

      const contextConfig = project.agents[this.config.agentId]?.contextConfig;

      if (!contextConfig) {
        logger.warn({ contextConfigId: this.config.contextConfigId }, 'Context config not found');
        return null;
      }

      const contextConfigWithScopes = {
        ...contextConfig,
        tenantId: this.config.tenantId,
        projectId: this.config.projectId,
        agentId: this.config.agentId,
        createdAt: contextConfig.createdAt || '',
        updatedAt: contextConfig.updatedAt || '',
      };
      if (!contextConfig) {
        logger.warn({ contextConfigId: this.config.contextConfigId }, 'Context config not found');
        return null;
      }

      if (!this.contextResolver) {
        throw new Error('Context resolver not found');
      }

      const result = await this.contextResolver.resolve(contextConfigWithScopes, {
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
    const project = this.executionContext.project;
    const agentDefinition = project.agents[this.config.agentId];
    try {
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
    const project = this.executionContext.project;
    try {
      const agentDefinition = project.agents[this.config.agentId];
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
   * Get the client's current time formatted in their timezone
   */
  private getClientCurrentTime(): string | undefined {
    const clientTimezone = this.config.forwardedHeaders?.['x-inkeep-client-timezone'];
    const clientTimestamp = this.config.forwardedHeaders?.['x-inkeep-client-timestamp'];

    // Both must be present
    if (!clientTimezone || !clientTimestamp) {
      return undefined;
    }

    try {
      // Parse the client's UTC timestamp and format it in their timezone
      // Format: "Thursday, January 16, 2026 at 3:45 PM EST"
      const clientDate = new Date(clientTimestamp);
      return clientDate.toLocaleString('en-US', {
        timeZone: clientTimezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch (error) {
      logger.warn(
        { clientTimezone, clientTimestamp, error },
        'Failed to format time for client timezone'
      );
      return undefined;
    }
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
  ): Promise<AssembleResult> {
    const conversationId = runtimeContext?.metadata?.conversationId || runtimeContext?.contextId;

    if (conversationId) {
      this.setConversationId(conversationId);
    }

    const resolvedContext = conversationId ? await this.getResolvedContext(conversationId) : null;

    let processedPrompt = this.config.prompt || '';
    if (resolvedContext && this.config.prompt) {
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
    const hasOnDemandSkills = this.config.skills?.some((skill) => !skill.alwaysLoaded);
    const skillTools = hasOnDemandSkills ? { load_skill: this.#createLoadSkillTool() } : {};
    const allTools = { ...mcpTools, ...functionTools, ...relationTools, ...skillTools };

    logger.info(
      {
        mcpTools: Object.keys(mcpTools),
        functionTools: Object.keys(functionTools),
        relationTools: Object.keys(relationTools),
        skillTools: Object.keys(skillTools),
        allTools: Object.keys(allTools),
        functionToolsDetails: Object.entries(functionTools).map(([name, tool]) => ({
          name,
          hasExecute: typeof tool.execute === 'function',
          hasDescription: !!tool.description,
          hasInputSchema: !!tool.inputSchema,
        })),
      },
      'Tools loaded for agent'
    );

    const toolDefinitions = Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: (tool as any).description || '',
      inputSchema: (tool as any).inputSchema || (tool as any).parameters || {},
      usageGuidelines:
        name === 'load_skill'
          ? 'Use this tool to load the full content of an on-demand skill by name.'
          : name.startsWith('transfer_to_') || name.startsWith('delegate_to_')
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
      ref: this.executionContext.resolvedRef,
    });

    const componentDataComponents = excludeDataComponents ? [] : this.config.dataComponents || [];

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

    const compressionConfig = getModelAwareCompressionConfig();
    const hasAgentArtifactComponents =
      (await this.hasAgentArtifactComponents()) || compressionConfig.enabled;

    const hasStructuredOutput = Boolean(
      this.config.dataComponents && this.config.dataComponents.length > 0
    );
    const includeDataComponents = hasStructuredOutput && !excludeDataComponents;

    logger.info(
      {
        agentId: this.config.id,
        hasStructuredOutput,
        excludeDataComponents,
        includeDataComponents,
        dataComponentsCount: this.config.dataComponents?.length || 0,
      },
      'System prompt configuration'
    );
    const clientCurrentTime = this.getClientCurrentTime();

    const config: SystemPromptV1 = {
      corePrompt: processedPrompt,
      prompt,
      skills: this.config.skills || [],
      tools: toolDefinitions,
      dataComponents: componentDataComponents,
      artifacts: referenceArtifacts,
      artifactComponents: shouldIncludeArtifactComponents ? this.artifactComponents : [],
      hasAgentArtifactComponents,
      hasTransferRelations: (this.config.transferRelations?.length ?? 0) > 0,
      hasDelegateRelations: (this.config.delegateRelations?.length ?? 0) > 0,
      includeDataComponents,
      clientCurrentTime,
    };
    return await this.systemPromptBuilder.buildSystemPrompt(config);
  }

  private getArtifactTools() {
    return tool({
      description:
        'Call this tool to retrieve EXISTING artifacts that were previously created and saved. This tool is for accessing artifacts that already exist, NOT for extracting tool results. Only use this when you need the complete artifact data and the summary shown in your context is insufficient.',
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

        // Check if artifact is oversized and block retrieval
        if (artifactData.metadata?.isOversized || artifactData.metadata?.retrievalBlocked) {
          logger.info(
            {
              artifactId,
              toolCallId,
              tokenSize: artifactData.metadata?.originalTokenSize,
              contextWindowSize: artifactData.metadata?.contextWindowSize,
            },
            'Blocked retrieval of oversized artifact'
          );

          return {
            artifactId: artifactData.artifactId,
            name: artifactData.name,
            description: artifactData.description,
            type: artifactData.type,
            status: 'retrieval_blocked',
            warning:
              '⚠️ This artifact contains an oversized tool result that cannot be retrieved to prevent context overflow.',
            reason: formatOversizedRetrievalReason(
              artifactData.metadata?.originalTokenSize || 0,
              artifactData.metadata?.contextWindowSize || 0
            ),
            toolInfo: {
              toolName: artifactData.metadata?.toolName,
              toolArgs: artifactData.metadata?.toolArgs,
              structureInfo: (artifactData.data as any)?._structureInfo,
            },
            recommendation:
              'The tool arguments that caused this large result are included above. Consider: 1) Using more specific filters/queries with the original tool, 2) Asking the user to break down the request, 3) Processing the data differently.',
          };
        }

        // Normal retrieval for non-oversized artifacts
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

  #createLoadSkillTool(): Tool<
    { name: string },
    {
      id: string;
      name: string;
      description: string;
      content: string;
    }
  > {
    return tool({
      description:
        'Load an on-demand skill by name and return its full content so you can apply it in this conversation.',
      inputSchema: z.object({
        name: z.string().describe('The skill name from the on-demand skills list.'),
      }),
      execute: async ({ name }) => {
        const skill = this.config.skills?.find((item) => item.name === name);

        if (!skill) {
          throw new Error(`Skill ${name} not found`);
        }

        return {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
        };
      },
    });
  }

  // Provide a default tool set that is always available to the agent.
  private async getDefaultTools(streamRequestId?: string): Promise<ToolSet> {
    const defaultTools: ToolSet = {};

    // Add get_reference_artifact if any agent has artifact components OR compression is enabled
    // This enables cross-agent artifact collaboration and access to compressed artifacts
    const compressionConfig = getModelAwareCompressionConfig();
    if ((await this.agentHasArtifactComponents()) || compressionConfig.enabled) {
      defaultTools.get_reference_artifact = this.getArtifactTools();
    }

    const hasOnDemandSkills = this.config.skills?.some((skill) => !skill.alwaysLoaded);
    if (hasOnDemandSkills) {
      const loadSkillTool = this.#createLoadSkillTool();
      if (loadSkillTool) {
        defaultTools.load_skill = this.wrapToolWithStreaming(
          'load_skill',
          loadSkillTool,
          streamRequestId,
          'tool'
        );
      }
    }

    // Note: save_tool_result tool is replaced by artifact:create response annotations
    // Agents with artifact components will receive creation instructions in their system prompt

    // Add manual compression tool
    logger.info(
      { agentId: this.config.id, streamRequestId },
      'Adding compress_context tool to defaultTools'
    );
    defaultTools.compress_context = tool({
      description:
        'Manually compress the current conversation context to save space. Use when shifting topics, completing major tasks, or when context feels cluttered.',
      inputSchema: z.object({
        reason: z
          .string()
          .describe(
            'Why you are requesting compression (e.g., "shifting from research to coding", "completed analysis phase")'
          ),
      }),
      execute: async ({ reason }) => {
        logger.info(
          {
            agentId: this.config.id,
            streamRequestId,
            reason,
          },
          'Manual compression requested by LLM'
        );

        // Set compression flag on the current compressor instance
        if (this.currentCompressor) {
          this.currentCompressor.requestManualCompression(reason);
        }

        return {
          status: 'compression_requested',
          reason,
          message:
            'Context compression will be applied on the next generation step. Previous work has been summarized and saved as artifacts.',
        };
      },
    });

    logger.info('getDefaultTools returning tools:', Object.keys(defaultTools).join(', '));
    return defaultTools;
  }

  private getStreamRequestId(): string {
    return this.streamRequestId || '';
  }

  private async applyToolOverrides(originalTools: any, mcpTool: McpTool): Promise<any> {
    // Check if this tool has overrides configured
    const toolOverrides =
      mcpTool.config.type === 'mcp' ? (mcpTool.config as any).mcp?.toolOverrides : undefined;

    if (!toolOverrides) {
      logger.debug(
        { mcpToolName: mcpTool.name },
        'No tool overrides configured, using original tools'
      );
      return originalTools;
    }

    if (!originalTools || typeof originalTools !== 'object') {
      logger.warn(
        { mcpToolName: mcpTool.name, originalToolsType: typeof originalTools },
        'Invalid original tools structure, skipping overrides'
      );
      return originalTools || {};
    }

    const processedTools: any = {};
    const availableToolNames = Object.keys(originalTools);
    const overrideNames = Object.keys(toolOverrides);

    // Validate that override tool names exist in available tools
    const invalidOverrides = overrideNames.filter((name) => !availableToolNames.includes(name));
    if (invalidOverrides.length > 0) {
      logger.warn(
        {
          mcpToolName: mcpTool.name,
          invalidOverrides,
          availableTools: availableToolNames,
        },
        'Tool override configured for non-existent tools'
      );
    }

    logger.info(
      {
        mcpToolName: mcpTool.name,
        totalTools: availableToolNames.length,
        toolsWithOverrides: overrideNames.length,
        availableTools: availableToolNames,
        overrideTools: overrideNames,
      },
      'Starting tool override application'
    );

    for (const [toolName, toolDef] of Object.entries(originalTools)) {
      // Validate tool definition structure
      if (!toolDef || typeof toolDef !== 'object') {
        logger.warn(
          { mcpToolName: mcpTool.name, toolName, toolDefType: typeof toolDef },
          'Invalid tool definition structure, skipping tool'
        );
        continue;
      }

      // Check if this tool has an override
      const override = toolOverrides[toolName];

      if (override && (override.schema || override.description || override.displayName)) {
        // Apply overrides (schema, description, displayName, transformation)
        try {
          logger.debug(
            {
              mcpToolName: mcpTool.name,
              toolName,
              override: {
                hasSchema: !!override.schema,
                hasDescription: !!override.description,
                hasDisplayName: !!override.displayName,
                hasTransformation: !!override.transformation,
                transformationType: typeof override.transformation,
              },
            },
            'Processing tool override'
          );

          // Use override schema if provided, otherwise use original
          let inputSchema: any;
          try {
            inputSchema = override.schema
              ? z.fromJSONSchema(override.schema)
              : (toolDef as any).inputSchema;
          } catch (schemaError) {
            logger.error(
              {
                mcpToolName: mcpTool.name,
                toolName,
                schemaError:
                  schemaError instanceof Error ? schemaError.message : String(schemaError),
                overrideSchema: override.schema,
              },
              'Failed to convert override schema, using original'
            );
            inputSchema = (toolDef as any).inputSchema;
          }

          // Use display name or fall back to original tool name
          const toolId = override.displayName || toolName;

          // Use override description or fall back to original description
          const toolDescription =
            override.description || (toolDef as any).description || `Tool ${toolId}`;

          const simplifiedTool = tool({
            description: toolDescription,
            inputSchema,
            execute: async (simpleArgs: any) => {
              // Only transform if transformation is provided
              let complexArgs = simpleArgs;
              if (override.transformation) {
                try {
                  const startTime = Date.now();

                  if (typeof override.transformation === 'string') {
                    // Use secure async transform with timeout and validation
                    complexArgs = await JsonTransformer.transform(
                      simpleArgs,
                      override.transformation,
                      { timeout: 10000 } // 10 second timeout for security
                    );
                  } else if (
                    typeof override.transformation === 'object' &&
                    override.transformation !== null
                  ) {
                    // Use transformWithConfig for object transformations
                    complexArgs = await JsonTransformer.transformWithConfig(
                      simpleArgs,
                      {
                        objectTransformation: override.transformation,
                      },
                      { timeout: 10000 }
                    );
                  } else {
                    logger.warn(
                      {
                        mcpToolName: mcpTool.name,
                        toolName,
                        transformationType: typeof override.transformation,
                      },
                      'Invalid transformation type, skipping transformation'
                    );
                  }

                  const duration = Date.now() - startTime;
                  logger.debug(
                    {
                      mcpToolName: mcpTool.name,
                      toolName,
                      transformationDuration: duration,
                      hasSimpleArgs: !!simpleArgs,
                      hasComplexArgs: !!complexArgs,
                      transformation:
                        typeof override.transformation === 'string'
                          ? `${override.transformation.substring(0, 100)}...`
                          : 'object-transformation',
                    },
                    'Successfully transformed tool arguments'
                  );
                } catch (transformError) {
                  const errorMessage =
                    transformError instanceof Error
                      ? transformError.message
                      : String(transformError);
                  logger.error(
                    {
                      mcpToolName: mcpTool.name,
                      toolName,
                      transformError: errorMessage,
                      transformation: override.transformation,
                      simpleArgs,
                    },
                    'Failed to transform tool arguments, using original arguments'
                  );
                  // Continue with original args if transformation fails
                  complexArgs = simpleArgs;
                }
              }

              // Validate that original tool has execute function
              if (typeof (toolDef as any).execute !== 'function') {
                throw new Error(`Original tool ${toolName} does not have a valid execute function`);
              }

              // Call original tool with error handling
              try {
                logger.debug(
                  {
                    mcpToolName: mcpTool.name,
                    toolName,
                    hasComplexArgs: !!complexArgs,
                  },
                  'Executing original tool with processed arguments'
                );

                return await (toolDef as any).execute(complexArgs);
              } catch (executeError) {
                const errorMessage =
                  executeError instanceof Error ? executeError.message : String(executeError);
                logger.error(
                  {
                    mcpToolName: mcpTool.name,
                    toolName,
                    executeError: errorMessage,
                    complexArgs,
                  },
                  'Failed to execute original tool'
                );
                throw new Error(`Tool execution failed for ${toolName}: ${errorMessage}`);
              }
            },
          });

          // Replace original with overridden version using the display name if provided
          const finalToolName = override.displayName || toolName;
          processedTools[finalToolName] = simplifiedTool;

          logger.info(
            {
              mcpToolName: mcpTool.name,
              originalToolName: toolName,
              finalToolName,
              displayName: override.displayName,
              hasSchemaOverride: !!override.schema,
              hasDescriptionOverride: !!override.description,
              hasTransformation: !!override.transformation,
            },
            'Successfully applied tool overrides'
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(
            {
              mcpToolName: mcpTool.name,
              toolName,
              error: errorMessage,
              override,
            },
            'Failed to apply tool overrides, using original tool'
          );
          // Fall back to original tool
          processedTools[toolName] = toolDef;
        }
      } else {
        // No override, use original
        processedTools[toolName] = toolDef;
        logger.debug(
          { mcpToolName: mcpTool.name, toolName },
          'No overrides configured for tool, using original'
        );
      }
    }

    const processedToolNames = Object.keys(processedTools);
    logger.info(
      {
        mcpToolName: mcpTool.name,
        originalToolCount: availableToolNames.length,
        processedToolCount: processedToolNames.length,
        processedTools: processedToolNames,
      },
      'Completed tool override application'
    );

    return processedTools;
  }

  /**
   * Format tool result for storage in conversation history
   */
  private formatToolResult(toolName: string, args: any, result: any, toolCallId: string): string {
    const input = args ? JSON.stringify(args, null, 2) : 'No input';

    if (isToolResultDenied(result)) {
      return [
        `## Tool: ${toolName}`,
        '',
        `### 🔧 TOOL_CALL_ID: ${toolCallId}`,
        '',
        `### Output`,
        result.reason,
      ].join('\n');
    }

    // Handle string results that might be JSON - try to parse them
    let parsedResult = result;
    if (typeof result === 'string') {
      try {
        parsedResult = JSON.parse(result);
      } catch (_e) {
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
   * Also adds tool call ID to the result for easy reference
   * Only adds hints when artifact components are available
   */
  private enhanceToolResultWithStructureHints(result: any, toolCallId?: string): any {
    if (!result) {
      return result;
    }

    // Only add structure hints and tool call ID if artifact components are available
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

      // Add structure hints and tool call ID to the original result (not the parsed version)
      const enhanced = {
        ...result,
        ...(toolCallId ? { _toolCallId: toolCallId } : {}),
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
            toolCallId:
              '🔧 CRITICAL: Use the _toolCallId field from this result object. This is the exact tool call ID you must use in your artifact:create tag. NEVER generate or make up a tool call ID.',
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

  // Check if any sub-agents in the agent have artifact components
  private async agentHasArtifactComponents(): Promise<boolean> {
    try {
      const project = this.executionContext.project;
      const agent = project.agents[this.config.agentId];
      const subAgents = agent?.subAgents;
      if (!subAgents) {
        return false;
      }
      return Object.values(subAgents).some(
        (subAgent) => (subAgent.artifactComponents?.length ?? 0) > 0
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
  ) {
    const textParts = extractTextFromParts(userParts);
    const dataParts = userParts.filter(
      (part): part is DataPart => part.kind === 'data' && part.data != null
    );
    const dataContext =
      dataParts.length > 0
        ? dataParts
            .map((part) => {
              const metadata = part.metadata as Record<string, unknown> | undefined;
              const source = metadata?.source ? ` (source: ${metadata.source})` : '';
              return `\n\n<structured_data${source}>\n${JSON.stringify(part.data, null, 2)}\n</structured_data>`;
            })
            .join('')
        : '';
    const userMessage = `${textParts}${dataContext}`;
    const imageParts = userParts.filter(
      (part): part is FilePart =>
        part.kind === 'file' && part.file.mimeType?.startsWith('image/') === true
    );
    // Extract conversation ID early for span attributes
    const conversationIdForSpan = runtimeContext?.metadata?.conversationId;

    return tracer.startActiveSpan(
      'agent.generate',
      {
        attributes: {
          'subAgent.id': this.config.id,
          'subAgent.name': this.config.name,
          // Add key attributes for SigNoz conversation queries
          'tenant.id': this.config.tenantId,
          'project.id': this.config.projectId,
          'agent.id': this.config.agentId,
          'agent.name': this.config.name,
          ...(conversationIdForSpan ? { 'conversation.id': conversationIdForSpan } : {}),
        },
      },
      async (span) => {
        // Setup generation context and initialize streaming helper
        const { contextId, taskId, streamRequestId, sessionId } =
          this.setupGenerationContext(runtimeContext);

        // Note: ToolSession is now created by AgentSession, not by agents
        // This ensures proper lifecycle management and session coordination

        try {
          // Load all tools and system prompts in parallel
          const {
            systemPrompt,
            sanitizedTools,
            contextBreakdown: initialContextBreakdown,
          } = await this.loadToolsAndPrompts(sessionId, streamRequestId, runtimeContext);

          // Update ArtifactService with this agent's artifact components
          if (streamRequestId && this.artifactComponents.length > 0) {
            agentSessionManager.updateArtifactComponents(streamRequestId, this.artifactComponents);
          }
          const conversationId = runtimeContext?.metadata?.conversationId;

          if (conversationId) {
            this.setConversationId(conversationId);
          }

          // Build conversation history based on configuration
          const { conversationHistory, contextBreakdown } = await this.buildConversationHistory(
            contextId,
            taskId,
            userMessage,
            streamRequestId,
            initialContextBreakdown
          );

          // Record context breakdown as span attributes for trace viewer
          // Uses the schema to dynamically set span attributes
          const breakdownAttributes: Record<string, number> = {};
          for (const componentDef of V1_BREAKDOWN_SCHEMA) {
            breakdownAttributes[componentDef.spanAttribute] =
              contextBreakdown.components[componentDef.key] ?? 0;
          }
          breakdownAttributes['context.breakdown.total_tokens'] = contextBreakdown.total;
          span.setAttributes(breakdownAttributes);

          // Configure model settings and behavior
          const { primaryModelSettings, modelSettings, hasStructuredOutput, timeoutMs } =
            this.configureModelSettings();
          let response: ResolvedGenerationResponse;
          let textResponse: string;

          // Build initial messages
          const messages = this.buildInitialMessages(
            systemPrompt,
            conversationHistory,
            userMessage,
            imageParts
          );

          // Setup compression for this generation
          const { originalMessageCount, compressor } = this.setupCompression(
            messages,
            sessionId,
            contextId,
            primaryModelSettings
          );

          // ----- Single-phase generation -----
          const streamConfig = {
            ...modelSettings,
            toolChoice: 'auto' as const,
          };

          const shouldStream = this.getStreamingHelper();

          // Build data components schema once if needed
          const dataComponentsSchema = hasStructuredOutput
            ? this.buildDataComponentsSchema()
            : null;

          // Build base config
          const baseConfig = this.buildBaseGenerationConfig(
            streamConfig,
            messages,
            sanitizedTools,
            compressor,
            originalMessageCount,
            timeoutMs,
            'auto',
            dataComponentsSchema ? 'structured_generation' : undefined,
            contextBreakdown.total
          );

          // Add structured output to config if needed
          const generationConfig = dataComponentsSchema
            ? {
                ...baseConfig,
                output: Output.object({
                  schema: z.object({
                    dataComponents: z.array(dataComponentsSchema),
                  }),
                }),
              }
            : baseConfig;

          // Apply JSON post-processing for non-streaming (harmless if no structured output)
          const nonStreamingConfig = withJsonPostProcessing(generationConfig);

          logger.info(
            {
              agentId: this.config.id,
              hasStructuredOutput,
              shouldStream,
            },
            'Starting generation'
          );

          // Execute generation
          let rawResponse: Record<string, unknown>;
          if (shouldStream) {
            rawResponse = (await this.handleStreamGeneration(
              streamText(generationConfig),
              sessionId,
              contextId,
              !!dataComponentsSchema
            )) as unknown as Record<string, unknown>;
          } else {
            rawResponse = (await generateText(nonStreamingConfig)) as unknown as Record<
              string,
              unknown
            >;
          }

          logger.info(
            {
              agentId: this.config.id,
              hasOutput: !!rawResponse.output,
              dataComponentsCount: (rawResponse.output as any)?.dataComponents?.length || 0,
              finishReason: rawResponse.finishReason,
            },
            'Generation completed'
          );

          response = await resolveGenerationResponse(rawResponse);

          // Process response based on whether it has structured output
          if (hasStructuredOutput && response.output) {
            // Structured output: assign output to object for downstream compatibility
            response.object = response.output;

            logger.info(
              {
                agentId: this.config.id,
                dataComponentsCount: response.output?.dataComponents?.length || 0,
                dataComponentNames:
                  response.output?.dataComponents?.map((dc: any) => dc.name) || [],
              },
              'Processing response with data components'
            );
            textResponse = JSON.stringify(response.output, null, 2);
          } else if (hasToolCallWithPrefix('transfer_to_')(response)) {
            // Transfer call: use last step text
            textResponse = response.steps[response.steps.length - 1].text || '';
          } else {
            // Plain text response
            textResponse = response.text || '';
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          const formattedResponse = await this.formatFinalResponse(
            response,
            textResponse,
            sessionId,
            contextId
          );

          if (streamRequestId) {
            const generationType = response.object ? 'object_generation' : 'text_generation';

            agentSessionManager.recordEvent(streamRequestId, 'agent_generate', this.config.id, {
              parts: (formattedResponse.formattedContent?.parts || []).map((part: any) => ({
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

          // Clear compressor reference to prevent memory leaks
          if (compressor) {
            compressor.fullCleanup();
          }
          this.currentCompressor = null;

          return formattedResponse;
        } catch (error) {
          this.handleGenerationError(error, span);
        }
      }
    );
  }

  /**
   * Setup generation context and initialize streaming helper
   */
  private setupGenerationContext(runtimeContext?: {
    contextId: string;
    metadata: {
      conversationId: string;
      threadId: string;
      taskId: string;
      streamRequestId: string;
      apiKey?: string;
    };
  }) {
    const contextId = runtimeContext?.contextId || 'default';
    const taskId = runtimeContext?.metadata?.taskId || 'unknown';
    const streamRequestId = runtimeContext?.metadata?.streamRequestId;
    const sessionId = streamRequestId || 'fallback-session';

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

    return { contextId, taskId, streamRequestId, sessionId };
  }

  /**
   * Load all tools and system prompts in parallel, then combine and sanitize them
   */
  private async loadToolsAndPrompts(
    sessionId: string,
    streamRequestId: string | undefined,
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
    // Load all tools and system prompt in parallel
    // Note: getDefaultTools needs to be called after streamHelper is set above
    const [mcpTools, systemPromptResult, functionTools, relationTools, defaultTools] =
      await tracer.startActiveSpan(
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
              this.buildSystemPrompt(runtimeContext, false), // System prompt with data components
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

    // Extract prompt and breakdown from results
    const systemPrompt = systemPromptResult.prompt;
    const contextBreakdown = systemPromptResult.breakdown;

    // Combine all tools for AI SDK
    const allTools = {
      ...mcpTools,
      ...functionTools,
      ...relationTools,
      ...defaultTools,
    };

    // Sanitize tool names at runtime for AI SDK compatibility
    const sanitizedTools = this.sanitizeToolsForAISDK(allTools);

    return { systemPrompt, sanitizedTools, contextBreakdown };
  }

  /**
   * Build conversation history based on configuration mode and filters
   */
  private async buildConversationHistory(
    contextId: string,
    taskId: string,
    userMessage: string,
    streamRequestId: string | undefined,
    initialContextBreakdown: ContextBreakdown
  ): Promise<{ conversationHistory: string; contextBreakdown: ContextBreakdown }> {
    let conversationHistory = '';
    const historyConfig =
      this.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

    if (historyConfig && historyConfig.mode !== 'none') {
      if (historyConfig.mode === 'full') {
        const filters = {
          delegationId: this.delegationId,
          isDelegated: this.isDelegatedAgent,
        };

        conversationHistory = await getConversationHistoryWithCompression({
          tenantId: this.config.tenantId,
          projectId: this.config.projectId,
          conversationId: contextId,
          currentMessage: userMessage,
          options: historyConfig,
          filters,
          summarizerModel: this.getSummarizerModel(),
          streamRequestId,
          fullContextSize: initialContextBreakdown.total,
        });
      } else if (historyConfig.mode === 'scoped') {
        conversationHistory = await getConversationHistoryWithCompression({
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
          summarizerModel: this.getSummarizerModel(),
          streamRequestId,
          fullContextSize: initialContextBreakdown.total,
        });
      }
    }

    // Track conversation history tokens and add to context breakdown
    const conversationHistoryTokens = estimateTokens(conversationHistory);
    const updatedContextBreakdown: ContextBreakdown = {
      components: {
        ...initialContextBreakdown.components,
        conversationHistory: conversationHistoryTokens,
      },
      total: initialContextBreakdown.total,
    };

    // Recalculate total with conversation history
    calculateBreakdownTotal(updatedContextBreakdown);

    return { conversationHistory, contextBreakdown: updatedContextBreakdown };
  }

  /**
   * Configure model settings, timeouts, and streaming behavior
   */
  private configureModelSettings() {
    // Check if we have structured output components
    const hasStructuredOutput = Boolean(
      this.config.dataComponents && this.config.dataComponents.length > 0
    );

    // Use structured output model when data components are present, otherwise use primary model
    const primaryModelSettings = hasStructuredOutput
      ? this.getStructuredOutputModel()
      : this.getPrimaryModel();
    const modelSettings = ModelFactory.prepareGenerationConfig(primaryModelSettings);

    // Extract maxDuration from config and convert to milliseconds, or use defaults
    // Always use streaming timeout since we always stream
    const configuredTimeout = modelSettings.maxDuration
      ? Math.min(modelSettings.maxDuration * 1000, LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS)
      : LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING;

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

    return {
      primaryModelSettings,
      modelSettings: { ...modelSettings, maxDuration: timeoutMs / 1000 },
      hasStructuredOutput,
      timeoutMs,
    };
  }

  /**
   * Build initial messages array with system prompt and user content
   */
  private buildInitialMessages(
    systemPrompt: string,
    conversationHistory: string,
    userMessage: string,
    imageParts?: FilePart[]
  ): any[] {
    const messages: any[] = [];
    messages.push({ role: 'system', content: systemPrompt });

    if (conversationHistory.trim() !== '') {
      messages.push({ role: 'user', content: conversationHistory });
    }

    // Build user message content - use array format if images present
    const userContent = this.buildUserMessageContent(userMessage, imageParts);
    messages.push({
      role: 'user',
      content: userContent,
    });

    return messages;
  }

  /**
   * Build user message content, formatting for multimodal if images are present
   */
  private buildUserMessageContent(
    text: string,
    imageParts?: FilePart[]
  ): string | AiSdkContentPart[] {
    // No images - return simple string for backward compatibility
    if (!imageParts || imageParts.length === 0) {
      return text;
    }

    const content: AiSdkContentPart[] = [{ type: 'text', text }];

    for (const part of imageParts) {
      const file = part.file;
      // Transform directly from A2A FilePart to Vercel format:
      // - HTTP URIs become URL objects
      // - Base64 bytes become data URL strings (Vercel handles MIME detection)
      const imageValue =
        'uri' in file && file.uri
          ? new URL(file.uri)
          : `data:${file.mimeType || 'image/*'};base64,${file.bytes}`;

      const imagePart: AiSdkContentPart = {
        type: 'image',
        image: imageValue,
        ...(part.metadata?.detail && {
          experimental_providerMetadata: { openai: { imageDetail: part.metadata.detail } },
        }),
      };

      content.push(imagePart);
    }

    return content;
  }

  /**
   * Setup compression for the current generation
   */
  private setupCompression(
    messages: any[],
    sessionId: string,
    contextId: string,
    primaryModelSettings: any
  ) {
    // Capture original message count and initialize compressor for this generation
    const originalMessageCount = messages.length;
    const compressionConfigResult = getCompressionConfigForModel(primaryModelSettings);
    const compressionConfig = {
      hardLimit: compressionConfigResult.hardLimit,
      safetyBuffer: compressionConfigResult.safetyBuffer,
      enabled: compressionConfigResult.enabled,
    };
    const compressor = compressionConfig.enabled
      ? new MidGenerationCompressor(
          sessionId,
          contextId,
          this.config.tenantId,
          this.config.projectId,
          compressionConfig,
          this.getSummarizerModel(),
          primaryModelSettings
        )
      : null;

    // Store compressor for tool access
    this.currentCompressor = compressor;

    return { originalMessageCount, compressor };
  }

  /**
   * Prepare step function for streaming with compression logic
   */
  private async handlePrepareStepCompression(
    stepMessages: any[],
    compressor: any,
    originalMessageCount: number,
    fullContextSize?: number
  ) {
    // Check if compression is enabled
    if (!compressor) {
      return {};
    }

    // Check if compression is needed (manual or automatic)
    const compressionNeeded = compressor.isCompressionNeeded(stepMessages);

    if (compressionNeeded) {
      logger.info(
        {
          compressorState: compressor.getState(),
        },
        'Triggering layered mid-generation compression'
      );

      // Split messages into original vs generated
      const originalMessages = stepMessages.slice(0, originalMessageCount);
      const generatedMessages = stepMessages.slice(originalMessageCount);

      if (generatedMessages.length > 0) {
        // Compress ONLY the generated content (tool results, intermediate steps)
        // but track full context size for accurate compression metrics
        const compressionResult = await compressor.safeCompress(generatedMessages, fullContextSize);

        // Handle different types of compression results
        if (Array.isArray(compressionResult.summary)) {
          // Simple compression fallback - summary contains the compressed messages
          const compressedMessages = compressionResult.summary;
          logger.info(
            {
              originalTotal: stepMessages.length,
              compressed: originalMessages.length + compressedMessages.length,
              originalKept: originalMessages.length,
              generatedCompressed: compressedMessages.length,
            },
            'Simple compression fallback applied'
          );
          return { messages: [...originalMessages, ...compressedMessages] };
        }

        // AI compression succeeded - summary is a proper summary object
        const finalMessages = [...originalMessages];

        // Add preserved text messages first (so they appear in natural order)
        if (
          compressionResult.summary.text_messages &&
          compressionResult.summary.text_messages.length > 0
        ) {
          finalMessages.push(...compressionResult.summary.text_messages);
        }

        // Add compressed summary message last (provides context for artifacts)
        const summaryData = {
          high_level: compressionResult.summary?.high_level,
          user_intent: compressionResult.summary?.user_intent,
          decisions: compressionResult.summary?.decisions,
          open_questions: compressionResult.summary?.open_questions,
          next_steps: compressionResult.summary?.next_steps,
          related_artifacts: compressionResult.summary?.related_artifacts,
        };

        // Add artifact reference examples to the related_artifacts
        if (summaryData.related_artifacts && summaryData.related_artifacts.length > 0) {
          summaryData.related_artifacts = summaryData.related_artifacts.map((artifact: any) => ({
            ...artifact,
            artifact_reference: `<artifact:ref id="${artifact.id}" tool="${artifact.tool_call_id}" />`,
          }));
        }

        const summaryMessage = JSON.stringify(summaryData);
        finalMessages.push({
          role: 'user',
          content: `Based on your research, here's what you've discovered: ${summaryMessage}

**IMPORTANT**: If you have enough information from this compressed research to answer my original question, please provide your answer now. Only continue with additional tool calls if you need critical missing information that wasn't captured in the research above. When referencing any artifacts from the compressed research, you MUST use <artifact:ref id="artifact_id" tool="tool_call_id" /> tags with the exact IDs from the related_artifacts above.`,
        });

        logger.info(
          {
            originalTotal: stepMessages.length,
            compressed: finalMessages.length,
            originalKept: originalMessages.length,
            generatedCompressed: generatedMessages.length,
          },
          'AI compression completed successfully'
        );

        return { messages: finalMessages };
      }

      // No generated messages yet, nothing to compress
      return {};
    }

    return {};
  }

  private async handleStopWhenConditions(steps: any[]) {
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

    // Only check for tool errors in streaming mode (when includeThinkingComplete is false)
    if (last?.content && last.content.length > 0) {
      const lastContent = last.content[last.content.length - 1];
      if (lastContent.type === 'tool-error') {
        const error = lastContent.error;
        if (
          error &&
          typeof error === 'object' &&
          'name' in error &&
          error.name === 'connection_refused'
        ) {
          return true;
        }
      }
    }

    // Check for transfer tools
    if (steps.length >= 1) {
      const currentStep = steps[steps.length - 1];
      if (currentStep && 'toolCalls' in currentStep && currentStep.toolCalls) {
        const hasTransferTool = currentStep.toolCalls.some((tc: any) =>
          tc.toolName.startsWith('transfer_to_')
        );

        // Transfer tools stop immediately
        if (hasTransferTool) {
          return true;
        }
      }
    }

    const maxSteps = this.getMaxGenerationSteps();
    if (steps.length >= maxSteps) {
      logger.warn(
        {
          subAgentId: this.config.id,
          agentId: this.config.agentId,
          stepsCompleted: steps.length,
          maxSteps,
          conversationId: this.conversationId,
        },
        'Sub-agent reached maximum generation steps limit'
      );

      tracer.startActiveSpan(
        'agent.max_steps_reached',
        {
          attributes: {
            'agent.max_steps_reached': true,
            'agent.steps_completed': steps.length,
            'agent.max_steps': maxSteps,
            'agent.id': this.config.agentId,
            'subAgent.id': this.config.id,
          },
        },
        (span) => {
          span.addEvent('max_generation_steps_reached', {
            message: `Sub-agent "${this.config.id}" reached maximum generation steps (${steps.length}/${maxSteps})`,
          });
          span.end();
        }
      );

      return true;
    }

    return false;
  }

  private setupStreamParser(sessionId: string, contextId: string) {
    const streamHelper = this.getStreamingHelper();
    if (!streamHelper) {
      throw new Error('Stream helper is unexpectedly undefined in streaming context');
    }
    const session = toolSessionManager.getSession(sessionId);

    // Get context window size for oversized artifact detection
    const modelContextInfo = getModelContextWindow(this.getPrimaryModel());

    const artifactParserOptions = {
      sessionId,
      taskId: session?.taskId,
      projectId: session?.projectId,
      artifactComponents: this.artifactComponents,
      streamRequestId: this.getStreamRequestId(),
      subAgentId: this.config.id,
      contextWindowSize: modelContextInfo.contextWindow ?? undefined,
    };
    const parser = new IncrementalStreamParser(
      streamHelper,
      this.executionContext,
      contextId,
      artifactParserOptions
    );
    return parser;
  }

  private buildTelemetryConfig(phase?: string) {
    return {
      isEnabled: true,
      functionId: this.config.id,
      recordInputs: true,
      recordOutputs: true,
      metadata: {
        ...(phase && { phase }),
        subAgentId: this.config.id,
        subAgentName: this.config.name,
      },
    };
  }

  private buildBaseGenerationConfig(
    modelSettings: any,
    messages: any[],
    sanitizedTools: any,
    compressor: any,
    originalMessageCount: number,
    timeoutMs: number,
    toolChoice: 'auto' | 'required' = 'auto',
    phase?: string,
    fullContextSize?: number
  ) {
    return {
      ...modelSettings,
      toolChoice,
      messages,
      tools: sanitizedTools,
      prepareStep: async ({ messages: stepMessages }: { messages: any[] }) => {
        return await this.handlePrepareStepCompression(
          stepMessages,
          compressor,
          originalMessageCount,
          fullContextSize
        );
      },
      stopWhen: async ({ steps }: { steps: any[] }) => {
        return await this.handleStopWhenConditions(steps);
      },
      experimental_telemetry: this.buildTelemetryConfig(phase),
      abortSignal: AbortSignal.timeout(timeoutMs),
    };
  }

  private buildDataComponentsSchema() {
    const componentSchemas: z.ZodType<any>[] = [];

    this.config.dataComponents?.forEach((dc) => {
      // Normalize schema to ensure all properties are required (cross-provider compatibility)
      const normalizedProps = SchemaProcessor.makeAllPropertiesRequired(dc.props);
      const propsSchema = z.fromJSONSchema(normalizedProps);
      componentSchemas.push(
        z.object({
          id: z.string(),
          name: z.literal(dc.name),
          props: propsSchema,
        })
      );
    });

    if (this.artifactComponents.length > 0) {
      const artifactCreateSchemas = ArtifactCreateSchema.getSchemas(this.artifactComponents);
      componentSchemas.push(...artifactCreateSchemas);
      componentSchemas.push(ArtifactReferenceSchema.getSchema());
    }

    let dataComponentsSchema: z.ZodType<any>;
    if (componentSchemas.length === 1) {
      dataComponentsSchema = componentSchemas[0];
      logger.info({ agentId: this.config.id }, 'Using single schema (no union needed)');
    } else {
      dataComponentsSchema = z.union(
        componentSchemas as [z.ZodType<any>, z.ZodType<any>, ...z.ZodType<any>[]]
      );
      logger.info({ agentId: this.config.id }, 'Created union schema');
    }

    return dataComponentsSchema;
  }

  private async formatFinalResponse(
    response: ResolvedGenerationResponse,
    textResponse: string,
    sessionId: string,
    contextId: string
  ): Promise<ResolvedGenerationResponse> {
    let formattedContent: MessageContent | null = response.formattedContent || null;

    if (!formattedContent) {
      const session = toolSessionManager.getSession(sessionId);

      // Get context window size for oversized artifact detection
      const modelContextInfo = getModelContextWindow(this.getPrimaryModel());

      const responseFormatter = new ResponseFormatter(this.executionContext, {
        sessionId,
        taskId: session?.taskId,
        projectId: session?.projectId,
        contextId,
        artifactComponents: this.artifactComponents,
        streamRequestId: this.getStreamRequestId(),
        subAgentId: this.config.id,
        contextWindowSize: modelContextInfo.contextWindow ?? undefined,
      });

      if (response.object) {
        formattedContent = await responseFormatter.formatObjectResponse(response.object, contextId);
      } else if (textResponse) {
        formattedContent = await responseFormatter.formatResponse(textResponse, contextId);
      }
    }

    return {
      ...response,
      formattedContent: formattedContent,
    };
  }

  private handleGenerationError(error: unknown, span: Span): never {
    // Use full cleanup since compressor is being discarded on error
    if (this.currentCompressor) {
      this.currentCompressor.fullCleanup();
    }
    this.currentCompressor = null;

    // Don't clean up ToolSession on error - let ToolSessionManager handle cleanup
    const errorToThrow = error instanceof Error ? error : new Error(String(error));
    logger.error(
      {
        agentId: this.config.id,
        errorMessage: errorToThrow.message,
        errorStack: errorToThrow.stack,
        errorName: errorToThrow.name,
      },
      'Generation error in Agent'
    );
    setSpanWithError(span, errorToThrow);
    span.end();
    throw errorToThrow;
  }

  /**
   * Public cleanup method for external lifecycle management (e.g., session cleanup)
   * Performs full cleanup of compression state when agent/session is ending
   */
  public cleanupCompression(): void {
    if (this.currentCompressor) {
      this.currentCompressor.fullCleanup();
      this.currentCompressor = null;
    }
  }

  public async cleanup(): Promise<void> {
    const entries = Array.from(this.mcpClientCache.entries());
    if (entries.length > 0) {
      const results = await Promise.allSettled(entries.map(([, client]) => client.disconnect()));
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          logger.warn(
            { error: result.reason, clientKey: entries[i][0] },
            'Failed to disconnect MCP client during cleanup'
          );
        }
      }
    }
    this.mcpClientCache.clear();
    this.mcpConnectionLocks.clear();
    this.cleanupCompression();
  }

  private async handleStreamGeneration(
    streamResult: StreamTextResult<ToolSet, any>,
    sessionId: string,
    contextId: string,
    hasStructuredOutput: boolean
  ) {
    const parser = this.setupStreamParser(sessionId, contextId);

    // Process stream based on output type
    if (hasStructuredOutput) {
      for await (const delta of streamResult.partialOutputStream) {
        if (delta) {
          await parser.processObjectDelta(delta);
        }
      }
    } else {
      await this.processStreamEvents(streamResult, parser);
    }

    await parser.finalize();
    const response = await streamResult;

    // Format response with collected parts
    const collectedParts = parser.getCollectedParts();
    if (collectedParts.length > 0) {
      (response as any).formattedContent = {
        parts: collectedParts.map((part: any) => ({
          kind: part.kind,
          ...(part.kind === 'text' && { text: part.text }),
          ...(part.kind === 'data' && { data: part.data }),
        })),
      };
    }

    return response;
  }

  private async processStreamEvents(
    streamResult: StreamTextResult<ToolSet, any>,
    parser: IncrementalStreamParser
  ) {
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
  }
}
