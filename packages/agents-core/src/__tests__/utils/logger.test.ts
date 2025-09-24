import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConsoleLogger,
  PinoLogger,
  configureLogging,
  getLogger,
  loggerFactory,
  NoOpLogger,
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

  describe('configureLogging', () => {
    it('should configure the global logger factory', () => {
      const customLogger = new PinoLogger('custom');

      configureLogging({
        defaultLogger: customLogger,
      });

      const logger = getLogger('test');
      expect(logger).toBe(customLogger);
    });
  });

  describe('getLogger', () => {
    it('should return logger from factory', () => {
      const logger = getLogger('test');

      expect(logger).toBeInstanceOf(PinoLogger);
    });
  });
});
