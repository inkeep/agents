import './src/env';
import { defaultSDK } from './src/instrumentation';

console.log('[OTEL DEBUG] Starting OpenTelemetry SDK...');
try {
  defaultSDK.start();
  console.log('[OTEL DEBUG] OpenTelemetry SDK started successfully');
} catch (error) {
  console.error('[OTEL DEBUG] Failed to start OpenTelemetry SDK:', error);
  throw error;
}

import app from './src/index';

export const runtime = 'nodejs';
export default app;
