import { z } from '@hono/zod-openapi';
import {
  type DataPart,
  type FilePart,
  GENERATION_TYPES,
  type Part,
  SESSION_EVENT_AGENT_GENERATE,
  SPAN_KEYS,
  TRANSFER_TOOL_PREFIX,
} from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import type { StepResult, ToolSet } from 'ai';
import { generateText, Output, streamText } from 'ai';
import { getLogger } from '../../../../logger';
import type { StreamPart } from '../../artifacts/ArtifactParser';
import type { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { agentSessionManager } from '../../session/AgentSession';
import { getStreamHelper } from '../../stream/stream-registry';
import { withJsonPostProcessing } from '../../utils/json-postprocessor';
import { extractTextFromParts } from '../../utils/message-parts';
import {
  buildStrippedPartsNote,
  stripIncompatibleOfficeParts,
} from '../../utils/model-file-support';
import { setSpanWithError, tracer } from '../../utils/tracer';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { hasToolCallWithPrefix, resolveGenerationResponse } from '../agent-types';
import { handleStreamGeneration } from '../streaming/stream-handler';
import { V1_BREAKDOWN_SCHEMA } from '../versions/v1/PromptConfig';
import { handlePrepareStepCompression, handleStopWhenConditions } from './ai-sdk-callbacks';
import { setupCompression } from './compression';
import { buildConversationHistory, buildInitialMessages } from './conversation-history';
import { configureModelSettings } from './model-config';
import { formatFinalResponse } from './response-formatting';
import { buildDataComponentsSchema } from './schema-builder';
import { loadToolsAndPrompts } from './tool-loading';

const logger = getLogger('Agent');

export function setupGenerationContext(
  ctx: AgentRunContext,
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
): { contextId: string; taskId: string; streamRequestId: string; sessionId: string } {
  const contextId = runtimeContext?.contextId || 'default';
  const taskId = runtimeContext?.metadata?.taskId || 'unknown';
  const streamRequestId = runtimeContext?.metadata?.streamRequestId;
  const sessionId = streamRequestId || 'fallback-session';

  ctx.streamRequestId = streamRequestId;
  ctx.streamHelper = streamRequestId ? getStreamHelper(streamRequestId) : undefined;

  if (streamRequestId && ctx.artifactComponents.length > 0) {
    agentSessionManager.updateArtifactComponents(streamRequestId, ctx.artifactComponents);
  }

  const conversationId = runtimeContext?.metadata?.conversationId;
  if (conversationId) {
    ctx.conversationId = conversationId;
  }

  return { contextId, taskId, streamRequestId: streamRequestId ?? '', sessionId };
}

export function buildBaseGenerationConfig(
  ctx: AgentRunContext,
  modelSettings: Record<string, unknown>,
  messages: unknown[],
  sanitizedTools: ToolSet,
  compressor: MidGenerationCompressor | null,
  originalMessageCount: number,
  timeoutMs: number,
  toolChoice: 'auto' | 'required' = 'auto',
  phase?: string
): Record<string, unknown> {
  return {
    ...modelSettings,
    toolChoice,
    messages,
    tools: sanitizedTools,
    prepareStep: async ({
      messages: stepMessages,
      steps,
    }: {
      messages: unknown[];
      steps: Array<{ usage: { inputTokens?: number; outputTokens?: number } }>;
    }) => {
      return await handlePrepareStepCompression(
        stepMessages,
        steps,
        compressor,
        originalMessageCount
      );
    },
    stopWhen: async ({ steps }: { steps: unknown[] }) => {
      return await handleStopWhenConditions(ctx, steps);
    },
    experimental_telemetry: buildTelemetryConfig(ctx, phase),
    abortSignal: AbortSignal.timeout(timeoutMs),
  };
}

export function buildTelemetryConfig(ctx: AgentRunContext, phase?: string): object {
  return {
    isEnabled: true,
    functionId: ctx.config.id,
    recordInputs: true,
    recordOutputs: true,
    metadata: {
      ...(phase && { phase }),
      tenantId: ctx.config.tenantId,
      projectId: ctx.config.projectId,
      agentId: ctx.config.agentId,
      subAgentId: ctx.config.id,
      subAgentName: ctx.config.name,
      generationType: GENERATION_TYPES.SUB_AGENT_GENERATION,
      ...(ctx.conversationId && { conversationId: ctx.conversationId }),
    },
  };
}

export function computeGenerationType(
  parts: Array<{ kind?: string }> | undefined | null,
  hasObject: boolean
): 'text_generation' | 'object_generation' | 'mixed_generation' {
  const hasText = (parts || []).some((p) => p?.kind === 'text');
  if (hasText && hasObject) return 'mixed_generation';
  if (hasObject) return 'object_generation';
  return 'text_generation';
}

export function buildStructuredSuccessText(response: ResolvedGenerationResponse): string {
  const prelude = response.text?.trim();
  const json = JSON.stringify(response.output, null, 2);
  if (!prelude) return json;
  if (preludeEqualsOutput(prelude, response.output)) return json;
  return `${prelude}\n\n${json}`;
}

function preludeEqualsOutput(prelude: string, output: unknown): boolean {
  try {
    const parsed = JSON.parse(prelude);
    // Canonicalise key order before comparing — two objects with identical content but different
    // key order (possible when the model's prelude text and the SDK's parsed output take
    // different serialization paths) would otherwise compare unequal and produce a duplicated
    // prelude in the rendered response.
    return canonicalJsonString(parsed) === canonicalJsonString(output);
  } catch {
    return false;
  }
}

function canonicalJsonString(value: unknown): string {
  return JSON.stringify(sortObjectKeysDeep(value));
}

function sortObjectKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortObjectKeysDeep((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export function selectStructuredFallbackText(response: ResolvedGenerationResponse): string {
  if (response.text) return response.text;
  const stepText = response.steps
    ?.map((s: StepResult<ToolSet> | undefined) => s?.text)
    .filter((t): t is string => Boolean(t))
    .join('\n\n');
  return stepText || '';
}

export function mapPartsToEventParts(
  parts: Array<{ kind?: string; text?: string; data?: unknown } | StreamPart> | undefined | null
): Array<{
  type: 'text' | 'data_component' | 'data_artifact';
  content?: string;
  data?: unknown;
}> {
  return (parts || []).map((part) => {
    if (part.kind === 'text') {
      return { type: 'text' as const, content: (part as StreamPart).text ?? '' };
    }
    if (part.kind === 'data') {
      const data = (part as StreamPart).data as
        | { artifactId?: unknown; toolCallId?: unknown }
        | undefined;
      const isArtifact = Boolean(data?.artifactId && data?.toolCallId);
      return {
        type: isArtifact ? ('data_artifact' as const) : ('data_component' as const),
        data: (part as StreamPart).data,
      };
    }
    logger.warn(
      { kind: part.kind, op: 'mapPartsToEventParts' },
      'unknown part kind — mapping to empty text part'
    );
    return { type: 'text' as const, content: '' };
  });
}

export function resolveTextResponseAndWarn({
  response,
  hasStructuredOutput,
  hasTransferToolCall,
  logger: log,
  warnContext,
}: {
  response: ResolvedGenerationResponse;
  hasStructuredOutput: boolean;
  hasTransferToolCall: boolean;
  logger: {
    warn: (obj: Record<string, unknown>, msg: string) => void;
  };
  warnContext: Record<string, unknown>;
}): string {
  if (hasStructuredOutput && response.output) {
    return buildStructuredSuccessText(response);
  }
  if (hasTransferToolCall) {
    return response.steps?.[response.steps.length - 1]?.text || '';
  }
  if (hasStructuredOutput) {
    log.warn(warnContext, 'Structured output expected but not produced; surfacing fallback text');
    return selectStructuredFallbackText(response);
  }
  return response.text || '';
}

export function handleGenerationError(ctx: AgentRunContext, error: unknown, span: Span): never {
  if (ctx.currentCompressor) {
    ctx.currentCompressor.fullCleanup();
  }
  ctx.currentCompressor = null;

  const errorToThrow = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
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

export async function runGenerate(
  ctx: AgentRunContext,
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
  },
  options?: { schemaOnlyTools?: boolean }
): Promise<ResolvedGenerationResponse> {
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
  const fileParts = userParts.filter((part): part is FilePart => part.kind === 'file');
  const conversationIdForSpan = runtimeContext?.metadata?.conversationId;

  return tracer.startActiveSpan(
    'agent.generate',
    {
      attributes: {
        'subAgent.id': ctx.config.id,
        'subAgent.name': ctx.config.name,
        'tenant.id': ctx.config.tenantId,
        'project.id': ctx.config.projectId,
        'agent.id': ctx.config.agentId,
        'agent.name': ctx.config.agentName,
        ...(conversationIdForSpan ? { 'conversation.id': conversationIdForSpan } : {}),
      },
    },
    async (span) => {
      const { contextId, taskId, streamRequestId, sessionId } = setupGenerationContext(
        ctx,
        runtimeContext
      );

      try {
        const {
          systemPrompt,
          sanitizedTools,
          contextBreakdown: initialContextBreakdown,
        } = await loadToolsAndPrompts(ctx, sessionId, streamRequestId || undefined, runtimeContext);

        const { conversationHistory, contextBreakdown } = await buildConversationHistory(
          ctx,
          contextId,
          taskId,
          userMessage,
          streamRequestId || undefined,
          initialContextBreakdown
        );

        const breakdownAttributes: Record<string, number> = {};
        for (const componentDef of V1_BREAKDOWN_SCHEMA) {
          breakdownAttributes[componentDef.spanAttribute] =
            contextBreakdown.components[componentDef.key] ?? 0;
        }
        breakdownAttributes['context.breakdown.total_tokens'] = contextBreakdown.total;
        span.setAttributes(breakdownAttributes);

        const { primaryModelSettings, modelSettings, hasStructuredOutput, timeoutMs } =
          configureModelSettings(ctx);

        const resolvedModelId = primaryModelSettings.model ?? '';
        const { compatible: compatibleFileParts, stripped } = stripIncompatibleOfficeParts(
          fileParts,
          resolvedModelId
        );

        let effectiveUserMessage = userMessage;
        if (stripped.length > 0) {
          const note = buildStrippedPartsNote(stripped);
          effectiveUserMessage = `${userMessage}\n\n${note}`;
          logger.warn(
            {
              agentId: ctx.config.id,
              modelId: primaryModelSettings.model,
              strippedParts: stripped,
            },
            'Stripped incompatible office document parts before generation'
          );
          span.setAttribute('input.stripped_file_count', stripped.length);
        }

        const inlinePdfFileCount = compatibleFileParts.filter(
          (part) => part.file.mimeType?.toLowerCase().startsWith('application/pdf') === true
        ).length;
        span.setAttributes({
          'input.file_count': compatibleFileParts.length,
          'input.pdf_file_count': inlinePdfFileCount,
        });
        let response: ResolvedGenerationResponse;

        const toolsForLlm = options?.schemaOnlyTools
          ? Object.fromEntries(
              Object.entries(sanitizedTools).map(([k, v]) => [k, { ...v, execute: undefined }])
            )
          : sanitizedTools;

        const messages = await buildInitialMessages(
          systemPrompt,
          conversationHistory,
          effectiveUserMessage,
          compatibleFileParts
        );

        const { originalMessageCount, compressor } = setupCompression(
          ctx,
          messages,
          sessionId,
          contextId,
          primaryModelSettings
        );

        const streamConfig = {
          ...modelSettings,
          toolChoice: 'auto' as const,
        };

        const shouldStream = ctx.isDelegatedAgent ? undefined : ctx.streamHelper;

        let dataComponentsSchema: z.ZodType<any> | null = null;
        if (hasStructuredOutput) {
          try {
            dataComponentsSchema = buildDataComponentsSchema(ctx);
          } catch (err) {
            logger.error(
              { err },
              'Failed to build data components schema — continuing without structured output'
            );
          }
        }

        const baseConfig = buildBaseGenerationConfig(
          ctx,
          streamConfig,
          messages,
          toolsForLlm,
          compressor,
          originalMessageCount,
          timeoutMs,
          'auto',
          dataComponentsSchema ? 'structured_generation' : undefined
        );

        const generationConfig = dataComponentsSchema
          ? {
              ...baseConfig,
              output: Output.object({
                schema: z.object({
                  dataComponents: z.array(dataComponentsSchema),
                }),
              }),
              // ---------------------------------------------------------------------------
              // Anthropic: force synthetic-tool path for token-level structured-output streaming
              // ---------------------------------------------------------------------------
              //
              // Default behaviour ('auto' / 'outputFormat') on Claude Sonnet 4.5 / Opus 4.5 /
              // Opus 4.1 routes through Anthropic's native structured-outputs beta
              // (`output_format: { type: "json_schema" }`, beta header
              // `structured-outputs-2025-11-13`). In streaming mode that path has a
              // client-visible failure: the final structured JSON arrives as ONE giant
              // text-delta event after 20+ seconds of silence post-tool-result, instead of
              // token-by-token. We measured a single 3197-char text-delta in diagnostics.
              //
              // Root cause is in the Vercel AI SDK's `createOutputTransformStream`
              // (ai/dist/index.mjs): the transform only publishes a text chunk when
              // `parsePartialOutput` produces a new parseable result. For deeply nested
              // schemas like `{ dataComponents: [...] }`, `parsePartialJson` can't produce a
              // valid partial until the full JSON closes, so every intermediate text-delta is
              // swallowed and the whole buffer is dumped at `finish-step`. Anthropic's HTTP
              // API itself streams `text_delta` events fine — confirmed by Anthropic's own
              // docs and Vercel's AI Gateway examples. Upgrading `ai` (6.0.14 → 6.0.168) and
              // `@ai-sdk/anthropic` (3.0.7 → 3.0.71) does NOT fix this — the transform-gate
              // has not changed upstream. Community tracking: vercel/ai#3422, #12427, #12298,
              // #7220, #9351 (all open or recent, multiple reporters, no upstream fix).
              //
              // `structuredOutputMode: 'jsonTool'` forces the Anthropic provider's
              // synthetic-tool fallback: instead of `output_format`, it injects a synthetic
              // tool named "json" with `tool_choice: required` and streams tokens as
              // `input_json_delta` → `text-delta` events. That path bypasses
              // `createOutputTransformStream` entirely and gives us smooth token-level
              // streaming of the final structured output.
              //
              // Known tradeoff: `tool_choice: required` prefills the assistant turn, so
              // Claude does NOT emit pre-tool-call reasoning text ("Let me search..."). This
              // is documented API behaviour in Anthropic's tool-use docs:
              // "the API prefills the assistant message to force a tool to be used... models
              //  will not emit a natural language response or explanation before tool_use
              //  content blocks, even if explicitly asked to do so."
              // We accept this loss because our existing data-operation wire events (tool_call,
              // tool_result) still surface tool activity to the UI, and immediate streaming of
              // the final answer is better UX than a long silent window.
              //
              // The alternative escape hatches all have significant cost:
              //   - Keep `auto` and accept the 20s burst — worst UX overall.
              //   - Drop `Output.object()` and parse JSON ourselves — loses API-enforced
              //     schema validation (model could emit malformed JSON or wrong shape).
              //   - Two-call architecture (streamText without `output` for reasoning + tool
              //     calls, then generateObject/streamText with `output` for the structured
              //     answer) — doubles API round-trips and complicates state management.
              //
              // Namespaced under `anthropic`, so other providers (OpenAI, Google, Bedrock)
              // ignore this option completely. If those providers show similar structured-
              // output buffering in the future, a sibling `providerOptions.<provider>` entry
              // can be added without touching this one.
              //
              // References:
              //   - @ai-sdk/anthropic@3.0.7 dist/index.js:744-750 (structuredOutputMode schema)
              //   - @ai-sdk/anthropic@3.0.7 dist/index.js:2413-2477 (mode routing)
              //   - @ai-sdk/anthropic@3.0.7 dist/index.js:2644 (tool_choice: required)
              //   - ai@6.0.14 dist/index.mjs:5698-5758 (createOutputTransformStream gate)
              //   - Anthropic docs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
              //   - Anthropic tool_choice: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
              //   - vercel/ai#12427 (open, most recent reproduction)
              //   - vercel/ai#9351 (community middleware workaround)
              providerOptions: {
                ...(baseConfig as { providerOptions?: Record<string, unknown> }).providerOptions,
                anthropic: {
                  ...((
                    baseConfig as {
                      providerOptions?: { anthropic?: Record<string, unknown> };
                    }
                  ).providerOptions?.anthropic ?? {}),
                  structuredOutputMode: 'jsonTool',
                },
              },
            }
          : baseConfig;

        const nonStreamingConfig = withJsonPostProcessing(generationConfig);

        logger.info(
          {
            hasStructuredOutput,
            shouldStream,
          },
          'Starting generation'
        );

        let rawResponse: Record<string, unknown> | ResolvedGenerationResponse;
        if (shouldStream) {
          const streamResult = streamText(generationConfig as Parameters<typeof streamText>[0]);
          rawResponse = await handleStreamGeneration(
            ctx,
            streamResult,
            sessionId,
            contextId,
            !!dataComponentsSchema
          );
        } else {
          rawResponse = (await generateText(
            nonStreamingConfig as Parameters<typeof generateText>[0]
          )) as unknown as Record<string, unknown>;
        }

        logger.info(
          {
            hasOutput: !!rawResponse.output,
            dataComponentsCount:
              (rawResponse.output as { dataComponents?: unknown[] } | undefined)?.dataComponents
                ?.length ?? 0,
            finishReason: rawResponse.finishReason,
          },
          'Generation completed'
        );

        response = await resolveGenerationResponse(rawResponse as Record<string, unknown>);

        if (hasStructuredOutput && response.output) {
          response.object = response.output;

          logger.info(
            {
              dataComponentsCount: response.output?.dataComponents?.length || 0,
              dataComponentNames: response.output?.dataComponents?.map((dc: any) => dc.name) || [],
            },
            'Processing response with data components'
          );
        }

        const hasTransferToolCall = hasToolCallWithPrefix(TRANSFER_TOOL_PREFIX)(response);
        const textResponse = resolveTextResponseAndWarn({
          response,
          hasStructuredOutput,
          hasTransferToolCall,
          logger,
          warnContext: {
            agentId: ctx.config.id,
            conversationId: conversationIdForSpan,
            finishReason: response.finishReason,
          },
        });

        const actualInputTokens = response.totalUsage?.inputTokens ?? response.usage?.inputTokens;
        if (actualInputTokens != null) {
          span.setAttribute(SPAN_KEYS.CONTEXT_BREAKDOWN_ACTUAL_INPUT_TOKENS, actualInputTokens);
        }

        const isTimeoutAbort = response.finishReason === 'other';

        if (isTimeoutAbort) {
          const timeoutError = new Error(`Generation terminated by timeout/abort signal`);

          logger.warn(
            {
              finishReason: response.finishReason,
              conversationId: conversationIdForSpan,
            },
            'Generation terminated by timeout/abort signal'
          );

          span.setAttributes({
            [SPAN_KEYS.GENERATION_TIMEOUT_MS]: timeoutMs,
          });
          setSpanWithError(span, timeoutError);
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        span.end();

        const formattedResponse = await formatFinalResponse(
          ctx,
          response,
          textResponse,
          sessionId,
          contextId
        );

        if (streamRequestId) {
          const generationType = computeGenerationType(
            formattedResponse.formattedContent?.parts,
            !!response.object
          );

          agentSessionManager.recordEvent(
            streamRequestId,
            SESSION_EVENT_AGENT_GENERATE,
            ctx.config.id,
            {
              parts: mapPartsToEventParts(formattedResponse.formattedContent?.parts),
              generationType,
            }
          );
        }

        if (compressor) {
          compressor.fullCleanup();
        }
        ctx.currentCompressor = null;

        return formattedResponse;
      } catch (error) {
        handleGenerationError(ctx, error, span);
      }
    }
  );
}
