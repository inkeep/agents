import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import {
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  type ParseResult,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import {
  type DelegationReturnedData,
  type DelegationSentData,
  StreamEventSchema,
  type TransferData,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { convertToInkeepChatMessages } from './convert-to-inkeep-messages';
import { getResponseMetadata } from './get-response-metadata';
import type { InkeepChatOptions } from './inkeep-chat-options';
import type { InkeepFinishReason } from './inkeep-chat-prompt';
import { inkeepFailedResponseHandler } from './inkeep-error';
import { mapInkeepFinishReason } from './map-inkeep-finish-reason';

interface InkeepChatConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: typeof fetch;
}

/**
 * Converts data-operation events to AI SDK tool events (tool-call or tool-result).
 *
 * Handles:
 * - tool_call: Direct tool invocation (tool-call)
 * - tool_result: Direct tool result (tool-result)
 * - transfer: Agent transfers control to another agent (tool-call)
 * - delegation_sent: Agent delegates a task to another agent (tool-call)
 * - delegation_returned: Delegated task completes and returns (tool-result)
 */
function convertDataOperationToToolEvent(opData: any): LanguageModelV2StreamPart | null {
  if (!opData || typeof opData !== 'object' || !('type' in opData)) {
    return null;
  }

  const eventType = opData.type;
  const data = opData.details?.data;

  if (!data) {
    return null;
  }

  switch (eventType) {
    case 'tool_call': {
      return {
        type: 'tool-call',
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        input: JSON.stringify(data.input), // AI SDK requires stringified JSON
      };
    }

    case 'tool_result': {
      return {
        type: 'tool-result',
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        result: data.output?.result ?? data.output,
      };
    }

    case 'transfer': {
      const transferData = data as TransferData;
      return {
        type: 'tool-call',
        toolCallId: `transfer_${Date.now()}`,
        toolName: transferData.targetSubAgent,
        input: JSON.stringify({
          fromSubAgent: transferData.fromSubAgent,
          reason: transferData.reason,
          context: transferData.context,
        }),
      };
    }

    case 'delegation_sent': {
      const delegationData = data as DelegationSentData;
      return {
        type: 'tool-call',
        toolCallId: delegationData.delegationId,
        toolName: delegationData.targetSubAgent,
        input: JSON.stringify({
          fromSubAgent: delegationData.fromSubAgent,
          taskDescription: delegationData.taskDescription,
          context: delegationData.context,
        }),
      };
    }

    case 'delegation_returned': {
      const returnedData = data as DelegationReturnedData;
      return {
        type: 'tool-result',
        toolCallId: returnedData.delegationId,
        toolName: returnedData.targetSubAgent,
        result: returnedData.result,
      };
    }

    default:
      return null;
  }
}

export class InkeepChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly defaultObjectGenerationMode = undefined;
  readonly supportsImageUrls = false;
  readonly supportedUrls = {};

  readonly modelId: string;
  readonly options: InkeepChatOptions;
  readonly config: InkeepChatConfig;

  get provider(): string {
    return this.config.provider;
  }

  constructor(modelId: string, options: InkeepChatOptions, config: InkeepChatConfig) {
    this.modelId = modelId;
    this.options = options;
    this.config = config;
  }

  private getArgs(options: LanguageModelV2CallOptions) {
    const warnings: LanguageModelV2CallWarning[] = [];

    return {
      args: {
        model: this.modelId,
        messages: convertToInkeepChatMessages(options.prompt),
        max_tokens: this.options.maxTokens,
        conversationId: this.options.conversationId,
        headers: this.options.headers,
        runConfig: this.options.runConfig,
      },
      warnings,
    };
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseURL}/api/chat`,
      headers: this.config.headers(),
      body: {
        ...args,
        stream: false,
      },
      failedResponseHandler: inkeepFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(inkeepChatCompletionSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { value: completion } = response;
    const choice = completion.choices[0];

    const content: LanguageModelV2Content[] = [];

    if (choice.message.content) {
      content.push({
        type: 'text',
        text: choice.message.content,
      });
    }

    return {
      content,
      finishReason: mapInkeepFinishReason(choice.finish_reason as InkeepFinishReason),
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
      rawCall: {
        rawPrompt: args.messages,
        rawSettings: args,
      },
      rawResponse: {
        headers: response.responseHeaders,
      },
      response: getResponseMetadata(completion),
      warnings,
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const { args, warnings } = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseURL}/api/chat`,
      headers: this.config.headers(),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: inkeepFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(StreamEventSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { value: stream } = response;

    let finishReason: LanguageModelV2FinishReason = 'unknown';
    let usage = {
      promptTokens: 0,
      completionTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    return {
      stream: stream.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof StreamEventSchema>>,
          LanguageModelV2StreamPart
        >({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings });
          },

          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const event = chunk.value;

            switch (event.type) {
              case 'text-start':
                // Text stream beginning
                controller.enqueue({
                  type: 'text-start',
                  id: event.id,
                });
                break;

              case 'text-delta':
                // Stream text delta
                controller.enqueue({
                  type: 'text-delta',
                  id: event.id,
                  delta: event.delta,
                });
                break;

              case 'text-end':
                // Text stream end
                controller.enqueue({
                  type: 'text-end',
                  id: event.id,
                });
                break;

              case 'data-component':
              case 'data-summary':
                // Ignore data components and summaries (not part of LanguageModelV2StreamPart)
                break;

              case 'data-operation': {
                // Convert data-operation events to tool events using the helper function
                const toolEvent = convertDataOperationToToolEvent(event.data);
                if (toolEvent) {
                  controller.enqueue(toolEvent);
                }
                // Other operation types (agent_initializing, completion, etc.) are ignored
                break;
              }

              case 'error':
                // Handle error events
                controller.enqueue({
                  type: 'error',
                  error: new Error(event.error),
                });
                break;

              case 'finish':
                // Handle finish event
                if (event.finishReason) {
                  finishReason = mapInkeepFinishReason(event.finishReason as InkeepFinishReason);
                }
                if (event.usage) {
                  usage = {
                    promptTokens: event.usage.promptTokens ?? 0,
                    completionTokens: event.usage.completionTokens ?? 0,
                    inputTokens: event.usage.promptTokens ?? 0,
                    outputTokens: event.usage.completionTokens ?? 0,
                    totalTokens: event.usage.totalTokens ?? 0,
                  };
                }
                break;

              default: {
                console.warn('Unhandled stream event type');
                break;
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage,
            });
          },
        })
      ),
      rawCall: {
        rawPrompt: args.messages,
        rawSettings: args,
      },
      rawResponse: {
        headers: response.responseHeaders,
      },
      warnings,
    };
  }
}

const inkeepChatCompletionSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      index: z.number(),
      message: z.object({
        role: z.literal('assistant'),
        content: z.string(),
      }),
      finish_reason: z.string(),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});
