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
  OutputContract,
  ResolvedRef,
  SubAgentStopWhen,
} from '@inkeep/agents-core';
import { DELEGATE_TOOL_PREFIX, TRANSFER_TOOL_PREFIX } from '@inkeep/agents-core';
import type { FinishReason, StepResult, ToolSet } from 'ai';
import type { MidGenerationCompressor } from '../compression/MidGenerationCompressor';
import type { ContextResolver } from '../context';
import type { StreamHelper } from '../stream/stream-helpers';
import type { ImageDetail } from '../types/chat';
import type { SandboxConfig } from '../types/executionContext';
import type { SystemPromptBuilder } from './SystemPromptBuilder';
import type { AgentMcpManager } from './services/AgentMcpManager';
import type { SkillData } from './types';

export type AiSdkTextPart = {
  type: 'text';
  text: string;
};

export type AiSdkImagePart = {
  type: 'image';
  image: string | URL;
  experimental_providerMetadata?: { openai?: { imageDetail?: ImageDetail } };
};

export type AiSdkFilePart = {
  type: 'file';
  data: string | URL;
  mediaType: string;
  filename?: string;
};

export type AiSdkContentPart = AiSdkTextPart | AiSdkImagePart | AiSdkFilePart;

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
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  totalUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  response?: {
    modelId?: string;
  };
}

/**
 * Detect the AI SDK's NoObjectGeneratedError by `error.name` rather than
 * `instanceof`, because multiple resolved SDK versions in the dependency tree
 * can break instanceof checks. Names sourced from ai@6 — the prefixed
 * `AI_NoObjectGeneratedError` is current; the bare form is kept as a safety
 * net for downgrades or upstream renames. Re-verify on AI SDK upgrades.
 */
function isNoObjectGeneratedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AI_NoObjectGeneratedError' || error.name === 'NoObjectGeneratedError';
}

/**
 * Build a debuggable, action-oriented description of why field resolution failed.
 * Routes by the cause's error name so message phrasing matches the actual failure
 * (no structured output emitted vs. emitted-but-unparseable vs. unrelated SDK fault).
 */
function getResolutionHint(field: string, cause: unknown, toolCallNames: string[]): string {
  if (field !== 'output') {
    return `Resolving the "${field}" property of the AI SDK response failed. This is usually a streaming, network, or SDK-internal fault rather than a model problem.`;
  }
  const causeName = cause instanceof Error ? cause.name : '';
  if (causeName === 'AI_NoObjectGeneratedError' || causeName === 'NoObjectGeneratedError') {
    const nonRoutingTools = toolCallNames.filter(
      (n) => !n.startsWith(TRANSFER_TOOL_PREFIX) && !n.startsWith(DELEGATE_TOOL_PREFIX)
    );
    if (nonRoutingTools.length > 0) {
      return `The model called tool(s) [${nonRoutingTools.join(', ')}] but did not emit the structured object Output.object() expected. If this agent should answer with a tool call instead of data components, remove dataComponents from the agent or have the model transfer/delegate. To require data components, set outputContract.requireComponent.`;
    }
    return `The model produced no structured output, no transfer, and no delegate call. The agent declares dataComponents but the model emitted text only — it ignored the structured-output instruction. To enforce structured output, set outputContract.requireComponent (forces a named component) or outputContract.allowText=false (forbids plain text).`;
  }
  if (
    causeName.includes('ParseError') ||
    causeName.includes('TypeValidationError') ||
    causeName.includes('ValidationError') ||
    causeName === 'ZodError'
  ) {
    return `The model produced output but it did not match the expected Output.object() schema. This is usually a model failure — try simplifying the schema, splitting data components into smaller ones, or using a more capable model.`;
  }
  return `Resolving the "output" property of the AI SDK response failed with ${causeName || 'a non-Error rejection'}. See the cause for details.`;
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
 *
 * **Tolerance:** when the model legitimately transferred or delegated (a
 * `transfer_to_*` / `delegate_to_*` tool call in `steps`), `Output.object()`
 * rejects with `NoObjectGeneratedError` because no structured object was emitted.
 * That rejection is expected and we resolve `output` to undefined so the
 * contract layer can run. Every other failure throws a `GenerationResponseError`
 * carrying a debug hint plus `cause`, `field`, `finishReason`, and `toolCalls`.
 */
export async function resolveGenerationResponse(
  response: Record<string, unknown>
): Promise<ResolvedGenerationResponse> {
  const stepsValue = response.steps;

  if (!stepsValue) {
    return response as unknown as ResolvedGenerationResponse;
  }

  const fields = [
    'steps',
    'text',
    'finishReason',
    'output',
    'usage',
    'totalUsage',
    'response',
  ] as const;
  const settled = await Promise.allSettled([
    Promise.resolve(
      stepsValue as PromiseLike<Array<StepResult<ToolSet>>> | Array<StepResult<ToolSet>>
    ),
    Promise.resolve(response.text as PromiseLike<string> | string),
    Promise.resolve(response.finishReason as PromiseLike<FinishReason> | FinishReason),
    Promise.resolve(response.output),
    Promise.resolve(response.usage),
    Promise.resolve(response.totalUsage),
    Promise.resolve(response.response),
  ]);

  const stepsResult = settled[0];
  const toolCallNames =
    stepsResult.status === 'fulfilled' && Array.isArray(stepsResult.value)
      ? (stepsResult.value as Array<{ toolCalls?: Array<{ toolName?: string }> }>).flatMap((s) =>
          (s.toolCalls ?? [])
            .map((tc) => tc.toolName)
            .filter((name): name is string => Boolean(name))
        )
      : [];

  // When the model legitimately took a transfer/delegate route instead of
  // emitting a structured object, the AI SDK's `Output.object()` rejects with
  // NoObjectGeneratedError. That rejection is not a real failure — the model
  // satisfied the request via a tool call. Tolerate this specific case;
  // every other error (parse failures, validation, network) still throws.
  const outputResult = settled[3];
  if (
    outputResult.status === 'rejected' &&
    isNoObjectGeneratedError(outputResult.reason) &&
    toolCallNames.some(
      (n) => n.startsWith(TRANSFER_TOOL_PREFIX) || n.startsWith(DELEGATE_TOOL_PREFIX)
    )
  ) {
    settled[3] = { status: 'fulfilled', value: undefined };
  }

  const failedIndex = settled.findIndex((r) => r.status === 'rejected');
  if (failedIndex !== -1) {
    const cause = (settled[failedIndex] as PromiseRejectedResult).reason;
    const failedField = fields[failedIndex];
    const finishReasonResult = settled[2];
    const finishReason =
      finishReasonResult.status === 'fulfilled'
        ? String(finishReasonResult.value ?? 'unknown')
        : 'unresolved';

    const hint = getResolutionHint(failedField, cause, toolCallNames);
    const causeName = cause instanceof Error ? cause.name : typeof cause;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const toolCallsRendered = toolCallNames.length > 0 ? `[${toolCallNames.join(',')}]` : '[]';

    const wrapped = new Error(
      `${hint} field=${failedField} finishReason=${finishReason} toolCalls=${toolCallsRendered} cause=${causeName}: ${causeMessage}`,
      { cause: cause instanceof Error ? cause : undefined }
    );
    wrapped.name = 'GenerationResponseError';
    throw wrapped;
  }

  const [steps, text, finishReason, output, usage, totalUsage, responseObj] = settled.map(
    (r) => (r as PromiseFulfilledResult<unknown>).value
  ) as [Array<StepResult<ToolSet>>, string, FinishReason, unknown, unknown, unknown, unknown];

  return {
    ...response,
    steps,
    text,
    finishReason,
    output,
    usage,
    totalUsage,
    response: responseObj,
  } as ResolvedGenerationResponse;
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
  skills?: SkillData[];
  artifactComponents?: ArtifactComponentApiInsert[];
  conversationHistoryConfig?: AgentConversationHistoryConfig;
  models?: Models;
  stopWhen?: SubAgentStopWhen;
  outputContract?: OutputContract;
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

export interface PendingDurableApproval {
  toolCallId: string;
  toolName: string;
  args: unknown;
  delegatedApproval?: {
    toolCallId: string;
    toolName: string;
    args: unknown;
    subAgentId: string;
  };
}

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
  baseInputSchema?: {
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
  resolvedAllowText: boolean;
  artifactComponents: ArtifactComponentApiInsert[];
  currentCompressor: MidGenerationCompressor | null;
  functionToolRelationshipIdByName: Map<string, string>;
  taskDenialRedirects: Array<{ toolName: string; toolCallId: string; reason: string }>;
  durableWorkflowRunId?: string;
  approvedToolCalls?: Record<string, { approved: boolean; reason?: string }>;
  pendingDurableApproval?: PendingDurableApproval;
  delegatedToolApproval?: {
    toolCallId: string;
    toolName: string;
    approved: boolean;
    reason?: string;
  };
}
