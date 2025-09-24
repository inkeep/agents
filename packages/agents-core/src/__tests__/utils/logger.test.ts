import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogger, loggerFactory, PinoLogger } from '../../utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggerFactory.reset();
  });

  describe('LoggerFactory', () => {
    it('should return PinoLogger by default', () => {
      const logger = loggerFactory.getLogger('test');

      expect(logger).toBeInstanceOf(PinoLogger);
    });

    it('should cache logger instances', () => {
      const logger1 = loggerFactory.getLogger('test');
      const logger2 = loggerFactory.getLogger('test');

      expect(logger1).toBe(logger2);
    });

    it('should use custom logger factory', () => {
      const customLogger = new PinoLogger('custom');
      const customFactory = vi.fn(() => customLogger);

      loggerFactory.configure({
        loggerFactory: customFactory,
      });

      const logger = loggerFactory.getLogger('test');

      expect(customFactory).toHaveBeenCalledWith('test');
      expect(logger).toBe(customLogger);
    });

    it('should use default logger', () => {
      const defaultLogger = new PinoLogger('default');

      loggerFactory.configure({
        defaultLogger: defaultLogger,
      });

      const logger = loggerFactory.getLogger('test');

      expect(logger).toBe(defaultLogger);
    });

    it('should clear cache when reconfigured', () => {
      const logger1 = loggerFactory.getLogger('test');

      loggerFactory.configure({
        defaultLogger: new PinoLogger('reconfigured'),
      });

      const logger2 = loggerFactory.getLogger('test');

      expect(logger1).not.toBe(logger2);
    });

    it('should reset to default state', () => {
      loggerFactory.configure({
        defaultLogger: new PinoLogger('configured'),
      });

      loggerFactory.reset();

      const logger = loggerFactory.getLogger('test');
      expect(logger).toBeInstanceOf(PinoLogger);
    });
  });

  describe('getLogger', () => {
    it('should return logger from factory', () => {
      const logger = getLogger('test');

      expect(logger).toBeInstanceOf(PinoLogger);
    });
  });
});
