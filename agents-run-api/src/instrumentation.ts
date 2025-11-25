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

const otelConfig = {
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  OTEL_EXPORTER_OTLP_TRACES_HEADERS: process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ? '[REDACTED]' : undefined,
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS ? '[REDACTED]' : undefined,
  OTEL_BSP_SCHEDULE_DELAY: env.OTEL_BSP_SCHEDULE_DELAY,
  OTEL_BSP_MAX_EXPORT_BATCH_SIZE: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
  NODE_ENV: env.NODE_ENV,
  ENVIRONMENT: env.ENVIRONMENT,
};

process.stdout.write(`[OTEL DEBUG MODULE INIT] Initializing OpenTelemetry with configuration: ${JSON.stringify(otelConfig, null, 2)}\n`);
console.log('[OTEL DEBUG] Initializing OpenTelemetry with configuration:', JSON.stringify(otelConfig, null, 2));
logger.info(otelConfig, 'Initializing OpenTelemetry with configuration');

const baseExporter = new OTLPTraceExporter();
process.stdout.write('[OTEL DEBUG EXPORTER] OTLPTraceExporter base instance created\n');
console.log('[OTEL DEBUG] OTLPTraceExporter created successfully');
logger.info({}, 'OTLPTraceExporter created');

class DebugOTLPExporter {
  private exportCount = 0;

  export(spans: any, resultCallback: any) {
    this.exportCount++;
    const spanCount = spans.length;
    const timestamp = new Date().toISOString();
    
    process.stdout.write(`[OTEL DEBUG EXPORT #${this.exportCount}] Exporting ${spanCount} span(s) to Signoz at ${timestamp}\n`);
    console.log(`[OTEL DEBUG EXPORT #${this.exportCount}] Exporting ${spanCount} span(s) to Signoz`);
    
    // Log first span details
    if (spans.length > 0) {
      const firstSpan = spans[0];
      console.log(`[OTEL DEBUG EXPORT] First span name: ${firstSpan.name}, traceId: ${firstSpan.spanContext?.().traceId}`);
    }
    
    logger.info({ spanCount, exportNumber: this.exportCount }, 'Exporting spans to Signoz');
    
    baseExporter.export(spans, (result: any) => {
      if (result.code === 0) {
        process.stdout.write(`[OTEL DEBUG EXPORT #${this.exportCount}] ✅ Successfully exported ${spanCount} span(s) to Signoz\n`);
        console.log(`[OTEL DEBUG EXPORT #${this.exportCount}] Successfully exported ${spanCount} span(s) to Signoz`);
        logger.info({ spanCount, exportNumber: this.exportCount }, 'Successfully exported spans to Signoz');
      } else {
        process.stderr.write(`[OTEL DEBUG EXPORT #${this.exportCount}] ❌ Failed to export spans: ${JSON.stringify(result)}\n`);
        console.error(`[OTEL DEBUG EXPORT #${this.exportCount}] Failed to export spans:`, result);
        logger.error({ result, spanCount, exportNumber: this.exportCount }, 'Failed to export spans to Signoz');
      }
      resultCallback(result);
    });
  }

  shutdown() {
    process.stdout.write('[OTEL DEBUG EXPORT] Shutting down OTLPTraceExporter\n');
    console.log('[OTEL DEBUG] Shutting down OTLPTraceExporter');
    logger.info({}, 'Shutting down OTLPTraceExporter');
    return baseExporter.shutdown();
  }

  forceFlush() {
    process.stdout.write('[OTEL DEBUG EXPORT] Force flushing OTLPTraceExporter\n');
    console.log('[OTEL DEBUG] Force flushing OTLPTraceExporter');
    logger.info({}, 'Force flushing OTLPTraceExporter');
    return baseExporter.forceFlush();
  }
}

const otlpExporter = new DebugOTLPExporter();
process.stdout.write('[OTEL DEBUG EXPORTER] DebugOTLPExporter wrapper created\n');
console.log('[OTEL DEBUG EXPORTER] DebugOTLPExporter wrapper created');
/**
 * Creates a safe batch processor that falls back to no-op when SignOz is not configured
 */
function createSafeBatchProcessor(): SpanProcessor {
  try {
    const processorConfig = {
      scheduledDelayMillis: env.OTEL_BSP_SCHEDULE_DELAY,
      maxExportBatchSize: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE,
    };
    
    process.stdout.write(`[OTEL DEBUG PROCESSOR] Creating BatchSpanProcessor with config: ${JSON.stringify(processorConfig)}\n`);
    console.log('[OTEL DEBUG] Creating BatchSpanProcessor with config:', JSON.stringify(processorConfig, null, 2));
    logger.info(processorConfig, 'Creating BatchSpanProcessor');
    
    const processor = new BatchSpanProcessor(otlpExporter, processorConfig);
    
    // Wrap the processor to intercept onStart and onEnd calls
    const originalOnStart = processor.onStart.bind(processor);
    const originalOnEnd = processor.onEnd.bind(processor);
    const originalForceFlush = processor.forceFlush.bind(processor);
    
    processor.onStart = (span: any, context: any) => {
      process.stdout.write(`[OTEL DEBUG PROCESSOR] onStart called for span: ${span.name}\n`);
      console.log(`[OTEL DEBUG PROCESSOR] onStart called for span: ${span.name}`);
      return originalOnStart(span, context);
    };
    
    processor.onEnd = (span: any) => {
      process.stdout.write(`[OTEL DEBUG PROCESSOR] onEnd called for span: ${span.name}, ended: ${span.ended}\n`);
      console.log(`[OTEL DEBUG PROCESSOR] onEnd called for span: ${span.name}, ended: ${span.ended}`);
      return originalOnEnd(span);
    };
    
    processor.forceFlush = async () => {
      process.stdout.write('[OTEL DEBUG PROCESSOR] forceFlush called on processor\n');
      console.log('[OTEL DEBUG PROCESSOR] forceFlush called on processor');
      const result = await originalForceFlush();
      process.stdout.write('[OTEL DEBUG PROCESSOR] forceFlush completed\n');
      console.log('[OTEL DEBUG PROCESSOR] forceFlush completed');
      return result;
    };
    
    process.stdout.write('[OTEL DEBUG PROCESSOR] BatchSpanProcessor created successfully\n');
    console.log('[OTEL DEBUG] BatchSpanProcessor created successfully');
    logger.info({}, 'BatchSpanProcessor created successfully');
    return processor;
  } catch (error) {
    process.stderr.write(`[OTEL DEBUG PROCESSOR] Failed to create batch processor: ${error}\n`);
    console.error('[OTEL DEBUG] Failed to create batch processor - falling back to NoopSpanProcessor:', error);
    logger.error({ error }, 'Failed to create batch processor - falling back to NoopSpanProcessor');
    return new NoopSpanProcessor();
  }
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

console.log('[OTEL DEBUG] Creating NodeSDK with configuration:', {
  serviceName: 'inkeep-agents-run-api',
  hasContextManager: !!defaultContextManager,
  hasPropagator: !!defaultTextMapPropagator,
  spanProcessorCount: defaultSpanProcessors.length,
  instrumentationCount: defaultInstrumentations.length,
});

export const defaultSDK = new NodeSDK({
  resource: defaultResource,
  contextManager: defaultContextManager,
  textMapPropagator: defaultTextMapPropagator,
  spanProcessors: defaultSpanProcessors,
  instrumentations: defaultInstrumentations,
});

console.log('[OTEL DEBUG] NodeSDK instance created successfully');
logger.info({}, 'NodeSDK instance created successfully');

process.on('SIGTERM', async () => {
  console.log('[OTEL DEBUG] SIGTERM received, shutting down SDK and flushing traces...');
  try {
    await defaultSDK.shutdown();
    console.log('[OTEL DEBUG] SDK shutdown completed');
  } catch (error) {
    console.error('[OTEL DEBUG] Error during SDK shutdown:', error);
  }
});

process.on('beforeExit', async () => {
  console.log('[OTEL DEBUG] Process beforeExit, flushing traces...');
  try {
    await flushBatchProcessor();
    console.log('[OTEL DEBUG] Traces flushed on beforeExit');
  } catch (error) {
    console.error('[OTEL DEBUG] Error flushing traces on beforeExit:', error);
  }
});

export async function flushBatchProcessor(): Promise<void> {
  try {
    process.stdout.write('[OTEL DEBUG FLUSH] Flushing batch processor...\n');
    console.log('[OTEL DEBUG] Flushing batch processor...');
    logger.info({}, 'Flushing batch processor');
    await defaultBatchProcessor.forceFlush();
    process.stdout.write('[OTEL DEBUG FLUSH] Batch processor flushed successfully\n');
    console.log('[OTEL DEBUG] Batch processor flushed successfully');
    logger.info({}, 'Batch processor flushed successfully');
  } catch (error) {
    process.stderr.write(`[OTEL DEBUG FLUSH] Failed to flush batch processor: ${error}\n`);
    console.error('[OTEL DEBUG] Failed to flush batch processor:', error);
    logger.warn({ error }, 'Failed to flush batch processor');
  }
}
