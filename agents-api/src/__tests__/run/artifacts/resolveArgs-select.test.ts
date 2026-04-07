import type { FullExecutionContext } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';
import {
  ArtifactParser,
  ToolChainResolutionError,
} from '../../../domains/run/artifacts/ArtifactParser';
import type { ArtifactService } from '../../../domains/run/artifacts/ArtifactService';

function createParser(overrides: {
  getArtifactFull?: ArtifactService['getArtifactFull'];
  getToolResultRaw?: ArtifactService['getToolResultRaw'];
  getToolResultFull?: ArtifactService['getToolResultFull'];
}) {
  const mockArtifactService = {
    getArtifactFull: overrides.getArtifactFull ?? vi.fn().mockResolvedValue(null),
    getToolResultRaw: overrides.getToolResultRaw ?? vi.fn().mockReturnValue(undefined),
    getToolResultFull:
      overrides.getToolResultFull ??
      overrides.getToolResultRaw ??
      vi.fn().mockReturnValue(undefined),
  } as unknown as ArtifactService;

  const mockExecContext = {
    tenantId: 'test-tenant',
    projectId: 'test-project',
  } as FullExecutionContext;

  return new ArtifactParser(mockExecContext, {
    artifactService: mockArtifactService,
  });
}

describe('resolveArgs with $select', () => {
  const toolData = {
    items: [
      { title: 'Alpha', score: 0.9 },
      { title: 'Beta', score: 0.5 },
      { title: 'Gamma', score: 0.85 },
    ],
    metadata: { total: 3 },
  };

  describe('$tool + $select', () => {
    it('should filter ephemeral tool result with $select', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      const result = await parser.resolveArgs({
        $tool: 'call_search',
        $select: 'items[?score > `0.8`]',
      });

      expect(result).toEqual([
        { title: 'Alpha', score: 0.9 },
        { title: 'Gamma', score: 0.85 },
      ]);
    });

    it('should extract specific fields with $select', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      const result = await parser.resolveArgs({
        $tool: 'call_search',
        $select: 'items[].title',
      });

      expect(result).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('should throw ToolChainResolutionError when $select matches nothing', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      await expect(
        parser.resolveArgs({
          $tool: 'call_search',
          $select: 'nonexistent_field',
        })
      ).rejects.toThrow(ToolChainResolutionError);
    });
  });

  describe('$artifact + $tool + $select', () => {
    it('should filter artifact data with $select', async () => {
      const parser = createParser({
        getArtifactFull: vi.fn().mockResolvedValue({ data: toolData }),
      });

      const result = await parser.resolveArgs({
        $artifact: 'art_123',
        $tool: 'call_search',
        $select: 'metadata.total',
      });

      expect(result).toBe(3);
    });
  });

  describe('regression: without $select', () => {
    it('should return full tool result when no $select', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      const result = await parser.resolveArgs({
        $tool: 'call_search',
      });

      expect(result).toEqual(toolData);
    });

    it('should return full artifact data when no $select', async () => {
      const parser = createParser({
        getArtifactFull: vi.fn().mockResolvedValue({ data: toolData }),
      });

      const result = await parser.resolveArgs({
        $artifact: 'art_123',
        $tool: 'call_search',
      });

      expect(result).toEqual(toolData);
    });
  });

  describe('error handling', () => {
    it('should throw ToolChainResolutionError for bad JMESPath', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      await expect(
        parser.resolveArgs({
          $tool: 'call_search',
          $select: '[invalid!!!',
        })
      ).rejects.toThrow(ToolChainResolutionError);
    });

    it('should throw ToolChainResolutionError for dangerous expression', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      await expect(
        parser.resolveArgs({
          $tool: 'call_search',
          $select: '__proto__',
        })
      ).rejects.toThrow(ToolChainResolutionError);
    });
  });

  describe('nested refs with $select', () => {
    it('should resolve nested $select at different levels', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      const result = await parser.resolveArgs({
        first: { $tool: 'call_search', $select: 'items[0].title' },
        second: { $tool: 'call_search', $select: 'metadata.total' },
      });

      expect(result).toEqual({
        first: 'Alpha',
        second: 3,
      });
    });
  });

  describe('result. prefix stripping', () => {
    it('should auto-strip result. prefix from $select expressions', async () => {
      const parser = createParser({
        getToolResultRaw: vi.fn().mockReturnValue(toolData),
      });

      const result = await parser.resolveArgs({
        $tool: 'call_search',
        $select: 'result.metadata.total',
      });

      expect(result).toBe(3);
    });
  });
});
