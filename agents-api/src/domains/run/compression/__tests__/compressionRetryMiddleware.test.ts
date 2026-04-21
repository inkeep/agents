import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { APICallError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../logger', () => createMockLoggerModule().module);

import {
  type CompressionRetryContext,
  createCompressionRetryMiddleware,
  peekFirstChunk,
} from '../compressionRetryMiddleware';

function makeOverflowError(): APICallError {
  return new APICallError({
    message: 'This model maximum context length is 128000 tokens.',
    statusCode: 400,
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    data: { error: { code: 'context_length_exceeded' } },
  });
}

function makeGenericError(): Error {
  return new Error('Internal server error');
}

function makeDoGenerateResult() {
  return {
    content: [{ type: 'text' as const, text: 'Hello' }],
    finishReason: 'stop' as const,
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

function makeStreamFromChunks(chunks: Array<{ type: string; [key: string]: unknown }>) {
  let index = 0;
  return {
    stream: new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
        } else {
          controller.close();
        }
      },
    }),
    request: { body: {} },
    response: { headers: {} },
  };
}

function makeMockCtx(): CompressionRetryContext {
  return {
    compressPrompt: vi.fn().mockResolvedValue([{ role: 'system', content: 'compressed' }]),
  };
}

async function readAllChunks(result: { stream: ReadableStream<any> }): Promise<unknown[]> {
  const chunks: unknown[] = [];
  const reader = result.stream.getReader();
  let done = false;
  while (!done) {
    const r = await reader.read();
    if (r.done) {
      done = true;
    } else {
      chunks.push(r.value);
    }
  }
  return chunks;
}

describe('createCompressionRetryMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wrapGenerate', () => {
    it('passes through on success (no overflow)', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const expectedResult = makeDoGenerateResult();
      const doGenerate = vi.fn().mockResolvedValue(expectedResult);
      const model = { doGenerate: vi.fn(), doStream: vi.fn() };

      const result = await middleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: { prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] } as any,
        model: model as any,
      });

      expect(result).toEqual(expectedResult);
      expect(doGenerate).toHaveBeenCalledOnce();
      expect(ctx.compressPrompt).not.toHaveBeenCalled();
      expect(model.doGenerate).not.toHaveBeenCalled();
    });

    it('retries on overflow and succeeds', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const expectedResult = makeDoGenerateResult();
      const doGenerate = vi.fn().mockRejectedValue(makeOverflowError());
      const model = {
        doGenerate: vi.fn().mockResolvedValue(expectedResult),
        doStream: vi.fn(),
      };
      const params = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      } as any;

      const result = await middleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params,
        model: model as any,
      });

      expect(result).toEqual(expectedResult);
      expect(doGenerate).toHaveBeenCalledOnce();
      expect(ctx.compressPrompt).toHaveBeenCalledWith(params.prompt);
      expect(model.doGenerate).toHaveBeenCalledOnce();
    });

    it('propagates second overflow without further retry', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const doGenerate = vi.fn().mockRejectedValue(makeOverflowError());
      const model = {
        doGenerate: vi.fn().mockRejectedValue(makeOverflowError()),
        doStream: vi.fn(),
      };

      await expect(
        middleware.wrapGenerate?.({
          doGenerate,
          doStream: vi.fn(),
          params: { prompt: [] } as any,
          model: model as any,
        })
      ).rejects.toThrow('context length');

      expect(doGenerate).toHaveBeenCalledOnce();
      expect(model.doGenerate).toHaveBeenCalledOnce();
    });

    it('does not retry on non-overflow errors', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const doGenerate = vi.fn().mockRejectedValue(makeGenericError());
      const model = { doGenerate: vi.fn(), doStream: vi.fn() };

      await expect(
        middleware.wrapGenerate?.({
          doGenerate,
          doStream: vi.fn(),
          params: { prompt: [] } as any,
          model: model as any,
        })
      ).rejects.toThrow('Internal server error');

      expect(ctx.compressPrompt).not.toHaveBeenCalled();
      expect(model.doGenerate).not.toHaveBeenCalled();
    });
  });

  describe('wrapStream', () => {
    it('passes through when first chunk is real data', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const textDelta = { type: 'text-delta', delta: 'Hello' };
      const finish = {
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
      };
      const streamResult = makeStreamFromChunks([textDelta, finish]);
      const doStream = vi.fn().mockResolvedValue(streamResult);
      const model = { doGenerate: vi.fn(), doStream: vi.fn() };

      const result = (await middleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params: { prompt: [] } as any,
        model: model as any,
      })) as Awaited<ReturnType<NonNullable<typeof middleware.wrapStream>>>;

      const chunks = await readAllChunks(result);

      expect(chunks[0]).toEqual(textDelta);
      expect(chunks[1]).toEqual(finish);
      expect(ctx.compressPrompt).not.toHaveBeenCalled();
      expect(model.doStream).not.toHaveBeenCalled();
    });

    it('retries on pre-commit overflow error', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const overflowChunk = { type: 'error', error: makeOverflowError() };
      const streamResult = makeStreamFromChunks([overflowChunk]);
      const doStream = vi.fn().mockResolvedValue(streamResult);

      const retryTextDelta = { type: 'text-delta', delta: 'Retry success' };
      const retryFinish = {
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 3 },
      };
      const retryStreamResult = makeStreamFromChunks([retryTextDelta, retryFinish]);
      const model = {
        doGenerate: vi.fn(),
        doStream: vi.fn().mockResolvedValue(retryStreamResult),
      };
      const params = { prompt: [{ role: 'user', content: 'hi' }] } as any;

      const result = (await middleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params,
        model: model as any,
      })) as Awaited<ReturnType<NonNullable<typeof middleware.wrapStream>>>;

      expect(ctx.compressPrompt).toHaveBeenCalledWith(params.prompt);
      expect(model.doStream).toHaveBeenCalledOnce();

      const chunks = await readAllChunks(result);
      expect(chunks[0]).toEqual(retryTextDelta);
    });

    it('throws on pre-commit non-overflow error without retry', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const genericError = makeGenericError();
      const errorChunk = { type: 'error', error: genericError };
      const streamResult = makeStreamFromChunks([errorChunk]);
      const doStream = vi.fn().mockResolvedValue(streamResult);
      const model = { doGenerate: vi.fn(), doStream: vi.fn() };

      await expect(
        middleware.wrapStream?.({
          doGenerate: vi.fn(),
          doStream,
          params: { prompt: [] } as any,
          model: model as any,
        })
      ).rejects.toBe(genericError);

      expect(ctx.compressPrompt).not.toHaveBeenCalled();
      expect(model.doStream).not.toHaveBeenCalled();
    });

    it('propagates post-commit mid-stream errors (not retried)', async () => {
      const ctx = makeMockCtx();
      const middleware = createCompressionRetryMiddleware(ctx);
      const textDelta = { type: 'text-delta', delta: 'Hello' };
      const errorChunk = { type: 'error', error: makeOverflowError() };
      const streamResult = makeStreamFromChunks([textDelta, errorChunk]);
      const doStream = vi.fn().mockResolvedValue(streamResult);
      const model = { doGenerate: vi.fn(), doStream: vi.fn() };

      const result = (await middleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params: { prompt: [] } as any,
        model: model as any,
      })) as Awaited<ReturnType<NonNullable<typeof middleware.wrapStream>>>;

      const chunks = await readAllChunks(result);

      expect(chunks[0]).toEqual(textDelta);
      expect(chunks[1]).toEqual(errorChunk);
      expect(ctx.compressPrompt).not.toHaveBeenCalled();
    });
  });

  describe('peekFirstChunk', () => {
    it('uses async-iterator .next() (not tee())', async () => {
      const textDelta = { type: 'text-delta', delta: 'Hi' };
      const streamResult = makeStreamFromChunks([textDelta]);

      const result = await peekFirstChunk(streamResult as any);
      expect(result.kind).toBe('committed');
      if (result.kind === 'committed') {
        expect(result.firstChunk).toEqual(textDelta);
      }
    });
  });

  describe('code-review constraints', () => {
    it('does not use tee() or Array.from on streams', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const source = readFileSync(resolve(__dirname, '../compressionRetryMiddleware.ts'), 'utf-8');
      expect(source).not.toContain('.tee()');
      expect(source).not.toContain('Array.from');
    });
  });
});
