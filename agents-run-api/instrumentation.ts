import { registerOTel } from '@vercel/otel';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await registerOTel({
      serviceName: 'inkeep-agents-run-api',
      traceExporter: 'otlp-http',
    });
  }
}

