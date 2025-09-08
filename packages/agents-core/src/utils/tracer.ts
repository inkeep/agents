import {
  type Span,
  type SpanOptions,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { getLogger } from './logger.js';
import { env } from '../env.js';

const logger = getLogger('tracer');

// Environments where trace force flush should be enabled
const FORCE_FLUSH_ENVIRONMENTS: readonly string[] = ['development'];

// Base prefix for all span names - export this to use in other files
export const BASE = 'inkeep-chat';

// Service name and version constants for consistent tracer identification
export const SERVICE_NAME = 'inkeep-chat';
export const SERVICE_VERSION = '1.0.0';

// Helper function to create prefixed span names
export const createSpanName = (suffix: string) => `${BASE}.${suffix}`;

// No-op span implementation for when OpenTelemetry is not available
const createNoOpSpan = (): Span => ({
  setAttributes: () => ({}) as Span,
  recordException: () => ({}) as Span,
  setStatus: () => ({}) as Span,
  addEvent: () => ({}) as Span,
  end: () => {},
  isRecording: () => false,
  setAttribute: () => ({}) as Span,
  updateName: () => ({}) as Span,
  spanContext: () => ({
    traceId: '00000000000000000000000000000000',
    spanId: '0000000000000000',
    traceFlags: 0,
  }),
  addLink: () => ({}) as Span,
  addLinks: () => ({}) as Span,
});

// No-op tracer implementation for when OpenTelemetry is not available
const noopTracer = {
  startActiveSpan<T>(
    name: string,
    arg1?: SpanOptions | ((span: Span) => T),
    arg2?: ((span: Span) => T) | undefined,
    arg3?: ((span: Span) => T) | undefined
  ): T {
    const fn = typeof arg1 === 'function' ? arg1 : typeof arg2 === 'function' ? arg2 : arg3;
    if (!fn) throw new Error('No callback function provided');
    return fn(createNoOpSpan());
  },
  startSpan(name: string, options?: SpanOptions): Span {
    return createNoOpSpan();
  },
} as Tracer;

// Global tracer instance - singleton pattern
let globalTracerInstance: Tracer | null = null;

/**
 * Helper function to handle span errors consistently
 * Records the exception, sets error status, and optionally logs
 */
export function handleSpanError(
  span: Span,
  error: unknown,
  logger?: { error: (obj: any, msg?: string) => void },
  logMessage?: string
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Record the exception in the span
  span.recordException(error as Error);

  // Set error status
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: errorMessage,
  });

  // Optionally log the error
  if (logger && logMessage) {
    logger.error({ error: errorMessage }, logMessage);
  }
}

/**
 * Get the global tracer instance
 * This creates a single tracer for the entire application
 */
export function getGlobalTracer(): Tracer {
  if (!globalTracerInstance) {
    try {
      globalTracerInstance = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'OpenTelemetry tracer not available, using no-op tracer'
      );
      globalTracerInstance = noopTracer;
    }
  }
  return globalTracerInstance;
}

/**
 * Force flush the tracer provider to ensure critical spans are sent immediately
 * This is useful for critical operations where we want to ensure telemetry data
 * is sent before the operation completes or fails
 */
export async function forceFlushTracer(): Promise<void> {
  const isOtelTracesForceFlushEnabled = env.OTEL_TRACES_FORCE_FLUSH_ENABLED;
  const isForceFlushEnvironment = env.ENVIRONMENT && FORCE_FLUSH_ENVIRONMENTS.includes(env.ENVIRONMENT);

  const shouldForceFlush =
    isOtelTracesForceFlushEnabled === true || (isOtelTracesForceFlushEnabled == null && isForceFlushEnvironment);

  if (!shouldForceFlush) {
    return;
  }
  try {
    // Get the tracer provider and force flush if available
    const tracerProvider = trace.getTracerProvider();
    if (tracerProvider && 'forceFlush' in tracerProvider && typeof tracerProvider.forceFlush === 'function') {
      await (tracerProvider as any).forceFlush();
      logger.debug({ message: 'Tracer provider force flush completed' }, 'Tracer provider force flush completed');
    } else {
      logger.debug({ message: 'Tracer provider does not support force flush or is not available' }, 'Tracer provider does not support force flush or is not available');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to force flush tracer');
  }
}
