import './src/env';

process.stdout.write('='.repeat(80) + '\n');
process.stdout.write('[OTEL DEBUG INDEX] ⚡ Module initialization starting...\n');
process.stdout.write('='.repeat(80) + '\n');
console.log('[OTEL DEBUG INDEX] Module initialization starting...');

import { defaultSDK } from './src/instrumentation';

process.stdout.write('[OTEL DEBUG INDEX] Starting OpenTelemetry SDK...\n');
console.log('[OTEL DEBUG] Starting OpenTelemetry SDK...');
try {
  await defaultSDK.start();
  process.stdout.write('[OTEL DEBUG INDEX] ✅ OpenTelemetry SDK started successfully\n');
  console.log('[OTEL DEBUG] OpenTelemetry SDK started successfully');
  
  // Verify SDK is actually started by checking tracer provider
  const { trace } = await import('@opentelemetry/api');
  const provider = trace.getTracerProvider();
  console.log('[OTEL DEBUG INDEX] TracerProvider type:', provider.constructor.name);
  process.stdout.write(`[OTEL DEBUG INDEX] TracerProvider type: ${provider.constructor.name}\n`);
} catch (error) {
  process.stderr.write(`[OTEL DEBUG INDEX] ❌ Failed to start OpenTelemetry SDK: ${error}\n`);
  console.error('[OTEL DEBUG] Failed to start OpenTelemetry SDK:', error);
  throw error;
}

process.stdout.write('[OTEL DEBUG INDEX] Loading app...\n');
import app from './src/index';

process.stdout.write('[OTEL DEBUG INDEX] App loaded, module initialization complete\n');
process.stdout.write('='.repeat(80) + '\n');

export const runtime = 'nodejs';
export default app;
