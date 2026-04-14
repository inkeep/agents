import { trace } from '@opentelemetry/api';
import type { LanguageModelMiddleware } from 'ai';
import { getLogger } from '../../../logger';
import { isContextOverflowError } from './detectContextOverflow';

const logger = getLogger('compressionRetryMiddleware');

export interface CompressionRetryContext {
  compressPrompt: (prompt: unknown[]) => Promise<unknown[]>;
}

type StreamPart = { type: string; error?: unknown; [key: string]: unknown };

type StreamResult = {
  stream: ReadableStream<StreamPart> | AsyncIterable<StreamPart>;
  request?: unknown;
  response?: unknown;
};

type PeekResult =
  | { kind: 'overflow-pre-commit'; error: unknown }
  | { kind: 'other-error-pre-commit'; error: unknown }
  | {
      kind: 'committed';
      firstChunk: StreamPart;
      rest: AsyncIterator<StreamPart>;
      meta: { request?: unknown; response?: unknown };
    };

function toAsyncIterator(
  stream: ReadableStream<StreamPart> | AsyncIterable<StreamPart>
): AsyncIterator<StreamPart> {
  if (Symbol.asyncIterator in stream) {
    return (stream as AsyncIterable<StreamPart>)[Symbol.asyncIterator]();
  }
  return (stream as ReadableStream<StreamPart>).getReader() as unknown as AsyncIterator<StreamPart>;
}

export async function peekFirstChunk(streamResult: StreamResult): Promise<PeekResult> {
  const reader = toAsyncIterator(streamResult.stream);
  const first = await reader.next();

  if (first.done) {
    return {
      kind: 'committed',
      firstChunk: {
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      rest: reader,
      meta: { request: streamResult.request, response: streamResult.response },
    };
  }

  const chunk = first.value;

  if (chunk.type === 'error') {
    if (isContextOverflowError(chunk.error)) {
      return { kind: 'overflow-pre-commit', error: chunk.error };
    }
    return { kind: 'other-error-pre-commit', error: chunk.error };
  }

  return {
    kind: 'committed',
    firstChunk: chunk,
    rest: reader,
    meta: { request: streamResult.request, response: streamResult.response },
  };
}

async function* prependThenPipe(
  firstChunk: StreamPart,
  rest: AsyncIterator<StreamPart>
): AsyncGenerator<StreamPart> {
  yield firstChunk;
  let result = await rest.next();
  while (!result.done) {
    yield result.value;
    result = await rest.next();
  }
}

function readableStreamFromAsyncGenerator(
  gen: AsyncGenerator<StreamPart>
): ReadableStream<StreamPart> {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

function detectProvider(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown';
  const msg = err.message;
  if (/prompt is too long/i.test(msg) || /input length and max_tokens/i.test(msg)) {
    return 'anthropic';
  }
  return 'openai';
}

function detectDetector(err: unknown): string {
  if (!(err instanceof Error)) return 'heuristic_400';
  const msg = err.message;
  if (/prompt is too long/i.test(msg) || /input length and max_tokens/i.test(msg)) {
    return 'anthropic_regex';
  }
  return 'openai_code';
}

function setRetryTelemetry(
  provider: string,
  detector: string,
  retryNumber: number,
  outcome: string
) {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'compression.trigger': 'overflow_retry',
      'compression.provider': provider,
      'compression.detector': detector,
      'compression.retry_number': retryNumber,
      'compression.outcome': outcome,
    });
  }
}

export function createCompressionRetryMiddleware(
  ctx: CompressionRetryContext
): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',

    async wrapGenerate({ doGenerate, params, model }) {
      try {
        return await doGenerate();
      } catch (err) {
        if (!isContextOverflowError(err)) throw err;

        const provider = detectProvider(err);
        const detector = detectDetector(err);

        logger.info(
          { provider, detector },
          'Context overflow detected in doGenerate, compressing and retrying'
        );

        const compressedPrompt = await ctx.compressPrompt(params.prompt as unknown[]);

        try {
          const result = await model.doGenerate({
            ...params,
            prompt: compressedPrompt as typeof params.prompt,
          });
          setRetryTelemetry(provider, detector, 1, 'success');
          return result;
        } catch (retryErr) {
          const outcome = isContextOverflowError(retryErr) ? 'second_overflow' : 'other_error';
          setRetryTelemetry(provider, detector, 1, outcome);
          throw retryErr;
        }
      }
    },

    async wrapStream({ doStream, params, model }) {
      const innerStreamResult = await doStream();
      const peeked = await peekFirstChunk(innerStreamResult as unknown as StreamResult);

      if (peeked.kind === 'overflow-pre-commit') {
        const provider = detectProvider(peeked.error);
        const detector = detectDetector(peeked.error);

        logger.info(
          { provider, detector },
          'Context overflow detected in stream pre-commit, compressing and retrying'
        );

        const compressedPrompt = await ctx.compressPrompt(params.prompt as unknown[]);

        try {
          const retryResult = await model.doStream({
            ...params,
            prompt: compressedPrompt as typeof params.prompt,
          });
          setRetryTelemetry(provider, detector, 1, 'success');
          return retryResult;
        } catch (retryErr) {
          const outcome = isContextOverflowError(retryErr) ? 'second_overflow' : 'other_error';
          setRetryTelemetry(provider, detector, 1, outcome);
          throw retryErr;
        }
      }

      if (peeked.kind === 'other-error-pre-commit') {
        throw peeked.error;
      }

      const gen = prependThenPipe(peeked.firstChunk, peeked.rest);
      return {
        stream: readableStreamFromAsyncGenerator(gen),
        request: peeked.meta.request,
        response: peeked.meta.response,
      } as Awaited<ReturnType<typeof model.doStream>>;
    },
  };
}
