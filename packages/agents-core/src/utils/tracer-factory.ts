import {
  type Span,
  type SpanOptions,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { getLogger } from '.';

const logger = getLogger('tracer');

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

/**
 * Helper function to handle span errors consistently
 * Records the exception, sets error status, and optionally logs
 */
export function setSpanWithError(
  span: Span,
  error: unknown,
  logger?: { error: (obj: any, msg?: string) => void },
  logMessage?: string
): void {
  // Extract error message, handling nested error structures from AI SDK
  let errorMessage = 'Unknown error';
  
  if (error && typeof error === 'object' && 'error' in error) {
    // Handle AI SDK streaming errors with nested error.error.message structure
    const nestedError = (error as any).error;
    if (nestedError && typeof nestedError === 'object' && nestedError.message) {
      errorMessage = nestedError.message;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

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
 * Get a tracer instance for the specified service
 * Returns a no-op tracer if OpenTelemetry is not available
 */
export function getTracer(serviceName: string, serviceVersion?: string): Tracer {
  try {
    return trace.getTracer(serviceName, serviceVersion);
  } catch (_error) {
    logger.debug({}, 'OpenTelemetry tracer not available, using no-op tracer');
    return noopTracer;
  }
}
