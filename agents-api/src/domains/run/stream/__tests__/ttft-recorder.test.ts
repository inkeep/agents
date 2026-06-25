import { performance } from 'node:perf_hooks';
import { SPAN_KEYS } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSSEStreamHelper,
  createVercelStreamHelper,
  type HonoSSEStream,
  type VercelUIWriter,
} from '../stream-helpers';
import {
  getTtftRecorder,
  registerTtftRecorder,
  TtftRecorder,
  unregisterTtftRecorder,
} from '../ttft-recorder';

const MODEL = SPAN_KEYS.TTFT_MODEL_TOKEN;
const TEXT = SPAN_KEYS.TTFT_VISIBLE_TOKEN;
const PART = SPAN_KEYS.TTFT_VISIBLE_PART;

/**
 * In-memory OpenTelemetry span exporter harness. Lets a test start a real span,
 * have production code set attributes on it, then read the *finished* span and
 * assert on the exact attribute keys/values — the substrate that did not exist
 * in agents-api before (every prior span test asserted against a `vi.fn()` setter
 * and could not tell which span got the attribute).
 */
function createSpanHarness() {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer('ttft-test');
  return {
    startSpan: (name = 'interaction'): Span => tracer.startSpan(name),
    finishedSpans: (): ReadableSpan[] => exporter.getFinishedSpans(),
    reset: () => exporter.reset(),
    shutdown: () => provider.shutdown(),
  };
}

/** Minimal HonoSSEStream stub that records nothing and never sleeps. */
function fakeSSEStream(): HonoSSEStream {
  return {
    writeSSE: async () => {},
    sleep: async () => {},
  };
}

/** Minimal VercelUIWriter stub that records nothing. */
function fakeVercelWriter(): VercelUIWriter {
  return {
    write: () => {},
    merge: () => {},
  };
}

describe('TtftRecorder', () => {
  let harness: ReturnType<typeof createSpanHarness>;

  beforeEach(() => {
    harness = createSpanHarness();
  });

  afterEach(async () => {
    await harness.shutdown();
  });

  it('records each metric exactly once (first-write-wins) with the elapsed value in seconds', () => {
    const span = harness.startSpan();
    // t0 ~100ms in the past so elapsed is a stable positive value.
    const recorder = new TtftRecorder(performance.now() - 100, span);

    recorder.recordModelToken();
    recorder.recordVisibleToken();
    recorder.recordVisiblePart();
    // Later calls must be no-ops (first-write-wins).
    recorder.recordModelToken();
    recorder.recordVisibleToken();
    recorder.recordVisiblePart();

    span.end();
    const [finished] = harness.finishedSpans();
    expect(finished).toBeDefined();

    for (const key of [MODEL, TEXT, PART]) {
      const value = finished.attributes[key];
      expect(typeof value, `${key} should be a number`).toBe('number');
      // seconds: ~0.1s elapsed, generously bounded to avoid flakiness.
      expect(value as number).toBeGreaterThan(0);
      expect(value as number).toBeLessThan(60);
    }
  });

  it('does not throw and records nothing when there is no interaction span', () => {
    const recorder = new TtftRecorder(performance.now(), undefined);
    expect(() => {
      recorder.recordModelToken();
      recorder.recordVisibleToken();
      recorder.recordVisiblePart();
    }).not.toThrow();
  });

  it('registry resolves the recorder by requestId and unregister removes it', () => {
    const recorder = new TtftRecorder(performance.now(), undefined);
    registerTtftRecorder('req-1', recorder);
    expect(getTtftRecorder('req-1')).toBe(recorder);
    unregisterTtftRecorder('req-1');
    expect(getTtftRecorder('req-1')).toBeUndefined();
  });
});

describe('SSEStreamHelper TTFT latches', () => {
  let harness: ReturnType<typeof createSpanHarness>;

  beforeEach(() => {
    harness = createSpanHarness();
  });

  afterEach(async () => {
    await harness.shutdown();
  });

  it('streamText records BOTH visible-token and visible-part', async () => {
    const span = harness.startSpan();
    const recorder = new TtftRecorder(performance.now() - 10, span);
    const helper = createSSEStreamHelper(fakeSSEStream(), 'req', 0, recorder);

    await helper.streamText('hello world', 0);

    span.end();
    const [finished] = harness.finishedSpans();
    expect(typeof finished.attributes[TEXT]).toBe('number');
    expect(typeof finished.attributes[PART]).toBe('number');
  });

  it('no-text turn: a tool card records visible-part but NOT visible-token (D10/D11)', async () => {
    const span = harness.startSpan();
    const recorder = new TtftRecorder(performance.now() - 10, span);
    const helper = createSSEStreamHelper(fakeSSEStream(), 'req', 0, recorder);

    // Tool card renders, but no text is ever streamed.
    await helper.writeToolInputStart({ toolCallId: 't1', toolName: 'search' });
    await helper.writeToolOutputAvailable({ toolCallId: 't1', output: { ok: true } });

    span.end();
    const [finished] = harness.finishedSpans();
    expect(typeof finished.attributes[PART]).toBe('number');
    expect(finished.attributes[TEXT]).toBeUndefined();
  });

  it('a rendered data component records visible-part', async () => {
    const span = harness.startSpan();
    const recorder = new TtftRecorder(performance.now() - 10, span);
    const helper = createSSEStreamHelper(fakeSSEStream(), 'req', 0, recorder);

    await helper.writeData('data-component', { name: 'Card' });

    span.end();
    const [finished] = harness.finishedSpans();
    expect(typeof finished.attributes[PART]).toBe('number');
    expect(finished.attributes[TEXT]).toBeUndefined();
  });
});

describe('VercelDataStreamHelper TTFT latches', () => {
  let harness: ReturnType<typeof createSpanHarness>;

  beforeEach(() => {
    harness = createSpanHarness();
  });

  afterEach(async () => {
    await harness.shutdown();
  });

  it('streamText records BOTH visible-token and visible-part', async () => {
    const span = harness.startSpan();
    const recorder = new TtftRecorder(performance.now() - 10, span);
    const helper = createVercelStreamHelper(fakeVercelWriter(), recorder);

    try {
      await helper.streamText('hello world', 0);

      span.end();
      const [finished] = harness.finishedSpans();
      expect(typeof finished.attributes[TEXT]).toBe('number');
      expect(typeof finished.attributes[PART]).toBe('number');
    } finally {
      helper.cleanup();
    }
  });

  it('no-text turn: a tool card records visible-part but NOT visible-token (D10/D11)', async () => {
    const span = harness.startSpan();
    const recorder = new TtftRecorder(performance.now() - 10, span);
    const helper = createVercelStreamHelper(fakeVercelWriter(), recorder);

    try {
      await helper.writeToolInputStart({ toolCallId: 't1', toolName: 'search' });
      await helper.writeToolOutputAvailable({ toolCallId: 't1', output: { ok: true } });

      span.end();
      const [finished] = harness.finishedSpans();
      expect(typeof finished.attributes[PART]).toBe('number');
      expect(finished.attributes[TEXT]).toBeUndefined();
    } finally {
      helper.cleanup();
    }
  });
});
