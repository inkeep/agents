import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncrementalStreamParser } from '../../../stream/IncrementalStreamParser';
import { handleStreamGeneration } from '../stream-handler';

vi.mock('../../../../logger', () => createMockLoggerModule().module);

const setupStreamParserMock = vi.fn();
vi.mock('../stream-parser', () => ({
  setupStreamParser: (...args: unknown[]) => setupStreamParserMock(...args),
}));

function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
        await Promise.resolve();
      }
    },
  };
}

function makeStreamResult({
  fullStreamEvents,
  partialOutputDeltas,
  text = '',
  steps = [],
  output,
  finishReason = 'stop',
}: {
  fullStreamEvents: Array<Record<string, unknown>>;
  partialOutputDeltas: Array<unknown>;
  text?: string;
  steps?: unknown[];
  output?: unknown;
  finishReason?: string;
}) {
  return {
    fullStream: asyncIterable(fullStreamEvents),
    partialOutputStream: asyncIterable(partialOutputDeltas),
    text,
    steps,
    output,
    finishReason,
    usage: undefined,
    totalUsage: undefined,
    response: undefined,
  } as unknown as Parameters<typeof handleStreamGeneration>[1];
}

type ParserCall =
  | { kind: 'text'; text: string }
  | { kind: 'object'; delta: unknown }
  | { kind: 'tool-result' }
  | { kind: 'finalize' };

function makeMockParser(calls: ParserCall[]): IncrementalStreamParser {
  const collectedParts: Array<{ kind: 'text' | 'data'; text?: string; data?: unknown }> = [];
  const parser: Partial<IncrementalStreamParser> = {
    processTextChunk: vi.fn(async (text: string) => {
      calls.push({ kind: 'text', text });
      collectedParts.push({ kind: 'text', text });
    }),
    processObjectDelta: vi.fn(async (delta: unknown) => {
      calls.push({ kind: 'object', delta });
      collectedParts.push({ kind: 'data', data: delta });
    }),
    markToolResult: vi.fn(() => {
      calls.push({ kind: 'tool-result' });
    }),
    finalize: vi.fn(async () => {
      calls.push({ kind: 'finalize' });
    }),
    getCollectedParts: vi.fn(() => collectedParts as any),
  };
  return parser as IncrementalStreamParser;
}

const baseCtx = {} as Parameters<typeof handleStreamGeneration>[0];

describe('handleStreamGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when hasStructuredOutput is true', () => {
    it('consumes both fullStream text-deltas and partialOutputStream deltas', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: 'Let me search...' },
          { type: 'tool-call' },
          { type: 'tool-result' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [
          { dataComponents: [{ id: 'card1', name: 'Card', props: { title: 'A' } }] },
          { dataComponents: [{ id: 'card1', name: 'Card', props: { title: 'A' } }] },
        ],
        output: { dataComponents: [{ id: 'card1', name: 'Card', props: { title: 'A' } }] },
        text: '',
      });

      const result = await handleStreamGeneration(
        baseCtx,
        streamResult,
        'session-1',
        'context-1',
        true
      );

      expect(parser.processTextChunk).toHaveBeenCalledWith('Let me search...');
      expect(parser.processObjectDelta).toHaveBeenCalledTimes(2);
      expect(parser.finalize).toHaveBeenCalledTimes(1);

      const kinds = calls.map((c) => c.kind);
      expect(kinds).toContain('text');
      expect(kinds).toContain('object');
      expect(kinds[kinds.length - 1]).toBe('finalize');

      expect(result.formattedContent?.parts?.some((p) => p.kind === 'text')).toBe(true);
      expect(result.formattedContent?.parts?.some((p) => p.kind === 'data')).toBe(true);
    });

    it('preserves fullStream text when partialOutputStream is empty (object failed to materialize)', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: 'Let me search...' },
          { type: 'tool-call' },
          { type: 'tool-result' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
        output: null,
        text: '',
      });

      const result = await handleStreamGeneration(
        baseCtx,
        streamResult,
        'session-1',
        'context-1',
        true
      );

      expect(parser.processTextChunk).toHaveBeenCalledWith('Let me search...');
      expect(parser.processObjectDelta).not.toHaveBeenCalled();
      expect(result.formattedContent?.parts).toEqual([{ kind: 'text', text: 'Let me search...' }]);
    });

    it('filters out falsy partial-output deltas', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [],
        partialOutputDeltas: [null, undefined, { dataComponents: [] }, 0 as any],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      expect(parser.processObjectDelta).toHaveBeenCalledTimes(1);
      expect(parser.processObjectDelta).toHaveBeenCalledWith({ dataComponents: [] });
    });

    it('forwards tool-call/tool-result/finish markToolResult calls from fullStream', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'tool-call' },
          { type: 'tool-result' },
          { type: 'finish', finishReason: 'tool-calls' },
        ],
        partialOutputDeltas: [],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      expect(parser.markToolResult).toHaveBeenCalledTimes(3);
    });

    it('surfaces error events from fullStream', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [{ type: 'error', error: new Error('stream blew up') }],
        partialOutputDeltas: [],
        output: null,
      });

      await expect(
        handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true)
      ).rejects.toThrow('stream blew up');
    });

    it('stops consuming partialOutputStream after fullStream throws (AbortController cancellation)', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      let partialDeltasProcessed = 0;
      const partialIterator = {
        async *[Symbol.asyncIterator]() {
          while (true) {
            partialDeltasProcessed += 1;
            yield { dataComponents: [{ id: `c-${partialDeltasProcessed}` }] };
            await new Promise((r) => setTimeout(r, 1));
          }
        },
      };

      const fullStreamIterator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'text-delta', text: 'partial' };
          await new Promise((r) => setTimeout(r, 2));
          yield { type: 'error', error: new Error('boom mid-stream') };
        },
      };

      const streamResult = {
        fullStream: fullStreamIterator,
        partialOutputStream: partialIterator,
        text: '',
        steps: [],
        output: null,
        finishReason: 'stop',
      } as unknown as Parameters<typeof handleStreamGeneration>[1];

      await expect(
        handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true)
      ).rejects.toThrow('boom mid-stream');

      const beforeAbort = partialDeltasProcessed;
      await new Promise((r) => setTimeout(r, 30));
      const afterAbort = partialDeltasProcessed;
      expect(afterAbort - beforeAbort).toBeLessThanOrEqual(1);
    });
  });

  describe('when hasStructuredOutput is false', () => {
    it('only consumes fullStream (no partialOutputStream iteration)', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const partialIterableSpy = vi.fn(async function* () {
        yield { dataComponents: [{ id: 'x' }] };
      });
      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: 'hello' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
      });
      (streamResult as any).partialOutputStream = {
        [Symbol.asyncIterator]: partialIterableSpy,
      };

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', false);

      expect(parser.processTextChunk).toHaveBeenCalledWith('hello');
      expect(parser.processObjectDelta).not.toHaveBeenCalled();
      expect(partialIterableSpy).not.toHaveBeenCalled();
    });
  });

  describe('ordering', () => {
    it('text-deltas and object deltas interleave by tee-delivery order', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: 'T1' },
          { type: 'text-delta', text: 'T2' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [{ dataComponents: [{ id: 'a' }] }],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      const kinds = calls.filter((c) => c.kind !== 'finalize').map((c) => c.kind);
      expect(kinds).toContain('text');
      expect(kinds).toContain('object');
      expect(calls[calls.length - 1].kind).toBe('finalize');
    });
  });

  describe('structured-output fullStream JSON parsing', () => {
    it('parses JSON text-deltas from fullStream and feeds objects to processObjectDelta', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: '{"dataComponents":[' },
          { type: 'text-delta', text: '{"id":"text1","name":"Text","props":{"text":"Hi"' },
          { type: 'text-delta', text: '}}]}' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
        output: { dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hi' } }] },
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      expect(parser.processTextChunk).not.toHaveBeenCalled();
      expect(parser.processObjectDelta).toHaveBeenCalled();
      const lastCallArg = (parser.processObjectDelta as ReturnType<typeof vi.fn>).mock.calls.at(
        -1
      )?.[0];
      expect(lastCallArg).toMatchObject({
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hi' } }],
      });
    });

    it('parses arrays at root when JSON starts with "["', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: '[{"id":"a"}' },
          { type: 'text-delta', text: ',{"id":"b"}]' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      expect(parser.processTextChunk).not.toHaveBeenCalled();
      expect(parser.processObjectDelta).toHaveBeenCalled();
    });

    it('forwards text-deltas whose step starts with non-JSON characters to processTextChunk', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: 'Let me search' },
          { type: 'text-delta', text: ' for that...' },
          { type: 'tool-call' },
          { type: 'tool-result' },
          { type: 'finish', finishReason: 'tool-calls' },
        ],
        partialOutputDeltas: [],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      expect(parser.processTextChunk).toHaveBeenCalledTimes(2);
      expect(parser.processTextChunk).toHaveBeenNthCalledWith(1, 'Let me search');
      expect(parser.processTextChunk).toHaveBeenNthCalledWith(2, ' for that...');
    });

    it('tolerates whitespace before the first non-whitespace char when sniffing mode', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: '   \n  {"dataComponents":[' },
          { type: 'text-delta', text: '{"id":"a"}]}' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      expect(parser.processTextChunk).not.toHaveBeenCalled();
      expect(parser.processObjectDelta).toHaveBeenCalled();
    });

    it('resets the JSON buffer on finish-step so multi-step JSON does not concatenate', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      // AI SDK v6 emits 'finish-step' between steps (per-step finishReason) and 'finish' only at
      // the end. Without resetting on 'finish-step', step 2's JSON gets appended onto step 1's
      // already-closed JSON, parsePartialJson can't recover, and step 2's content never streams.
      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: '{"dataComponents":[{"id":"text1","name":"Text"' },
          { type: 'text-delta', text: ',"props":{"text":"Hi! Let me search..."}}]}' },
          { type: 'tool-call' },
          { type: 'tool-result' },
          { type: 'finish-step', finishReason: 'tool-calls' },
          { type: 'text-delta', text: '{"dataComponents":[{"id":"text2","name":"Text"' },
          { type: 'text-delta', text: ',"props":{"text":"Based on search..."}}]}' },
          { type: 'finish-step', finishReason: 'stop' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      const deltas = (parser.processObjectDelta as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0]
      );
      const lastDelta = deltas.at(-1) as { dataComponents?: Array<{ id?: string }> } | undefined;
      expect(lastDelta?.dataComponents?.[0]?.id).toBe('text2');
    });

    it('does not accumulate JSON when hasStructuredOutput is false', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: '{"foo":"bar"}' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', false);

      expect(parser.processTextChunk).toHaveBeenCalledWith('{"foo":"bar"}');
      expect(parser.processObjectDelta).not.toHaveBeenCalled();
    });

    it('deduplicates repeated snapshots so no-op text-deltas do not re-emit', async () => {
      const calls: ParserCall[] = [];
      const parser = makeMockParser(calls);
      setupStreamParserMock.mockReturnValue(parser);

      const streamResult = makeStreamResult({
        fullStreamEvents: [
          { type: 'text-delta', text: '{"dataComponents":[{"id":"a"}]}' },
          // Redundant whitespace chunk that produces the same parsed snapshot:
          { type: 'text-delta', text: '   ' },
          { type: 'finish', finishReason: 'stop' },
        ],
        partialOutputDeltas: [],
        output: null,
      });

      await handleStreamGeneration(baseCtx, streamResult, 'session-1', 'context-1', true);

      // Only one processObjectDelta call because the second text-delta produces the same snapshot.
      expect(parser.processObjectDelta).toHaveBeenCalledTimes(1);
    });
  });
});
