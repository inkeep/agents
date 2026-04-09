import { logs } from '@opentelemetry/api-logs';
import { getLogger } from './logger';

const logger = getLogger('otel-log-provider');

export async function setupOTelLogProvider(): Promise<void> {
  try {
    const { LoggerProvider, BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');
    const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-http');

    const exporter = new OTLPLogExporter();
    const provider = new LoggerProvider({
      processors: [new BatchLogRecordProcessor(exporter)],
    });

    logs.setGlobalLoggerProvider(provider);

    logger.info('OTel log provider initialized');
  } catch (error) {
    logger.debug({ error }, 'OTel log SDK packages not available, log export disabled');
  }
}

export async function flushOTelLogs(): Promise<void> {
  try {
    const provider = logs.getLoggerProvider() as {
      forceFlush?: () => Promise<void>;
    };
    if (typeof provider.forceFlush === 'function') {
      await provider.forceFlush();
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to flush OTel logs');
  }
}

export async function shutdownOTelLogProvider(): Promise<void> {
  try {
    const provider = logs.getLoggerProvider() as {
      shutdown?: () => Promise<void>;
    };
    if (typeof provider.shutdown === 'function') {
      await provider.shutdown();
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to shutdown OTel log provider');
  }
}
