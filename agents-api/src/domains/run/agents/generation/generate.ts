import { z } from '@hono/zod-openapi';
import type { DataPart, FilePart, MessageContent, Part } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import { generateText, Output, streamText, type ToolSet } from 'ai';
import { getLogger } from '../../../../logger';
import {
  ArtifactCreateSchema,
  ArtifactReferenceSchema,
} from '../../artifacts/artifact-component-schema';
import { agentSessionManager } from '../../session/AgentSession';
import { ResponseFormatter } from '../../stream/ResponseFormatter';
import { getStreamHelper } from '../../stream/stream-registry';
import { withJsonPostProcessing } from '../../utils/json-postprocessor';
import { extractTextFromParts } from '../../utils/message-parts';
import { getModelContextWindow } from '../../utils/model-context-utils';
import { SchemaProcessor } from '../../utils/SchemaProcessor';
import type { ContextBreakdown } from '../../utils/token-estimator';
import { setSpanWithError, tracer } from '../../utils/tracer';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { hasToolCallWithPrefix, resolveGenerationResponse } from '../agent-types';
import { createDelegateToAgentTool, createTransferToAgentTool } from '../relationTools';
import { toolSessionManager } from '../services/ToolSessionManager';
import { handleStreamGeneration } from '../streaming/stream-handler';
import { getDefaultTools } from '../tools/default-tools';
import { getFunctionTools } from '../tools/function-tools';
import { getMcpTools } from '../tools/mcp-tools';
import { sanitizeToolsForAISDK, wrapToolWithStreaming } from '../tools/tool-wrapper';
import { V1_BREAKDOWN_SCHEMA } from '../versions/v1/PromptConfig';
import {
  handlePrepareStepCompression,
  handleStopWhenConditions,
  setupCompression,
} from './compression';
import { buildConversationHistory, buildInitialMessages } from './conversation-history';
import { configureModelSettings, getPrimaryModel } from './model-config';
import { buildSystemPrompt } from './system-prompt';

const logger = getLogger('Agent');

function createRelationToolName(prefix: string, targetId: string): string {
  return `${prefix}_to_${targetId.toLowerCase().replace(/\s+/g, '_')}`;
}

export function getRelationTools(
  ctx: AgentRunContext,
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
  const { transferRelations = [], delegateRelations = [] } = ctx.config;
  return Object.fromEntries([
    ...transferRelations.map((agentConfig) => {
      const toolName = createRelationToolName('transfer', agentConfig.id);
      return [
        toolName,
        wrapToolWithStreaming(
          ctx,
          toolName,
          createTransferToAgentTool({
            transferConfig: agentConfig,
            callingAgentId: ctx.config.id,
            streamRequestId: runtimeContext?.metadata?.streamRequestId,
          }),
          runtimeContext?.metadata?.streamRequestId,
          'transfer'
        ),
      ];
    }),
    ...delegateRelations.map((relation) => {
      const toolName = createRelationToolName('delegate', relation.config.id);

      return [
        toolName,
        wrapToolWithStreaming(
          ctx,
          toolName,
          createDelegateToAgentTool({
            delegateConfig: relation,
            callingAgentId: ctx.config.id,
            executionContext: ctx.executionContext,
            contextId: runtimeContext?.contextId || 'default',
            metadata: runtimeContext?.metadata || {
              conversationId: runtimeContext?.contextId || 'default',
              threadId: runtimeContext?.contextId || 'default',
              streamRequestId: runtimeContext?.metadata?.streamRequestId,
              apiKey: runtimeContext?.metadata?.apiKey,
            },
            sessionId,
            credentialStoreRegistry: ctx.credentialStoreRegistry,
          }),
          runtimeContext?.metadata?.streamRequestId,
          'delegation'
        ),
      ];
    }),
  ]);
}

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

export async function loadToolsAndPrompts(
  ctx: AgentRunContext,
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
): Promise<{ systemPrompt: string; sanitizedTools: ToolSet; contextBreakdown: ContextBreakdown }> {
  const [mcpToolsResult, systemPromptResult, functionTools, relationTools, defaultTools] =
    await tracer.startActiveSpan(
      'agent.load_tools',
      {
        attributes: {
          'subAgent.name': ctx.config.name,
          'session.id': sessionId || 'none',
        },
      },
      async (childSpan: Span) => {
        try {
          const result = await Promise.all([
            getMcpTools(ctx, sessionId, streamRequestId),
            buildSystemPrompt(ctx, runtimeContext, false),
            getFunctionTools(ctx, sessionId, streamRequestId),
            Promise.resolve(getRelationTools(ctx, runtimeContext, sessionId)),
            getDefaultTools(ctx, streamRequestId),
          ]);

          childSpan.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setSpanWithError(childSpan, errorObj);
          throw err;
        } finally {
          childSpan.end();
        }
      }
    );

  const { tools: mcpTools } = mcpToolsResult;

  const systemPrompt = systemPromptResult.prompt;
  const contextBreakdown = systemPromptResult.breakdown;

  const allTools = {
    ...mcpTools,
    ...functionTools,
    ...relationTools,
    ...defaultTools,
  };

  const sanitizedTools = sanitizeToolsForAISDK(allTools);

  return { systemPrompt, sanitizedTools, contextBreakdown };
}

export function buildBaseGenerationConfig(
  ctx: AgentRunContext,
  modelSettings: any,
  messages: any[],
  sanitizedTools: any,
  compressor: any,
  originalMessageCount: number,
  timeoutMs: number,
  toolChoice: 'auto' | 'required' = 'auto',
  phase?: string,
  fullContextSize?: number
): object {
  return {
    ...modelSettings,
    toolChoice,
    messages,
    tools: sanitizedTools,
    prepareStep: async ({ messages: stepMessages }: { messages: any[] }) => {
      return await handlePrepareStepCompression(
        stepMessages,
        compressor,
        originalMessageCount,
        fullContextSize
      );
    },
    stopWhen: async ({ steps }: { steps: any[] }) => {
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

export function buildDataComponentsSchema(ctx: AgentRunContext): z.ZodType<any> {
  const componentSchemas: z.ZodType<any>[] = [];

  ctx.config.dataComponents?.forEach((dc) => {
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

  if (ctx.artifactComponents.length > 0) {
    const artifactCreateSchemas = ArtifactCreateSchema.getSchemas(ctx.artifactComponents);
    componentSchemas.push(...artifactCreateSchemas);
    componentSchemas.push(ArtifactReferenceSchema.getSchema());
  }

  let dataComponentsSchema: z.ZodType<any>;
  if (componentSchemas.length === 1) {
    dataComponentsSchema = componentSchemas[0];
    logger.info({ agentId: ctx.config.id }, 'Using single schema (no union needed)');
  } else {
    dataComponentsSchema = z.union(
      componentSchemas as [z.ZodType<any>, z.ZodType<any>, ...z.ZodType<any>[]]
    );
    logger.info({ agentId: ctx.config.id }, 'Created union schema');
  }

  return dataComponentsSchema;
}

export async function formatFinalResponse(
  ctx: AgentRunContext,
  response: ResolvedGenerationResponse,
  textResponse: string,
  sessionId: string,
  contextId: string
): Promise<ResolvedGenerationResponse> {
  let formattedContent: MessageContent | null = response.formattedContent || null;

  if (!formattedContent) {
    const session = toolSessionManager.getSession(sessionId);

    const modelContextInfo = getModelContextWindow(getPrimaryModel(ctx.config));

    const responseFormatter = new ResponseFormatter(ctx.executionContext, {
      sessionId,
      taskId: session?.taskId,
      projectId: session?.projectId,
      contextId,
      artifactComponents: ctx.artifactComponents,
      streamRequestId: ctx.streamRequestId ?? '',
      subAgentId: ctx.config.id,
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
        'agent.name': ctx.config.name,
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

        if (streamRequestId && ctx.artifactComponents.length > 0) {
          agentSessionManager.updateArtifactComponents(streamRequestId, ctx.artifactComponents);
        }
        const conversationId = runtimeContext?.metadata?.conversationId;

        if (conversationId) {
          ctx.conversationId = conversationId;
        }

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

        let rawResponse: Record<string, unknown>;
        if (shouldStream) {
          rawResponse = (await handleStreamGeneration(
            ctx,
            streamText(generationConfig as any),
            sessionId,
            contextId,
            !!dataComponentsSchema
          )) as unknown as Record<string, unknown>;
        } else {
          rawResponse = (await generateText(nonStreamingConfig as any)) as unknown as Record<
            string,
            unknown
          >;
        }

        logger.info(
          {
            agentId: ctx.config.id,
            hasOutput: !!rawResponse.output,
            dataComponentsCount: (rawResponse.output as any)?.dataComponents?.length || 0,
            finishReason: rawResponse.finishReason,
          },
          'Generation completed'
        );

        response = await resolveGenerationResponse(rawResponse);

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
