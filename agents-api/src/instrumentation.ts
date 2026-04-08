import type { Context } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  ALLOW_ALL_BAGGAGE_KEYS,
  BaggageSpanProcessor,
} from '@opentelemetry/baggage-span-processor';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  NoopSpanProcessor,
  type ReadableSpan,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { env } from './env';
import { getLogger } from './logger';

const otlpExporter = new OTLPTraceExporter();
const logger = getLogger('instrumentation');
/**
 * Creates a safe batch processor that falls back to no-op when SignOz is not configured
 */
function createSafeBatchProcessor(): SpanProcessor {
  try {
    return new BatchSpanProcessor(otlpExporter, {
      scheduledDelayMillis: env.OTEL_BSP_SCHEDULE_DELAY,
      maxExportBatchSize: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to create batch processor');
    return new NoopSpanProcessor();
  }
}

export const defaultBatchProcessor = createSafeBatchProcessor();

export const defaultResource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'inkeep-agents-api',
});

export const defaultInstrumentations: NonNullable<NodeSDKConfiguration['instrumentations']> = [
  getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-http': {
      enabled: true,
      requestHook: (span, request: any) => {
        const url: string | undefined = request?.url ?? request?.path;
        if (!url) return;
        const u = new URL(url, 'http://localhost');
        span.updateName(`${request?.method || 'UNKNOWN'} ${u.pathname}`);
      },
    },
    '@opentelemetry/instrumentation-undici': {
      requestHook: (span: any) => {
        const method = span.attributes?.['http.request.method'];
        const host = span.attributes?.['server.address'];
        const path = span.attributes?.['url.path'];
        if (method && path)
          span.updateName(host ? `${method} ${host}${path}` : `${method} ${path}`);
      },
    },
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-dns': { enabled: false },
    '@opentelemetry/instrumentation-net': { enabled: false },
  }),
];

/**
 * Strips _structureHints and _toolCallId from ai.toolCall.result span attributes
 * so they don't bloat traces. These fields are internal LLM context, not useful for observability.
 */
class ToolResultSanitizer implements SpanProcessor {
  onStart(_span: ReadableSpan, _parentContext: Context): void {}

  onEnd(span: ReadableSpan): void {
    const result = span.attributes['ai.toolCall.result'];
    if (typeof result !== 'string') return;
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        let changed = false;
        for (const key of Object.keys(parsed)) {
          if (key.startsWith('_')) {
            delete parsed[key];
            changed = true;
          }
        }
        if (changed) {
          (span as any).attributes['ai.toolCall.result'] = JSON.stringify(parsed);
        }
      }
    } catch {
      // Expected for non-JSON tool results — leave span unchanged
    }
  }

  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

export const defaultSpanProcessors: SpanProcessor[] = [
  new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
  new ToolResultSanitizer(),
  defaultBatchProcessor,
];

export const defaultContextManager = new AsyncLocalStorageContextManager();

export const defaultTextMapPropagator = new CompositePropagator({
  propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
});

export const defaultSDK = new NodeSDK({
  resource: defaultResource,
  contextManager: defaultContextManager,
  textMapPropagator: defaultTextMapPropagator,
  spanProcessors: defaultSpanProcessors,
  instrumentations: defaultInstrumentations,
});

export function startOpenTelemetrySDK(): void {
  try {
    defaultSDK.start();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const allowDuplicateStartErrors =
      env.ENVIRONMENT === 'development' || env.NODE_ENV === 'development';
    if (
      allowDuplicateStartErrors &&
      ((msg.includes('MetricReader') && msg.includes('can not be bound')) ||
        msg.includes('Attempted duplicate registration of API'))
    ) {
      logger.debug({}, 'OpenTelemetry SDK already started');
      return;
    }
    throw error;
  }
}

export async function flushBatchProcessor(): Promise<void> {
  try {
    await defaultBatchProcessor.forceFlush();
  } catch (error) {
    logger.warn({ error }, 'Failed to flush batch processor');
  }
}
