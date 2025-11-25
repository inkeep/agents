import './src/env';
import { defaultSDK } from './src/instrumentation';
import app from './src/index';

// Initialize SDK synchronously
process.stdout.write('='.repeat(80) + '\n');
process.stdout.write('[OTEL DEBUG INDEX] ⚡ Initializing SDK synchronously...\n');
process.stdout.write('='.repeat(80) + '\n');

try {
  defaultSDK.start();
  process.stdout.write('[OTEL DEBUG INDEX] ✅ SDK.start() called\n');
} catch (error) {
  process.stderr.write(`[OTEL DEBUG INDEX] ❌ Failed to call SDK.start(): ${error}\n`);
  console.error('[OTEL DEBUG INDEX] Failed to start SDK:', error);
}

export const runtime = 'nodejs';
export default app;
