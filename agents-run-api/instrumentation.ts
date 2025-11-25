import { registerOTel } from '@vercel/otel';

export async function register() {
  await registerOTel({
    serviceName: 'inkeep-agents-run-api',
    traceExporter: 'otlp-http',
  });
}

