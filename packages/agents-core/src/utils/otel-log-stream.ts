import { Writable } from 'node:stream';
import { context } from '@opentelemetry/api';
import { type LogRecord, SeverityNumber, logs } from '@opentelemetry/api-logs';

const PINO_TO_OTEL_SEVERITY: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
};

const LEVEL_TEXT: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

function toAnyValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

export class OTelLogStream extends Writable {
  private otelLogger = logs.getLogger('pino-bridge');

  constructor() {
    super({ objectMode: false, decodeStrings: false });
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      for (const line of str.split('\n')) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        this.emitLogRecord(parsed);
      }
    } catch {
      // Silently skip unparseable lines
    }
    callback();
  }

  private emitLogRecord(log: Record<string, unknown>): void {
    const { level, time, msg, pid, hostname, name, ...rest } = log;

    const attrs: Record<string, string | number | boolean | null | undefined> = {};
    if (name) attrs['logger.name'] = String(name);
    for (const [key, value] of Object.entries(rest)) {
      attrs[key] = toAnyValue(value);
    }

    const record: LogRecord = {
      timestamp: typeof time === 'number' ? time : Date.now(),
      severityNumber: PINO_TO_OTEL_SEVERITY[level as number] ?? SeverityNumber.INFO,
      severityText: LEVEL_TEXT[level as number] ?? 'INFO',
      body: typeof msg === 'string' ? msg : JSON.stringify(msg),
      attributes: attrs,
      context: context.active(),
    };

    this.otelLogger.emit(record);
  }
}
