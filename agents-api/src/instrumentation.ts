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
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { env } from './env';
import { getLogger } from './logger';

const logger = getLogger('instrumentation');

const OTEL_EXPORTER_KEY = Symbol.for('@inkeep/agents-api.otlpExporter');
const OTEL_BATCH_PROCESSOR_KEY = Symbol.for('@inkeep/agents-api.batchProcessor');
const OTEL_RESOURCE_KEY = Symbol.for('@inkeep/agents-api.resource');
const OTEL_INSTRUMENTATIONS_KEY = Symbol.for('@inkeep/agents-api.instrumentations');
const OTEL_SPAN_PROCESSORS_KEY = Symbol.for('@inkeep/agents-api.spanProcessors');
const OTEL_CONTEXT_MANAGER_KEY = Symbol.for('@inkeep/agents-api.contextManager');
const OTEL_PROPAGATOR_KEY = Symbol.for('@inkeep/agents-api.propagator');
const OTEL_SDK_KEY = Symbol.for('@inkeep/agents-api.otelSDK');
const OTEL_STARTED_KEY = Symbol.for('@inkeep/agents-api.otelStarted');

type OtelGlobal = {
  [OTEL_EXPORTER_KEY]?: OTLPTraceExporter;
  [OTEL_BATCH_PROCESSOR_KEY]?: SpanProcessor;
  [OTEL_RESOURCE_KEY]?: ReturnType<typeof resourceFromAttributes>;
  [OTEL_INSTRUMENTATIONS_KEY]?: NonNullable<NodeSDKConfiguration['instrumentations']>;
  [OTEL_SPAN_PROCESSORS_KEY]?: SpanProcessor[];
  [OTEL_CONTEXT_MANAGER_KEY]?: AsyncLocalStorageContextManager;
  [OTEL_PROPAGATOR_KEY]?: CompositePropagator;
  [OTEL_SDK_KEY]?: NodeSDK;
  [OTEL_STARTED_KEY]?: boolean;
};

function getGlobal(): OtelGlobal {
  return globalThis as unknown as OtelGlobal;
}

function getOrCreateExporter(): OTLPTraceExporter {
  const g = getGlobal();
  if (!g[OTEL_EXPORTER_KEY]) {
    g[OTEL_EXPORTER_KEY] = new OTLPTraceExporter();
  }
  return g[OTEL_EXPORTER_KEY];
}

/**
 * Creates a safe batch processor that falls back to no-op when SignOz is not configured
 */
function getOrCreateBatchProcessor(): SpanProcessor {
  const g = getGlobal();
  if (!g[OTEL_BATCH_PROCESSOR_KEY]) {
    try {
      g[OTEL_BATCH_PROCESSOR_KEY] = new BatchSpanProcessor(getOrCreateExporter(), {
        scheduledDelayMillis: env.OTEL_BSP_SCHEDULE_DELAY,
        maxExportBatchSize: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to create batch processor');
      g[OTEL_BATCH_PROCESSOR_KEY] = new NoopSpanProcessor();
    }
  }
  return g[OTEL_BATCH_PROCESSOR_KEY];
}

function getOrCreateResource() {
  const g = getGlobal();
  if (!g[OTEL_RESOURCE_KEY]) {
    g[OTEL_RESOURCE_KEY] = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'inkeep-agents-api',
    });
  }
  return g[OTEL_RESOURCE_KEY];
}

function getOrCreateInstrumentations(): NonNullable<NodeSDKConfiguration['instrumentations']> {
  const g = getGlobal();
  if (!g[OTEL_INSTRUMENTATIONS_KEY]) {
    g[OTEL_INSTRUMENTATIONS_KEY] = [
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
  }
  return g[OTEL_INSTRUMENTATIONS_KEY];
}

function getOrCreateSpanProcessors(): SpanProcessor[] {
  const g = getGlobal();
  if (!g[OTEL_SPAN_PROCESSORS_KEY]) {
    g[OTEL_SPAN_PROCESSORS_KEY] = [
      new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
      getOrCreateBatchProcessor(),
    ];
  }
  return g[OTEL_SPAN_PROCESSORS_KEY];
}

function getOrCreateContextManager(): AsyncLocalStorageContextManager {
  const g = getGlobal();
  if (!g[OTEL_CONTEXT_MANAGER_KEY]) {
    g[OTEL_CONTEXT_MANAGER_KEY] = new AsyncLocalStorageContextManager();
  }
  return g[OTEL_CONTEXT_MANAGER_KEY];
}

function getOrCreatePropagator(): CompositePropagator {
  const g = getGlobal();
  if (!g[OTEL_PROPAGATOR_KEY]) {
    g[OTEL_PROPAGATOR_KEY] = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    });
  }
  return g[OTEL_PROPAGATOR_KEY];
}

export const defaultBatchProcessor = getOrCreateBatchProcessor();
export const defaultResource = getOrCreateResource();
export const defaultInstrumentations = getOrCreateInstrumentations();
export const defaultSpanProcessors = getOrCreateSpanProcessors();
export const defaultContextManager = getOrCreateContextManager();
export const defaultTextMapPropagator = getOrCreatePropagator();

function getOrCreateSDK(): NodeSDK {
  const g = getGlobal();
  if (!g[OTEL_SDK_KEY]) {
    g[OTEL_SDK_KEY] = new NodeSDK({
      resource: defaultResource,
      contextManager: defaultContextManager,
      textMapPropagator: defaultTextMapPropagator,
      spanProcessors: defaultSpanProcessors,
      instrumentations: defaultInstrumentations,
    });
  }
  return g[OTEL_SDK_KEY];
}

const defaultSDK = getOrCreateSDK();

export function startOpenTelemetrySDK(): void {
  const g = getGlobal();
  if (g[OTEL_STARTED_KEY]) {
    return;
  }
  try {
    defaultSDK.start();
    g[OTEL_STARTED_KEY] = true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('MetricReader') && msg.includes('can not be bound')) {
      logger.debug('OpenTelemetry SDK already started (MetricReader binding detected)');
      g[OTEL_STARTED_KEY] = true;
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
