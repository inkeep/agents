/**
 * TelemetryProvider - Abstraction for Telemetry/Observability
 *
 * This module provides a clean abstraction over telemetry implementations.
 * Cloud customers can use this without needing to install or configure
 * OpenTelemetry or Signoz directly.
 *
 * Telemetry is OPT-IN - if not configured, a no-op provider is used.
 *
 * @example
 * ```typescript
 * // Opt-in to telemetry with default console logger
 * import { InkeepTelemetryProvider, createConsoleTelemetryProvider } from '@inkeep/agents-sdk'
 *
 * const telemetry = createConsoleTelemetryProvider()
 *
 * // Or with OpenTelemetry (requires @opentelemetry packages)
 * const telemetry = createOpenTelemetryProvider({
 *   serviceName: 'my-agent',
 *   endpoint: 'http://localhost:4318'
 * })
 * ```
 */

/**
 * Span status codes
 */
export const SpanStatus = {
  OK: 'ok',
  ERROR: 'error',
  UNSET: 'unset',
} as const;

export type SpanStatusType = (typeof SpanStatus)[keyof typeof SpanStatus];

/**
 * Span interface for tracing
 */
export interface TelemetrySpan {
  /** Set span attributes */
  setAttributes(attributes: Record<string, unknown>): TelemetrySpan;
  /** Set a single attribute */
  setAttribute(key: string, value: unknown): TelemetrySpan;
  /** Record an exception */
  recordException(error: Error): TelemetrySpan;
  /** Set span status */
  setStatus(status: SpanStatusType, message?: string): TelemetrySpan;
  /** Add an event to the span */
  addEvent(name: string, attributes?: Record<string, unknown>): TelemetrySpan;
  /** End the span */
  end(): void;
  /** Check if span is recording */
  isRecording(): boolean;
  /** Update span name */
  updateName(name: string): TelemetrySpan;
}

/**
 * Span options
 */
export interface SpanOptions {
  /** Span attributes */
  attributes?: Record<string, unknown>;
  /** Parent span (for context propagation) */
  parent?: TelemetrySpan;
}

/**
 * Tracer interface for creating spans
 */
export interface TelemetryTracer {
  /** Start a new active span and execute callback */
  startActiveSpan<T>(name: string, fn: (span: TelemetrySpan) => T): T;
  startActiveSpan<T>(name: string, options: SpanOptions, fn: (span: TelemetrySpan) => T): T;
  /** Start a new span without making it active */
  startSpan(name: string, options?: SpanOptions): TelemetrySpan;
}

/**
 * Logger interface for structured logging
 */
export interface TelemetryLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Metrics interface for recording measurements
 */
export interface TelemetryMetrics {
  /** Increment a counter */
  increment(name: string, value?: number, attributes?: Record<string, unknown>): void;
  /** Record a gauge value */
  gauge(name: string, value: number, attributes?: Record<string, unknown>): void;
  /** Record a histogram value */
  histogram(name: string, value: number, attributes?: Record<string, unknown>): void;
}

/**
 * Main telemetry provider interface
 */
export interface TelemetryProvider {
  /** Get a tracer for creating spans */
  getTracer(name: string, version?: string): TelemetryTracer;
  /** Get a logger for structured logging */
  getLogger(name: string): TelemetryLogger;
  /** Get metrics for recording measurements */
  getMetrics(name: string): TelemetryMetrics;
  /** Shutdown the telemetry provider */
  shutdown(): Promise<void>;
  /** Check if telemetry is enabled */
  isEnabled(): boolean;
}

/**
 * Configuration for telemetry provider
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled (default: false) */
  enabled?: boolean;
  /** Service name for identifying the source */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** Custom provider implementation */
  provider?: TelemetryProvider;
}

// ============================================================================
// No-op implementations (default when telemetry is disabled)
// ============================================================================

/**
 * No-op span implementation
 */
const createNoOpSpan = (): TelemetrySpan => ({
  setAttributes: function () {
    return this;
  },
  setAttribute: function () {
    return this;
  },
  recordException: function () {
    return this;
  },
  setStatus: function () {
    return this;
  },
  addEvent: function () {
    return this;
  },
  end: () => {},
  isRecording: () => false,
  updateName: function () {
    return this;
  },
});

/**
 * No-op tracer implementation
 */
const createNoOpTracer = (): TelemetryTracer => ({
  startActiveSpan<T>(
    _name: string,
    arg1: SpanOptions | ((span: TelemetrySpan) => T),
    arg2?: (span: TelemetrySpan) => T
  ): T {
    const fn = typeof arg1 === 'function' ? arg1 : arg2;
    if (!fn) throw new Error('No callback function provided');
    return fn(createNoOpSpan());
  },
  startSpan(_name: string, _options?: SpanOptions): TelemetrySpan {
    return createNoOpSpan();
  },
});

/**
 * No-op logger implementation
 */
const createNoOpLogger = (): TelemetryLogger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

/**
 * No-op metrics implementation
 */
const createNoOpMetrics = (): TelemetryMetrics => ({
  increment: () => {},
  gauge: () => {},
  histogram: () => {},
});

/**
 * No-op telemetry provider (default)
 */
export class NoOpTelemetryProvider implements TelemetryProvider {
  getTracer(_name: string, _version?: string): TelemetryTracer {
    return createNoOpTracer();
  }

  getLogger(_name: string): TelemetryLogger {
    return createNoOpLogger();
  }

  getMetrics(_name: string): TelemetryMetrics {
    return createNoOpMetrics();
  }

  async shutdown(): Promise<void> {
    // No-op
  }

  isEnabled(): boolean {
    return false;
  }
}

// ============================================================================
// Console telemetry provider (simple logging-based telemetry)
// ============================================================================

/**
 * Console-based telemetry provider for development/debugging
 */
export class ConsoleTelemetryProvider implements TelemetryProvider {
  private serviceName: string;

  constructor(serviceName = 'inkeep-agent') {
    this.serviceName = serviceName;
  }

  getTracer(name: string, _version?: string): TelemetryTracer {
    const serviceName = this.serviceName;

    const createConsoleSpan = (spanName: string): TelemetrySpan => {
      const startTime = Date.now();
      const attributes: Record<string, unknown> = {};
      const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];

      return {
        setAttributes: function (attrs: Record<string, unknown>) {
          Object.assign(attributes, attrs);
          return this;
        },
        setAttribute: function (key: string, value: unknown) {
          attributes[key] = value;
          return this;
        },
        recordException: function (error: Error) {
          console.error(`[${serviceName}:${name}] Exception in ${spanName}:`, error.message);
          return this;
        },
        setStatus: function (status: SpanStatusType, message?: string) {
          if (status === SpanStatus.ERROR) {
            console.error(`[${serviceName}:${name}] ${spanName} ERROR:`, message);
          }
          return this;
        },
        addEvent: function (eventName: string, eventAttrs?: Record<string, unknown>) {
          events.push({ name: eventName, attributes: eventAttrs });
          return this;
        },
        end: () => {
          const duration = Date.now() - startTime;
          console.log(`[${serviceName}:${name}] ${spanName} completed in ${duration}ms`, {
            attributes,
            events,
          });
        },
        isRecording: () => true,
        updateName: function (newName: string) {
          console.log(`[${serviceName}:${name}] Span renamed: ${spanName} -> ${newName}`);
          return this;
        },
      };
    };

    return {
      startActiveSpan<T>(
        spanName: string,
        arg1: SpanOptions | ((span: TelemetrySpan) => T),
        arg2?: (span: TelemetrySpan) => T
      ): T {
        const fn = typeof arg1 === 'function' ? arg1 : arg2;
        if (!fn) throw new Error('No callback function provided');
        const span = createConsoleSpan(spanName);
        try {
          return fn(span);
        } finally {
          span.end();
        }
      },
      startSpan(spanName: string, _options?: SpanOptions): TelemetrySpan {
        return createConsoleSpan(spanName);
      },
    };
  }

  getLogger(name: string): TelemetryLogger {
    const prefix = `[${this.serviceName}:${name}]`;
    return {
      debug: (message, context) => console.debug(prefix, message, context),
      info: (message, context) => console.info(prefix, message, context),
      warn: (message, context) => console.warn(prefix, message, context),
      error: (message, context) => console.error(prefix, message, context),
    };
  }

  getMetrics(name: string): TelemetryMetrics {
    const prefix = `[${this.serviceName}:${name}]`;
    return {
      increment: (metricName, value = 1, attributes) =>
        console.log(`${prefix} COUNTER ${metricName}: +${value}`, attributes),
      gauge: (metricName, value, attributes) =>
        console.log(`${prefix} GAUGE ${metricName}: ${value}`, attributes),
      histogram: (metricName, value, attributes) =>
        console.log(`${prefix} HISTOGRAM ${metricName}: ${value}`, attributes),
    };
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.serviceName}] Telemetry provider shutting down`);
  }

  isEnabled(): boolean {
    return true;
  }
}

// ============================================================================
// Global telemetry management
// ============================================================================

let globalProvider: TelemetryProvider = new NoOpTelemetryProvider();

/**
 * InkeepTelemetryProvider - Main telemetry management class
 *
 * Provides a unified interface for telemetry across the SDK.
 * Telemetry is OPT-IN - by default, a no-op provider is used.
 */
export class InkeepTelemetryProvider {
  private provider: TelemetryProvider;

  constructor(config: TelemetryConfig = {}) {
    if (config.provider) {
      this.provider = config.provider;
    } else if (config.enabled) {
      // Use console provider as default when enabled without custom provider
      this.provider = new ConsoleTelemetryProvider(config.serviceName);
    } else {
      this.provider = new NoOpTelemetryProvider();
    }
  }

  /**
   * Get a tracer for creating spans
   */
  getTracer(name: string, version?: string): TelemetryTracer {
    return this.provider.getTracer(name, version);
  }

  /**
   * Get a logger for structured logging
   */
  getLogger(name: string): TelemetryLogger {
    return this.provider.getLogger(name);
  }

  /**
   * Get metrics recorder
   */
  getMetrics(name: string): TelemetryMetrics {
    return this.provider.getMetrics(name);
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.provider.isEnabled();
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    return this.provider.shutdown();
  }

  /**
   * Get the underlying provider
   */
  getProvider(): TelemetryProvider {
    return this.provider;
  }

  /**
   * Set as the global telemetry provider
   */
  setAsGlobal(): void {
    globalProvider = this.provider;
  }
}

/**
 * Get the global telemetry provider
 */
export function getGlobalTelemetryProvider(): TelemetryProvider {
  return globalProvider;
}

/**
 * Set the global telemetry provider
 */
export function setGlobalTelemetryProvider(provider: TelemetryProvider): void {
  globalProvider = provider;
}

// ============================================================================
// Factory functions
// ============================================================================

/**
 * Create a no-op telemetry provider (default, does nothing)
 */
export function createNoOpTelemetryProvider(): InkeepTelemetryProvider {
  return new InkeepTelemetryProvider({ enabled: false });
}

/**
 * Create a console-based telemetry provider for development
 */
export function createConsoleTelemetryProvider(serviceName?: string): InkeepTelemetryProvider {
  return new InkeepTelemetryProvider({
    enabled: true,
    serviceName,
    provider: new ConsoleTelemetryProvider(serviceName),
  });
}

/**
 * Configuration for OpenTelemetry provider
 */
export interface OpenTelemetryConfig {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** OTLP endpoint URL */
  endpoint?: string;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
}

/**
 * Wrap an OpenTelemetry span in our TelemetrySpan interface
 */
function wrapOtelSpan(otelSpan: {
  setAttributes: (attributes: Record<string, unknown>) => void;
  setAttribute: (key: string, value: unknown) => void;
  recordException: (error: Error) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  addEvent: (name: string, attributes?: Record<string, unknown>) => void;
  end: () => void;
  isRecording: () => boolean;
  updateName: (name: string) => void;
}): TelemetrySpan {
  return {
    setAttributes: function (attributes: Record<string, unknown>) {
      otelSpan.setAttributes(attributes);
      return this;
    },
    setAttribute: function (key: string, value: unknown) {
      otelSpan.setAttribute(key, value);
      return this;
    },
    recordException: function (error: Error) {
      otelSpan.recordException(error);
      return this;
    },
    setStatus: function (status: SpanStatusType, message?: string) {
      const statusCode = status === SpanStatus.ERROR ? 2 : status === SpanStatus.OK ? 1 : 0;
      otelSpan.setStatus({ code: statusCode, message });
      return this;
    },
    addEvent: function (name: string, attributes?: Record<string, unknown>) {
      otelSpan.addEvent(name, attributes);
      return this;
    },
    end: () => otelSpan.end(),
    isRecording: () => otelSpan.isRecording(),
    updateName: function (name: string) {
      otelSpan.updateName(name);
      return this;
    },
  };
}

/**
 * Check if OpenTelemetry is available
 */
function isOpenTelemetryAvailable(): boolean {
  try {
    require.resolve('@opentelemetry/api');
    return true;
  } catch {
    return false;
  }
}

/**
 * Load OpenTelemetry module dynamically
 */
async function loadOpenTelemetryModule(): Promise<{
  trace: {
    getTracer: (
      name: string,
      version?: string
    ) => {
      startActiveSpan: <T>(
        name: string,
        options: { attributes?: Record<string, unknown> },
        fn: (span: Parameters<typeof wrapOtelSpan>[0]) => T
      ) => T;
      startSpan: (
        name: string,
        options?: { attributes?: Record<string, unknown> }
      ) => Parameters<typeof wrapOtelSpan>[0];
    };
  };
}> {
  // Use Function constructor to avoid TypeScript checking the import
  const dynamicImport = new Function('specifier', 'return import(specifier)');
  return dynamicImport('@opentelemetry/api');
}

/**
 * Create an OpenTelemetry-based provider
 *
 * Note: Requires @opentelemetry packages to be installed
 */
export async function createOpenTelemetryProvider(
  config: OpenTelemetryConfig
): Promise<InkeepTelemetryProvider> {
  // Check if OpenTelemetry is available
  if (!isOpenTelemetryAvailable()) {
    console.warn(
      'OpenTelemetry packages not installed. Install with: npm install @opentelemetry/api @opentelemetry/sdk-node'
    );
    return createNoOpTelemetryProvider();
  }

  try {
    const { trace } = await loadOpenTelemetryModule();

    // Create a wrapper around OpenTelemetry's API
    const provider: TelemetryProvider = {
      getTracer(name: string, version?: string): TelemetryTracer {
        const otelTracer = trace.getTracer(name, version);

        return {
          startActiveSpan<T>(
            spanName: string,
            arg1: SpanOptions | ((span: TelemetrySpan) => T),
            arg2?: (span: TelemetrySpan) => T
          ): T {
            const fn = typeof arg1 === 'function' ? arg1 : arg2;
            const options = typeof arg1 === 'object' ? arg1 : undefined;

            if (!fn) throw new Error('No callback function provided');

            return otelTracer.startActiveSpan(
              spanName,
              options?.attributes ? { attributes: options.attributes } : {},
              (otelSpan) => {
                const span = wrapOtelSpan(otelSpan);
                return fn(span);
              }
            );
          },
          startSpan(spanName: string, options?: SpanOptions): TelemetrySpan {
            const otelSpan = otelTracer.startSpan(
              spanName,
              options?.attributes ? { attributes: options.attributes } : {}
            );
            return wrapOtelSpan(otelSpan);
          },
        };
      },
      getLogger(name: string): TelemetryLogger {
        // OpenTelemetry logging requires additional setup
        // Fall back to console for now
        return new ConsoleTelemetryProvider(config.serviceName).getLogger(name);
      },
      getMetrics(_name: string): TelemetryMetrics {
        // OpenTelemetry metrics requires additional setup
        // Return no-op for now
        return createNoOpMetrics();
      },
      async shutdown(): Promise<void> {
        // Shutdown would be handled by the SDK setup
      },
      isEnabled(): boolean {
        return true;
      },
    };

    return new InkeepTelemetryProvider({
      enabled: true,
      provider,
    });
  } catch (error) {
    console.warn(
      'Failed to initialize OpenTelemetry:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return createNoOpTelemetryProvider();
  }
}
