import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  Logger,
  ConsoleLogger,
  NoOpLogger,
  loggerFactory,
  configureLogging,
  getLogger
} from '../../utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggerFactory.reset();
  });

  describe('ConsoleLogger', () => {
    let logger: ConsoleLogger;

    beforeEach(() => {
      logger = new ConsoleLogger('test');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should log error messages', () => {
      const data = { key: 'value' };
      const message = 'Error message';

      logger.error(data, message);

      expect(console.error).toHaveBeenCalledWith('[test] Error message', data);
    });

    it('should log warn messages', () => {
      const data = { key: 'value' };
      const message = 'Warning message';

      logger.warn(data, message);

      expect(console.warn).toHaveBeenCalledWith('[test] Warning message', data);
    });

    it('should log info messages', () => {
      const data = { key: 'value' };
      const message = 'Info message';

      logger.info(data, message);

      expect(console.info).toHaveBeenCalledWith('[test] Info message', data);
    });

    it('should log debug messages', () => {
      const data = { key: 'value' };
      const message = 'Debug message';

      logger.debug(data, message);

      expect(console.debug).toHaveBeenCalledWith('[test] Debug message', data);
    });
  });

  describe('NoOpLogger', () => {
    let logger: NoOpLogger;

    beforeEach(() => {
      logger = new NoOpLogger();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should not log anything', () => {
      const data = { key: 'value' };
      const message = 'Test message';

      logger.error(data, message);
      logger.warn(data, message);
      logger.info(data, message);
      logger.debug(data, message);

      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.debug).not.toHaveBeenCalled();
    });
  });


  describe('LoggerFactory', () => {
    it('should return ConsoleLogger by default', () => {
      const logger = loggerFactory.getLogger('test');

      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    it('should cache logger instances', () => {
      const logger1 = loggerFactory.getLogger('test');
      const logger2 = loggerFactory.getLogger('test');

      expect(logger1).toBe(logger2);
    });

    it('should use custom logger factory', () => {
      const customLogger = new NoOpLogger();
      const customFactory = vi.fn(() => customLogger);

      loggerFactory.configure({
        loggerFactory: customFactory
      });

      const logger = loggerFactory.getLogger('test');

      expect(customFactory).toHaveBeenCalledWith('test');
      expect(logger).toBe(customLogger);
    });

    it('should use default logger', () => {
      const defaultLogger = new NoOpLogger();

      loggerFactory.configure({
        defaultLogger: defaultLogger
      });

      const logger = loggerFactory.getLogger('test');

      expect(logger).toBe(defaultLogger);
    });

    it('should clear cache when reconfigured', () => {
      const logger1 = loggerFactory.getLogger('test');

      loggerFactory.configure({
        defaultLogger: new NoOpLogger()
      });

      const logger2 = loggerFactory.getLogger('test');

      expect(logger1).not.toBe(logger2);
    });

    it('should reset to default state', () => {
      loggerFactory.configure({
        defaultLogger: new NoOpLogger()
      });

      loggerFactory.reset();

      const logger = loggerFactory.getLogger('test');
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });
  });


  describe('configureLogging', () => {
    it('should configure the global logger factory', () => {
      const customLogger = new NoOpLogger();

      configureLogging({
        defaultLogger: customLogger
      });

      const logger = getLogger('test');
      expect(logger).toBe(customLogger);
    });
  });

  describe('getLogger', () => {
    it('should return logger from factory', () => {
      const logger = getLogger('test');

      expect(logger).toBeInstanceOf(ConsoleLogger);
    });
  });
});