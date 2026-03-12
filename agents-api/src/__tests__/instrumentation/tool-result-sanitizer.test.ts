vi.mock('@opentelemetry/auto-instrumentations-node', () => ({ getNodeAutoInstrumentations: () => [] }));
vi.mock('@opentelemetry/baggage-span-processor', () => ({
  BaggageSpanProcessor: class {
    onStart() {}
    onEnd() {}
    shutdown() { return Promise.resolve(); }
    forceFlush() { return Promise.resolve(); }
  },
  ALLOW_ALL_BAGGAGE_KEYS: '*',
}));
vi.mock('@opentelemetry/sdk-node', () => ({ NodeSDK: class { start() {} stop() { return Promise.resolve(); } } }));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: class {} }));
vi.mock('@opentelemetry/resources', () => ({ resourceFromAttributes: () => ({}) }));
vi.mock('@opentelemetry/context-async-hooks', () => ({ AsyncLocalStorageContextManager: class {} }));
vi.mock('@opentelemetry/core', () => ({
  CompositePropagator: class {},
  W3CBaggagePropagator: class {},
  W3CTraceContextPropagator: class {},
}));
vi.mock('@opentelemetry/semantic-conventions', () => ({ ATTR_SERVICE_NAME: 'service.name' }));
vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: class { forceFlush() { return Promise.resolve(); } },
  NoopSpanProcessor: class {
    onStart() {}
    onEnd() {}
    shutdown() { return Promise.resolve(); }
    forceFlush() { return Promise.resolve(); }
  },
}));
vi.mock('../../env.js', () => ({
  env: { OTEL_BSP_SCHEDULE_DELAY: 5000, OTEL_BSP_MAX_EXPORT_BATCH_SIZE: 512 },
}));
vi.mock('../../logger', () => ({ getLogger: () => ({ warn: vi.fn(), info: vi.fn() }) }));

import { describe, expect, it, vi } from 'vitest';
import { defaultSpanProcessors } from '../../instrumentation';

function makeSpan(result?: string): any {
  return { attributes: result !== undefined ? { 'ai.toolCall.result': result } : {} };
}

const sanitizer = defaultSpanProcessors[1];

describe('ToolResultSanitizingProcessor', () => {
  it('does nothing when ai.toolCall.result attribute is absent', () => {
    const span = makeSpan();
    sanitizer.onEnd(span);
    expect(span.attributes).toEqual({});
  });

  it('does nothing when ai.toolCall.result is not valid JSON', () => {
    const span = makeSpan('not valid json {{');
    sanitizer.onEnd(span);
    expect(span.attributes['ai.toolCall.result']).toBe('not valid json {{');
  });

  it('strips _structureHints from ai.toolCall.result JSON', () => {
    const input = JSON.stringify({ _structureHints: { hint: 'x' }, answer: 42 });
    const span = makeSpan(input);
    sanitizer.onEnd(span);
    const parsed = JSON.parse(span.attributes['ai.toolCall.result']);
    expect(parsed).not.toHaveProperty('_structureHints');
    expect(parsed.answer).toBe(42);
  });

  it('strips _toolCallId from ai.toolCall.result JSON', () => {
    const input = JSON.stringify({ _toolCallId: 'call-123', answer: 42 });
    const span = makeSpan(input);
    sanitizer.onEnd(span);
    const parsed = JSON.parse(span.attributes['ai.toolCall.result']);
    expect(parsed).not.toHaveProperty('_toolCallId');
    expect(parsed.answer).toBe(42);
  });

  it('strips both _structureHints and _toolCallId and keeps other fields', () => {
    const input = JSON.stringify({
      _structureHints: { hint: 'x' },
      _toolCallId: 'call-abc',
      name: 'result-value',
      count: 7,
    });
    const span = makeSpan(input);
    sanitizer.onEnd(span);
    const parsed = JSON.parse(span.attributes['ai.toolCall.result']);
    expect(parsed).toEqual({ name: 'result-value', count: 7 });
  });

  it('does not modify non-string ai.toolCall.result values', () => {
    const span = { attributes: { 'ai.toolCall.result': 12345 } };
    sanitizer.onEnd(span as any);
    expect(span.attributes['ai.toolCall.result']).toBe(12345);
  });
});
