import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  ALLOW_ALL_BAGGAGE_KEYS,
  BaggageSpanProcessor,
} from '@opentelemetry/baggage-span-processor';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { env } from './env';

const maxExportBatchSize =
  env.OTEL_MAX_EXPORT_BATCH_SIZE ?? (env.ENVIRONMENT === 'development' ? 1 : 512);

const otlpExporter = new OTLPTraceExporter();

const batchProcessor = new BatchSpanProcessor(otlpExporter, {
  maxExportBatchSize,
});

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'inkeep-agents-run-api',
});

const sdk = new NodeSDK({
  resource: resource,
  spanProcessors: [new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS), batchProcessor],
  instrumentations: [
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
    }),
  ],
});

sdk.start();

export { batchProcessor };
