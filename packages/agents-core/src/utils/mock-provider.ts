import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';

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

function buildMockResponse(
  modelName: string,
  prompt: LanguageModelV2CallOptions['prompt']
): string {
  const lastUserMessage = extractLastUserMessage(prompt);
  const timestamp = new Date().toISOString();

  return [
    'Mock response.',
    `Model: mock/${modelName}`,
    `Input messages: ${prompt.length}`,
    `Last user message: "${lastUserMessage}"`,
    `Timestamp: ${timestamp}`,
  ].join('\n');
}

export class MockLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly defaultObjectGenerationMode = undefined;
  readonly supportsImageUrls = false;
  readonly supportedUrls = {};
  readonly provider = 'mock';
  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const responseText = buildMockResponse(this.modelId, options.prompt);
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
    const responseText = buildMockResponse(this.modelId, options.prompt);
    const lines = responseText.split('\n');
    const inputTokens = Math.ceil(countInputChars(options.prompt) / 4);
    const outputTokens = Math.ceil(responseText.length / 4);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });

        const textId = 'mock-text-0';
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
}

export function createMockModel(modelId: string): MockLanguageModel {
  return new MockLanguageModel(modelId);
}
