import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { IncrementalStreamParser } from '../incremental-stream-parser';
import type { StreamHelper } from '../stream-helpers';
import { ArtifactParser } from '../artifact-parser';

// Mock dependencies
vi.mock('../artifact-parser');
vi.mock('../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('IncrementalStreamParser', () => {
  let parser: IncrementalStreamParser;
  let mockStreamHelper: StreamHelper;
  let mockArtifactParser: ArtifactParser;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock StreamHelper
    mockStreamHelper = {
      writeRole: vi.fn(),
      streamText: vi.fn(),
      writeData: vi.fn(),
    } as any;

    // Mock ArtifactParser
    mockArtifactParser = {
      parseObject: vi.fn().mockResolvedValue([
        {
          kind: 'data',
          data: { id: 'test', name: 'Test', props: {} },
        },
      ]),
    } as any;

    (ArtifactParser as any).mockImplementation(() => mockArtifactParser);

    parser = new IncrementalStreamParser(mockStreamHelper, 'test-tenant', 'test-context');
  });

  describe('processObjectDelta', () => {
    it('should stream complete components once', async () => {
      const delta1 = {
        dataComponents: [
          { id: 'comp1' },
        ],
      };

      const delta2 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1' },
        ],
      };

      const delta3 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test' } },
        ],
      };

      // Process deltas
      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);
      await parser.processObjectDelta(delta3);

      // Should only stream once when complete
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
      expect(mockStreamHelper.writeData).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple components independently', async () => {
      const delta = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test1' } },
          { id: 'comp2', name: 'Component 2', props: { value: 'test2' } },
        ],
      };

      await parser.processObjectDelta(delta);

      // Should stream both components
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(2);
      expect(mockStreamHelper.writeData).toHaveBeenCalledTimes(2);
    });

    it('should validate artifact components correctly', async () => {
      const incompleteArtifact = {
        dataComponents: [
          {
            id: 'artifact1',
            name: 'Artifact',
            props: { artifact_id: 'art123' }, // Missing task_id
          },
        ],
      };

      const completeArtifact = {
        dataComponents: [
          {
            id: 'artifact1',
            name: 'Artifact',
            props: { artifact_id: 'art123', task_id: 'task456' },
          },
        ],
      };

      // Process incomplete artifact
      await parser.processObjectDelta(incompleteArtifact);
      expect(mockArtifactParser.parseObject).not.toHaveBeenCalled();

      // Process complete artifact
      await parser.processObjectDelta(completeArtifact);
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });

    it('should prevent duplicate streaming of same component', async () => {
      const delta = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test' } },
        ],
      };

      // Process same delta twice
      await parser.processObjectDelta(delta);
      await parser.processObjectDelta(delta);

      // Should only stream once
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
      expect(mockStreamHelper.writeData).toHaveBeenCalledTimes(1);
    });

    it('should handle empty or invalid deltas gracefully', async () => {
      await parser.processObjectDelta(null);
      await parser.processObjectDelta(undefined);
      await parser.processObjectDelta({});
      await parser.processObjectDelta({ dataComponents: null });
      await parser.processObjectDelta({ dataComponents: [] });

      expect(mockArtifactParser.parseObject).not.toHaveBeenCalled();
      expect(mockStreamHelper.writeData).not.toHaveBeenCalled();
    });

    it('should deep merge deltas correctly', async () => {
      const delta1 = {
        dataComponents: [
          {
            id: 'comp1',
            name: 'Component 1',
            props: { temp: '20' },
          },
        ],
      };

      const delta2 = {
        dataComponents: [
          {
            id: 'comp1',
            props: { humidity: '80%' },
          },
        ],
      };

      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);

      // Should merge props and stream once when complete
      expect(mockArtifactParser.parseObject).toHaveBeenCalledWith({
        dataComponents: [
          {
            id: 'comp1',
            name: 'Component 1',
            props: { temp: '20', humidity: '80%' },
          },
        ],
      });
    });

    it('should handle large component payloads efficiently', async () => {
      const largeProps = Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [`prop${i}`, `value${i}`])
      );

      const delta = {
        dataComponents: [
          {
            id: 'large-comp',
            name: 'Large Component',
            props: largeProps,
          },
        ],
      };

      const startTime = Date.now();
      await parser.processObjectDelta(delta);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('component completion logic', () => {
    it('should require id, name, and props for regular components', async () => {
      const testCases = [
        { delta: { dataComponents: [{}] }, shouldStream: false },
        { delta: { dataComponents: [{ id: 'test' }] }, shouldStream: false },
        { delta: { dataComponents: [{ id: 'test', name: 'Test' }] }, shouldStream: false },
        {
          delta: { dataComponents: [{ id: 'test', name: 'Test', props: {} }] },
          shouldStream: true,
        },
      ];

      for (const { delta, shouldStream } of testCases) {
        await parser.processObjectDelta(delta);
      }

      // Only the complete component should stream
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });

    it('should handle artifacts with special validation', async () => {
      const testCases = [
        {
          delta: {
            dataComponents: [
              { id: 'art1', name: 'Artifact', props: {} },
            ],
          },
          shouldStream: false,
        },
        {
          delta: {
            dataComponents: [
              { id: 'art2', name: 'Artifact', props: { artifact_id: 'art123' } },
            ],
          },
          shouldStream: false,
        },
        {
          delta: {
            dataComponents: [
              {
                id: 'art3',
                name: 'Artifact',
                props: { artifact_id: 'art123', task_id: 'task456' },
              },
            ],
          },
          shouldStream: true,
        },
      ];

      for (const { delta } of testCases) {
        await parser.processObjectDelta(delta);
      }

      // Only the complete artifact should stream
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('memory and performance', () => {
    it('should not accumulate excessive memory with repeated deltas', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Process many deltas
      for (let i = 0; i < 1000; i++) {
        await parser.processObjectDelta({
          dataComponents: [
            { id: `comp${i}`, name: `Component ${i}`, props: { value: i } },
          ],
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle rapid component updates without thrashing', async () => {
      const componentId = 'rapid-comp';
      const iterations = 100;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await parser.processObjectDelta({
          dataComponents: [
            {
              id: componentId,
              name: 'Rapid Component',
              props: { counter: i },
            },
          ],
        });
      }

      const duration = Date.now() - startTime;

      // Should complete within reasonable time and only stream once
      expect(duration).toBeLessThan(1000); // < 1 second
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });
  });
});