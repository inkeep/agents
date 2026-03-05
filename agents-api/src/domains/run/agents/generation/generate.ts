import { z } from '@hono/zod-openapi';
import type { DataPart, FilePart, Part } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import type { ToolSet } from 'ai';
import { generateText, Output, streamText } from 'ai';
import { getLogger } from '../../../../logger';
import type { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { agentSessionManager } from '../../session/AgentSession';
import { getStreamHelper } from '../../stream/stream-registry';
import { withJsonPostProcessing } from '../../utils/json-postprocessor';
import { extractTextFromParts } from '../../utils/message-parts';
import { setSpanWithError, tracer } from '../../utils/tracer';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { hasToolCallWithPrefix, resolveGenerationResponse } from '../agent-types';
import { handleStreamGeneration } from '../streaming/stream-handler';
import { V1_BREAKDOWN_SCHEMA } from '../versions/v1/PromptConfig';
import {
  handlePrepareStepCompression,
  handleStopWhenConditions,
} from './ai-sdk-callbacks';
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
  phase?: string,
  fullContextSize?: number
): Record<string, unknown> {
  return {
    ...modelSettings,
    toolChoice,
    messages,
    tools: sanitizedTools,
    prepareStep: async ({ messages: stepMessages }: { messages: unknown[] }) => {
      return await handlePrepareStepCompression(
        stepMessages,
        compressor,
        originalMessageCount,
        fullContextSize
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
      subAgentId: ctx.config.id,
      subAgentName: ctx.config.name,
    },
  };
}

export function handleGenerationError(ctx: AgentRunContext, error: unknown, span: Span): never {
  if (ctx.currentCompressor) {
    ctx.currentCompressor.fullCleanup();
  }
  ctx.currentCompressor = null;

  const errorToThrow = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
      agentId: ctx.config.id,
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
  }
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
  const imageParts = userParts.filter(
    (part): part is FilePart =>
      part.kind === 'file' && part.file.mimeType?.startsWith('image/') === true
  );
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
        let response: ResolvedGenerationResponse;
        let textResponse: string;

        const messages = buildInitialMessages(
          systemPrompt,
          conversationHistory,
          userMessage,
          imageParts
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

        const dataComponentsSchema = hasStructuredOutput ? buildDataComponentsSchema(ctx) : null;

        const baseConfig = buildBaseGenerationConfig(
          ctx,
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

        const nonStreamingConfig = withJsonPostProcessing(generationConfig);

        logger.info(
          {
            agentId: ctx.config.id,
            hasStructuredOutput,
            shouldStream,
          },
          'Starting generation'
        );

        let rawResponse: Record<string, unknown> | ResolvedGenerationResponse;
        if (shouldStream) {
          rawResponse = await handleStreamGeneration(
            ctx,
            streamText(generationConfig as Parameters<typeof streamText>[0]),
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
            agentId: ctx.config.id,
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
              agentId: ctx.config.id,
              dataComponentsCount: response.output?.dataComponents?.length || 0,
              dataComponentNames: response.output?.dataComponents?.map((dc: any) => dc.name) || [],
            },
            'Processing response with data components'
          );
          textResponse = JSON.stringify(response.output, null, 2);
        } else if (hasToolCallWithPrefix('transfer_to_')(response)) {
          textResponse = response.steps[response.steps.length - 1].text || '';
        } else {
          textResponse = response.text || '';
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        const formattedResponse = await formatFinalResponse(
          ctx,
          response,
          textResponse,
          sessionId,
          contextId
        );

        if (streamRequestId) {
          const generationType = response.object ? 'object_generation' : 'text_generation';

          agentSessionManager.recordEvent(streamRequestId, 'agent_generate', ctx.config.id, {
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
