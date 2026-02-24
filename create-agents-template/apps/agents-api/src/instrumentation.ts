export {};

// Check both the traces-specific and general OTEL endpoint variables.
// The quickstart template configures OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
// OTEL_EXPORTER_OTLP_ENDPOINT is the general fallback per the OTEL spec.
const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
// The template sets a real SigNoz endpoint URL but uses a placeholder in the
// auth headers (signoz-ingestion-key=<your-ingestion-key>). Check both the
// endpoint and headers for placeholder patterns to avoid initializing OTEL
// when credentials haven't been configured yet.
const otlpHeaders =
  process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS || process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
const hasPlaceholder = otlpHeaders.includes('your-') || otlpEndpoint?.includes('your-');
const isRealEndpoint = otlpEndpoint && !hasPlaceholder;

if (isRealEndpoint) {
  try {
    const { defaultSDK } = await import('@inkeep/agents-api/instrumentation');
    defaultSDK.start();
    console.log(`[OTEL] Instrumentation enabled (endpoint: ${otlpEndpoint})`);
  } catch (error) {
    console.error(`[OTEL] Failed to initialize: ${error instanceof Error ? error.message : error}`);
    console.warn('[OTEL] Application will continue without telemetry');
  }
} else {
  console.log('[OTEL] Instrumentation skipped (no real OTEL endpoint configured)');
}
