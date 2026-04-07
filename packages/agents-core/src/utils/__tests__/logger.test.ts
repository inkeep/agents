import { Writable } from 'node:stream';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { loggerFactory, PinoLogger, runWithLogContext } from '../logger';

function createTestLogger() {
  const lines: Record<string, any>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  const logger = new PinoLogger('test', {
    options: { level: 'debug' },
    fromInstance: pino({ level: 'debug' }, stream),
  });
  return { logger, lines };
}

function createTestStream() {
  const lines: Record<string, any>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { lines, stream };
}

describe('PinoLogger scoped context', () => {
  beforeEach(() => {
    loggerFactory.reset();
  });

  it('getLogger outside ALS scope returns base logger (backward compatible)', () => {
    const { lines, stream } = createTestStream();
    loggerFactory.configure({
      pinoConfig: { options: { level: 'debug' }, fromInstance: pino({ level: 'debug' }, stream) },
    });
    const logger = loggerFactory.getLogger('MyModule');
    logger.info({ foo: 'bar' }, 'hello');
    expect(lines.length).toBe(1);
    expect(lines[0].foo).toBe('bar');
    expect(lines[0].msg).toBe('hello');
  });

  it('inside runWithLogContext, logger.info includes scoped bindings', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('ScopedModule');

    runWithLogContext({ tenantId: 'tenant-1', projectId: 'proj-1' }, () => {
      logger.info({}, 'scoped message');
    });

    expect(lines.length).toBe(1);
    expect(lines[0].tenantId).toBe('tenant-1');
    expect(lines[0].projectId).toBe('proj-1');
    expect(lines[0].module).toBe('ScopedModule');
    expect(lines[0].msg).toBe('scoped message');
  });

  it('nested runWithLogContext scopes compose (inner has parent + own bindings)', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('Nested');

    runWithLogContext({ tenantId: 'tenant-1' }, () => {
      runWithLogContext({ triggerId: 'trig-1' }, () => {
        logger.info({}, 'nested message');
      });
    });

    expect(lines.length).toBe(1);
    expect(lines[0].tenantId).toBe('tenant-1');
    expect(lines[0].triggerId).toBe('trig-1');
    expect(lines[0].module).toBe('Nested');
  });

  it('.with() captures current ALS context at call time (snapshot semantics)', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('Snapshot');

    let childLogger: PinoLogger = undefined as unknown as PinoLogger;

    runWithLogContext({ tenantId: 'tenant-1' }, () => {
      childLogger = logger.with({ sessionId: 'sess-1' });
    });

    childLogger.info({}, 'after scope');

    expect(lines.length).toBe(1);
    expect(lines[0].tenantId).toBe('tenant-1');
    expect(lines[0].sessionId).toBe('sess-1');
    expect(lines[0].module).toBe('Snapshot');
  });

  it('.with() logger does NOT continue to proxy ALS after creation', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('NoProxy');

    let childLogger: PinoLogger = undefined as unknown as PinoLogger;

    runWithLogContext({ tenantId: 'tenant-1' }, () => {
      childLogger = logger.with({ sessionId: 'sess-1' });
    });

    runWithLogContext({ extraField: 'extra' }, () => {
      childLogger.info({}, 'should not pick up extra');
    });

    expect(lines.length).toBe(1);
    expect(lines[0].tenantId).toBe('tenant-1');
    expect(lines[0].sessionId).toBe('sess-1');
    expect(lines[0].extraField).toBeUndefined();
  });

  it('WeakMap cache works — same ALS scope returns same cached child', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('CacheTest');

    runWithLogContext({ tenantId: 'tenant-1' }, () => {
      logger.info({}, 'first call');
      logger.info({}, 'second call');
    });

    expect(lines.length).toBe(2);
    expect(lines[0].tenantId).toBe('tenant-1');
    expect(lines[1].tenantId).toBe('tenant-1');
    expect(lines[0].module).toBe('CacheTest');
    expect(lines[1].module).toBe('CacheTest');
  });

  it('fallback when ALS store is empty returns base pinoInstance', () => {
    const { logger, lines } = createTestLogger();
    logger.info({ key: 'value' }, 'no scope');
    expect(lines.length).toBe(1);
    expect(lines[0].key).toBe('value');
    expect(lines[0].msg).toBe('no scope');
    expect(lines[0].tenantId).toBeUndefined();
  });

  it('per-call data merges with ALS context', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('Merge');

    runWithLogContext({ tenantId: 'tenant-1' }, () => {
      logger.info({ requestId: 'req-1' }, 'merged');
    });

    expect(lines.length).toBe(1);
    expect(lines[0].tenantId).toBe('tenant-1');
    expect(lines[0].requestId).toBe('req-1');
    expect(lines[0].module).toBe('Merge');
  });

  it('all log levels delegate through resolveInstance', () => {
    const { lines, stream } = createTestStream();
    const basePino = pino({ level: 'debug' }, stream);
    loggerFactory.configure({
      pinoConfig: { fromInstance: basePino, options: { level: 'debug' } },
    });
    const logger = loggerFactory.getLogger('Levels');

    runWithLogContext({ scope: 'test' }, () => {
      logger.debug({}, 'debug msg');
      logger.info({}, 'info msg');
      logger.warn({}, 'warn msg');
      logger.error({}, 'error msg');
    });

    expect(lines.length).toBe(4);
    for (const line of lines) {
      expect(line.scope).toBe('test');
      expect(line.module).toBe('Levels');
    }
  });
});
