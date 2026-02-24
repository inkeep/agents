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

const otlpEndpointConfigured = !!env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
let otlpReachable = otlpEndpointConfigured;

/**
 * Creates a safe batch processor that falls back to no-op when SigNoz is not configured
 */
function createSafeBatchProcessor(): SpanProcessor {
  if (!otlpEndpointConfigured) {
    logger.info({}, 'No OTLP exporter endpoint configured — using no-op span processor');
    return new NoopSpanProcessor();
  }

  try {
    const exporter = new OTLPTraceExporter();
    return new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: env.OTEL_BSP_SCHEDULE_DELAY,
      maxExportBatchSize: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to create batch processor, falling back to no-op');
    return new NoopSpanProcessor();
  }
}

export async function validateOtlpEndpoint(): Promise<void> {
  if (!otlpEndpointConfigured) return;

  const endpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT as string;
  const status = await fetch(endpoint, {
    method: 'HEAD',
    signal: AbortSignal.timeout(3_000),
  })
    .then((res) => res.status < 500)
    .catch(() => false);

  otlpReachable = status;
  logger.info({ endpoint, otlpReachable }, 'OTLP endpoint validation complete');
}

export const defaultBatchProcessor = createSafeBatchProcessor();

export const defaultResource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'inkeep-agents-run-api',
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

export const defaultSpanProcessors: SpanProcessor[] = [
  new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
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

export async function flushBatchProcessor(): Promise<void> {
  if (!otlpReachable) return;

  try {
    await defaultBatchProcessor.forceFlush();
  } catch (error) {
    logger.warn({ error }, 'Failed to flush batch processor');
  }
}
