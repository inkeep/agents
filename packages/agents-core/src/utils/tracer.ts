import {
  type Span,
  type SpanOptions,
  SpanStatusCode,
  type Tracer,
  type TracerProvider,
  trace,
} from '@opentelemetry/api';
import { env } from '../env';
import { getLogger } from './logger';
import pkg from "../../package.json" assert { type: "json" };


const logger = getLogger('tracer');

// Service name and version constants for consistent tracer identification
export const SERVICE_VERSION = pkg.version;


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
    _name: string,
    arg1?: SpanOptions | ((span: Span) => T),
    arg2?: ((span: Span) => T) | undefined,
    arg3?: ((span: Span) => T) | undefined
  ): T {
    const fn = typeof arg1 === 'function' ? arg1 : typeof arg2 === 'function' ? arg2 : arg3;
    if (!fn) throw new Error('No callback function provided');
    return fn(createNoOpSpan());
  },
  startSpan(_name: string, _options?: SpanOptions): Span {
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
export function getTracer(serviceName: string): Tracer {
    try {
      globalTracerInstance = trace.getTracer(serviceName, SERVICE_VERSION);
    } catch (_error) {
      logger.debug({}, 'OpenTelemetry tracer not available, using no-op tracer');
      globalTracerInstance = noopTracer;
    }
    return globalTracerInstance;
}