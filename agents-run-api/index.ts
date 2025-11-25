import './src/env';
import { defaultSDK } from './src/instrumentation';

process.stdout.write('[OTEL DEBUG INDEX] Starting OpenTelemetry SDK...\n');
console.log('[OTEL DEBUG] Starting OpenTelemetry SDK...');
try {
  defaultSDK.start();
  process.stdout.write('[OTEL DEBUG INDEX] OpenTelemetry SDK started successfully\n');
  console.log('[OTEL DEBUG] OpenTelemetry SDK started successfully');
} catch (error) {
  process.stderr.write(`[OTEL DEBUG INDEX] Failed to start OpenTelemetry SDK: ${error}\n`);
  console.error('[OTEL DEBUG] Failed to start OpenTelemetry SDK:', error);
  throw error;
}

import app from './src/index';

export const runtime = 'nodejs';
export default app;
