import type {
  AgentConversationHistoryConfig,
  Artifact,
  ArtifactComponentApiInsert,
  CredentialStoreRegistry,
  CredentialStuffer,
  DataComponentApiInsert,
  FullExecutionContext,
  McpTool,
  MessageContent,
  Models,
  ResolvedRef,
  SubAgentSkillWithIndex,
  SubAgentStopWhen,
} from '@inkeep/agents-core';
import type { FinishReason, StepResult, ToolSet } from 'ai';
import type { MidGenerationCompressor } from '../compression/MidGenerationCompressor';
import type { ContextResolver } from '../context';
import type { StreamHelper } from '../stream/stream-helpers';
import type { ImageDetail } from '../types/chat';
import type { SandboxConfig } from '../types/executionContext';
import type { SystemPromptBuilder } from './SystemPromptBuilder';
import type { AgentMcpManager } from './services/AgentMcpManager';

export type AiSdkTextPart = {
  type: 'text';
  text: string;
};

export type AiSdkImagePart = {
  type: 'image';
  image: string | URL;
  experimental_providerMetadata?: { openai?: { imageDetail?: ImageDetail } };
};

export type AiSdkContentPart = AiSdkTextPart | AiSdkImagePart;

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
    throw new Error(
      `Failed to resolve generation response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function validateModel(modelString: string | undefined, modelType: string): string {
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
  agentName?: string;
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

export function isValidTool(tool: unknown): tool is {
  description: string;
  inputSchema: NonNullable<ToolSet[string]['inputSchema']>;
  execute: (args: unknown, context?: unknown) => Promise<unknown>;
} {
  if (!tool || typeof tool !== 'object') return false;
  const t = tool as Record<string, unknown>;
  return (
    typeof t.description === 'string' && t.inputSchema != null && typeof t.execute === 'function'
  );
}

export type AiSdkToolDefinition = {
  id?: string;
  description?: string;
  inputSchema?: unknown;
  parameters?: {
    safeParse?: (
      args: unknown
    ) => { success: true; error?: never } | { success: false; error: { message: string } };
  };
  execute?: (args: unknown, context?: unknown) => Promise<unknown>;
};

export interface AgentRunContext {
  config: AgentConfig;
  executionContext: FullExecutionContext;
  mcpManager: AgentMcpManager | undefined;
  contextResolver?: ContextResolver;
  credentialStoreRegistry?: CredentialStoreRegistry;
  credentialStuffer?: CredentialStuffer;
  systemPromptBuilder: SystemPromptBuilder<any>;
  streamHelper?: StreamHelper;
  streamRequestId?: string;
  conversationId?: string;
  delegationId?: string;
  isDelegatedAgent: boolean;
  artifactComponents: ArtifactComponentApiInsert[];
  currentCompressor: MidGenerationCompressor | null;
  functionToolRelationshipIdByName: Map<string, string>;
  taskDenialRedirects: Array<{ toolName: string; toolCallId: string; reason: string }>;
  durableWorkflowRunId?: string;
  approvedToolCalls?: Record<string, { approved: boolean; reason?: string; originalToolCallId?: string }>;
  pendingDurableApproval?: { toolCallId: string; toolName: string; args: unknown };
}
