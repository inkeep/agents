import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OutputService, OutputMode } from '../OutputService';

describe('OutputService', () => {
  let output: OutputService;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    output = new OutputService();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor and mode management', () => {
    it('should default to NORMAL mode', () => {
      expect(output.getMode()).toBe(OutputMode.NORMAL);
    });

    it('should allow setting output mode', () => {
      output.setMode(OutputMode.QUIET);
      expect(output.getMode()).toBe(OutputMode.QUIET);
    });
  });

  describe('NORMAL mode output', () => {
    beforeEach(() => {
      output.setMode(OutputMode.NORMAL);
    });

    it('should output success messages', () => {
      output.success('Test success');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test success'));
    });

    it('should output error messages', () => {
      output.error('Test error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });

    it('should output warning messages', () => {
      output.warning('Test warning');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test warning'));
    });

    it('should output info messages', () => {
      output.info('Test info');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test info'));
    });

    it('should output secondary messages', () => {
      output.secondary('Test secondary');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test secondary'));
    });

    it('should output plain messages', () => {
      output.plain('Test plain');
      expect(consoleLogSpy).toHaveBeenCalledWith('Test plain');
    });

    it('should output newlines', () => {
      output.newline();
      expect(consoleLogSpy).toHaveBeenCalledWith();
    });

    it('should output JSON data', () => {
      const data = { key: 'value' };
      output.json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('should output labeled values', () => {
      output.label('Key', 'value');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Key'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('value'));
    });

    it('should output section headers', () => {
      output.section('Test Section');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Section'));
    });

    it('should output lists', () => {
      output.list(['item1', 'item2', 'item3']);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    });

    it('should output key-value pairs', () => {
      output.keyValues({ key1: 'value1', key2: 'value2' });
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('QUIET mode output', () => {
    beforeEach(() => {
      output.setMode(OutputMode.QUIET);
    });

    it('should suppress success messages', () => {
      output.success('Test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress error messages', () => {
      output.error('Test');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should suppress warning messages', () => {
      output.warning('Test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress info messages', () => {
      output.info('Test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress secondary messages', () => {
      output.secondary('Test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress plain messages', () => {
      output.plain('Test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress newlines', () => {
      output.newline();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should still output JSON (for piping)', () => {
      const data = { key: 'value' };
      output.json(data);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should suppress labeled values', () => {
      output.label('Key', 'value');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress sections', () => {
      output.section('Test Section');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress lists', () => {
      output.list(['item1', 'item2']);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should suppress key-value pairs', () => {
      output.keyValues({ key: 'value' });
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('JSON mode output', () => {
    beforeEach(() => {
      output.setMode(OutputMode.JSON);
    });

    it('should output all message types in JSON mode', () => {
      output.success('Test');
      output.error('Test');
      output.info('Test');

      // In JSON mode, normal text output still works
      // (this might need adjustment based on desired behavior)
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});
