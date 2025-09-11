import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  ALLOW_ALL_BAGGAGE_KEYS,
  BaggageSpanProcessor,
} from '@opentelemetry/baggage-span-processor';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';

const otlpUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:14318/v1/traces';
const otlpExporter = new OTLPTraceExporter({ url: otlpUrl });

// Minimal fan-out so NodeSDK can accept ONE spanProcessor
class FanOutSpanProcessor {
  constructor(private inner: any[]) {}
  onStart(span: any, parent: any) {
    this.inner.forEach((p) => p.onStart(span, parent));
  }
  onEnd(span: any) {
    this.inner.forEach((p) => p.onEnd(span));
  }
  forceFlush() {
    return Promise.all(this.inner.map((p) => p.forceFlush?.())).then(() => {});
  }
  shutdown() {
    return Promise.all(this.inner.map((p) => p.shutdown?.())).then(() => {});
  }
}

const spanProcessor = new FanOutSpanProcessor([
  new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS),
  new BatchSpanProcessor(otlpExporter, {
    maxExportBatchSize: 1,
  }),

]);


export const sdk = new NodeSDK({
  serviceName: 'inkeep-agents-run-api',
  spanProcessor,
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

// Export the span processor for force flush access
export { spanProcessor };

// SDK starts automatically when imported
sdk.start();
