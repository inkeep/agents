import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';

import { getLogger } from './logger.js';

const logger = getLogger('EchoProvider');

function extractLastUserMessage(prompt: LanguageModelV2CallOptions['prompt']): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (msg.role === 'user') {
      for (const part of msg.content) {
        if (part.type === 'text') {
          return part.text.length > 200 ? `${part.text.slice(0, 200)}...` : part.text;
        }
      }
    }
  }
  return '(no user message)';
}

function countInputChars(prompt: LanguageModelV2CallOptions['prompt']): number {
  let chars = 0;
  for (const msg of prompt) {
    if ('content' in msg) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if ('text' in part) {
            chars += part.text.length;
          }
        }
      }
    }
  }
  return chars;
}

function buildEchoResponse(
  modelName: string,
  prompt: LanguageModelV2CallOptions['prompt']
): string {
  const lastUserMessage = extractLastUserMessage(prompt);
  const timestamp = new Date().toISOString();

  return [
    'Echo response.',
    `Model: echo/${modelName}`,
    `Input messages: ${prompt.length}`,
    `Last user message: "${lastUserMessage}"`,
    `Timestamp: ${timestamp}`,
  ].join('\n');
}

export class EchoLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly defaultObjectGenerationMode = undefined;
  readonly supportsImageUrls = false;
  readonly supportedUrls = {};
  readonly provider = 'echo';
  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    this.logProductionWarning();

    const responseText = buildEchoResponse(this.modelId, options.prompt);
    const inputTokens = Math.ceil(countInputChars(options.prompt) / 4);
    const outputTokens = Math.ceil(responseText.length / 4);

    return {
      content: [{ type: 'text' as const, text: responseText }],
      finishReason: 'stop' as const,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    this.logProductionWarning();

    const responseText = buildEchoResponse(this.modelId, options.prompt);
    const lines = responseText.split('\n');
    const inputTokens = Math.ceil(countInputChars(options.prompt) / 4);
    const outputTokens = Math.ceil(responseText.length / 4);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });

        const textId = 'echo-text-0';
        controller.enqueue({ type: 'text-start', id: textId });

        for (let i = 0; i < lines.length; i++) {
          const delta = i < lines.length - 1 ? `${lines[i]}\n` : lines[i];
          controller.enqueue({ type: 'text-delta', id: textId, delta });

          if (i < lines.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }

        controller.enqueue({ type: 'text-end', id: textId });

        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        });

        controller.close();
      },
    });

    return {
      stream,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
      warnings: [],
    };
  }

  private logProductionWarning() {
    if (process.env.ENVIRONMENT === 'production') {
      logger.warn(
        { model: `echo/${this.modelId}` },
        'Echo provider invoked in production environment'
      );
    }
  }
}

export function createEchoModel(modelId: string): EchoLanguageModel {
  return new EchoLanguageModel(modelId);
}
