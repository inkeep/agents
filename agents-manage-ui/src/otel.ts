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

const otlpExporter = new OTLPTraceExporter();

function createSafeBatchProcessor(): SpanProcessor {
  try {
    return new BatchSpanProcessor(otlpExporter, {
      scheduledDelayMillis: Number(process.env.OTEL_BSP_SCHEDULE_DELAY) || 500,
      maxExportBatchSize: Number(process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE) || 64,
    });
  } catch (error) {
    console.warn('[otel] Failed to create batch processor', error);
    return new NoopSpanProcessor();
  }
}

const defaultBatchProcessor = createSafeBatchProcessor();

const defaultResource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'inkeep-agents-manage-ui',
});

const defaultInstrumentations: NonNullable<NodeSDKConfiguration['instrumentations']> = [
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

const defaultSpanProcessors: SpanProcessor[] = [
  new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
  defaultBatchProcessor,
];

const defaultContextManager = new AsyncLocalStorageContextManager();

const defaultTextMapPropagator = new CompositePropagator({
  propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
});

export const sdk = new NodeSDK({
  resource: defaultResource,
  contextManager: defaultContextManager,
  textMapPropagator: defaultTextMapPropagator,
  spanProcessors: defaultSpanProcessors,
  instrumentations: defaultInstrumentations,
});

sdk.start();
