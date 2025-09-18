import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// Declare the mock function
const convertTypeScriptToJson = vi.fn();

// Mock the convertTypeScriptToJson function
vi.mock('../../commands/pull.js', async () => {
  const actual = await vi.importActual('../../commands/pull.js');
  return {
    ...actual,
    convertTypeScriptToJson: vi.fn(),
  };
});

describe('Pull Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('convertTypeScriptToJson', () => {
    it('should convert TypeScript file to JSON using tsx spawn', async () => {
      const mockResult = { id: 'test-graph', name: 'Test Graph' };
      (convertTypeScriptToJson as Mock).mockResolvedValue(mockResult);

      const result = await convertTypeScriptToJson('test-graph.ts');

      expect(convertTypeScriptToJson).toHaveBeenCalledWith('test-graph.ts');
      expect(result).toEqual(mockResult);
    });

    it('should handle tsx spawn errors', async () => {
      (convertTypeScriptToJson as Mock).mockRejectedValue(
        new Error('Failed to load TypeScript file: tsx not found')
      );

      await expect(convertTypeScriptToJson('test-graph.ts')).rejects.toThrow(
        'Failed to load TypeScript file: tsx not found'
      );
    });

    it('should handle tsx exit with non-zero code', async () => {
      (convertTypeScriptToJson as Mock).mockRejectedValue(
        new Error('Conversion failed: Error: Module not found')
      );

      await expect(convertTypeScriptToJson('test-graph.ts')).rejects.toThrow(
        'Conversion failed: Error: Module not found'
      );
    });

    it('should handle missing JSON markers in tsx output', async () => {
      (convertTypeScriptToJson as Mock).mockRejectedValue(
        new Error('JSON markers not found in output')
      );

      await expect(convertTypeScriptToJson('test-graph.ts')).rejects.toThrow(
        'JSON markers not found in output'
      );
    });

    it('should handle invalid JSON in tsx output', async () => {
      (convertTypeScriptToJson as Mock).mockRejectedValue(
        new Error('Failed to parse conversion result')
      );

      await expect(convertTypeScriptToJson('test-graph.ts')).rejects.toThrow(
        'Failed to parse conversion result'
      );
    });

    it('should handle file not found error', async () => {
      (convertTypeScriptToJson as Mock).mockRejectedValue(
        new Error('File not found: nonexistent.ts')
      );

      await expect(convertTypeScriptToJson('nonexistent.ts')).rejects.toThrow(
        'File not found: nonexistent.ts'
      );
    });

    it('should handle non-TypeScript files directly', async () => {
      const mockResult = { id: 'test-graph' };
      (convertTypeScriptToJson as Mock).mockResolvedValue(mockResult);

      const result = await convertTypeScriptToJson('test-graph.js');

      expect(result).toEqual(mockResult);
    });

    it('should handle modules with no graph exports', async () => {
      (convertTypeScriptToJson as Mock).mockRejectedValue(
        new Error('No AgentGraph exported from configuration file')
      );

      await expect(convertTypeScriptToJson('test-graph.js')).rejects.toThrow(
        'No AgentGraph exported from configuration file'
      );
    });
  });
});
