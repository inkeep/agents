import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamHelper } from '../../utils/stream-helpers';
import { ArtifactParser } from '../ArtifactParser';
import { IncrementalStreamParser } from '../IncrementalStreamParser';

// Mock dependencies
vi.mock('../ArtifactParser');
vi.mock('../AgentSession', () => ({
  agentSessionManager: {
    getArtifactParser: vi.fn().mockReturnValue(null), // Return null to force fallback to new parser
  },
}));
vi.mock('../../logger', () => ({
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

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock StreamHelper
    mockStreamHelper = {
      writeRole: vi.fn(),
      streamText: vi.fn(),
      writeData: vi.fn(),
    } as any;

    // Create the mock instance for direct access
    mockArtifactParser = {
      parseObject: vi.fn().mockImplementation((obj, _artifactMap, _subAgentId) => {
        // Return the expected array format based on the component data
        const component = obj.dataComponents?.[0];
        if (!component || !component.id || !component.name) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          {
            kind: 'data',
            data: { id: component.id, name: component.name, props: component.props || {} },
          },
        ]);
      }),
      hasIncompleteArtifact: vi.fn().mockReturnValue(false),
      getContextArtifacts: vi.fn().mockResolvedValue(new Map()),
    } as any;

    // Create mock constructor that returns the same mock instance
    vi.mocked(ArtifactParser).mockImplementation(() => mockArtifactParser);

    parser = new IncrementalStreamParser(
      mockStreamHelper,
      'test-tenant',
      'test-context',
      {} as any,
      {
        sessionId: 'test-session',
        taskId: 'test-task',
        projectId: 'test-project',
        subAgentId: 'test-agent',
        streamRequestId: 'test-stream-request',
      }
    );

    // Initialize artifact map
    await parser.initializeArtifactMap();
  });

  describe('processObjectDelta', () => {
    it.skip('should stream complete components once when stable', async () => {
      const delta1 = {
        dataComponents: [{ id: 'comp1', name: 'Component 1', props: { value: 'test' } }],
      };

      const delta2 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test' } }, // Same props = stable
        ],
      };

      // Process deltas - component becomes stable on delta2
      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);

      // Should stream once when stable
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
      expect(mockStreamHelper.writeData).toHaveBeenCalledTimes(1);
    });

    it.skip('should handle multiple components independently', async () => {
      const delta1 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test1' } },
          { id: 'comp2', name: 'Component 2', props: { value: 'test2' } },
        ],
      };

      const delta2 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test1' } }, // comp1 stable
          { id: 'comp2', name: 'Component 2', props: { value: 'test2' } }, // comp2 stable
        ],
      };

      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);

      // Should stream both components when they become stable
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(2);
      expect(mockStreamHelper.writeData).toHaveBeenCalledTimes(2);
    });

    it.skip('should validate artifact components correctly', async () => {
      const incompleteArtifact = {
        dataComponents: [
          {
            id: 'artifact1',
            name: 'Artifact',
            props: { artifact_id: 'art123' }, // Missing task_id
          },
        ],
      };

      const completeArtifact1 = {
        dataComponents: [
          {
            id: 'artifact1',
            name: 'Artifact',
            props: { artifact_id: 'art123', task_id: 'task456' },
          },
        ],
      };

      const completeArtifact2 = {
        dataComponents: [
          {
            id: 'artifact1',
            name: 'Artifact',
            props: { artifact_id: 'art123', task_id: 'task456' }, // Same = stable
          },
        ],
      };

      // Process incomplete artifact
      await parser.processObjectDelta(incompleteArtifact);
      expect(mockArtifactParser.parseObject).not.toHaveBeenCalled();

      // Process complete artifact (twice to make it stable)
      await parser.processObjectDelta(completeArtifact1);
      await parser.processObjectDelta(completeArtifact2);
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });

    it.skip('should prevent duplicate streaming of same component', async () => {
      const delta1 = {
        dataComponents: [{ id: 'comp1', name: 'Component 1', props: { value: 'test' } }],
      };

      const delta2 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test' } }, // Same = stable
        ],
      };

      const delta3 = {
        dataComponents: [
          { id: 'comp1', name: 'Component 1', props: { value: 'test' } }, // Same again
        ],
      };

      // Process deltas - component streams on delta2 when stable
      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2); // Streams here
      await parser.processObjectDelta(delta3); // Should not stream again

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

    it.skip('should deep merge deltas correctly', async () => {
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

      const delta3 = {
        dataComponents: [
          {
            id: 'comp1',
            name: 'Component 1',
            props: { temp: '20', humidity: '80%' },
          },
        ],
      };

      const delta4 = {
        dataComponents: [
          {
            id: 'comp1',
            name: 'Component 1',
            props: { temp: '20', humidity: '80%' }, // Same as delta3 = stable
          },
        ],
      };

      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);
      await parser.processObjectDelta(delta3);
      await parser.processObjectDelta(delta4); // Make it stable

      // Should merge props and stream once when stable
      expect(mockArtifactParser.parseObject).toHaveBeenCalledWith(
        {
          dataComponents: [
            {
              id: 'comp1',
              name: 'Component 1',
              props: { temp: '20', humidity: '80%' },
            },
          ],
        },
        expect.any(Map), // artifactMap
        expect.any(String) // subAgentId
      );
    });

    it.skip('should handle large component payloads efficiently', async () => {
      const largeProps = Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [`prop${i}`, `value${i}`])
      );

      const delta1 = {
        dataComponents: [
          {
            id: 'large-comp',
            name: 'Large Component',
            props: largeProps,
          },
        ],
      };

      const delta2 = {
        dataComponents: [
          {
            id: 'large-comp',
            name: 'Large Component',
            props: largeProps, // Same = stable
          },
        ],
      };

      const startTime = Date.now();
      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2); // Make stable
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('Text component handling', () => {
    it('should stream Text components incrementally as text', async () => {
      const delta1 = {
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hello' } }],
      };

      const delta2 = {
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hello world' } }],
      };

      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);

      // Text components should stream incrementally as text
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('Hello', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith(' world', 50);
    });

    it.skip('should handle mixed Text and data components in order', async () => {
      const delta1 = {
        dataComponents: [
          { id: 'text1', name: 'Text', props: { text: 'Here is the weather:' } },
          { id: 'weather1', name: 'WeatherForecast', props: { temp: 72, condition: 'sunny' } },
        ],
      };

      const delta2 = {
        dataComponents: [
          { id: 'text1', name: 'Text', props: { text: 'Here is the weather:' } }, // Text stable
          { id: 'weather1', name: 'WeatherForecast', props: { temp: 72, condition: 'sunny' } }, // Weather stable
        ],
      };

      await parser.processObjectDelta(delta1);
      await parser.processObjectDelta(delta2);

      // Text should stream as text, weather as data component
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('Here is the weather:', 50);
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1); // Only weather component
      expect(mockStreamHelper.writeData).toHaveBeenCalledTimes(1);
    });
  });

  describe('component completion logic', () => {
    it.skip('should require id, name, and props for regular components', async () => {
      // Test incomplete components - these should not stream
      await parser.processObjectDelta({ dataComponents: [{}] });
      await parser.processObjectDelta({ dataComponents: [{ id: 'test' }] });
      await parser.processObjectDelta({ dataComponents: [{ id: 'test', name: 'Test' }] });

      // Test complete component that becomes stable
      const completeComponent1 = {
        dataComponents: [{ id: 'test', name: 'Test', props: { value: 'data' } }],
      };
      const completeComponent2 = {
        dataComponents: [{ id: 'test', name: 'Test', props: { value: 'data' } }],
      }; // Same = stable

      await parser.processObjectDelta(completeComponent1);
      await parser.processObjectDelta(completeComponent2);

      // Only the complete component should stream when stable
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });

    it.skip('should handle artifacts with special validation', async () => {
      // Test incomplete artifacts - these should not stream
      await parser.processObjectDelta({
        dataComponents: [{ id: 'art1', name: 'Artifact', props: {} }],
      });

      await parser.processObjectDelta({
        dataComponents: [{ id: 'art2', name: 'Artifact', props: { artifact_id: 'art123' } }],
      });

      // Test complete artifact that becomes stable
      const completeArtifact1 = {
        dataComponents: [
          {
            id: 'art3',
            name: 'Artifact',
            props: { artifact_id: 'art123', task_id: 'task456' },
          },
        ],
      };

      const completeArtifact2 = {
        dataComponents: [
          {
            id: 'art3',
            name: 'Artifact',
            props: { artifact_id: 'art123', task_id: 'task456' }, // Same = stable
          },
        ],
      };

      await parser.processObjectDelta(completeArtifact1);
      await parser.processObjectDelta(completeArtifact2);

      // Only the complete artifact should stream when stable
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('memory and performance', () => {
    it.skip('should not accumulate excessive memory with repeated deltas', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Process many deltas
      for (let i = 0; i < 1000; i++) {
        await parser.processObjectDelta({
          dataComponents: [{ id: `comp${i}`, name: `Component ${i}`, props: { value: i } }],
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it.skip('should handle rapid component updates without thrashing', async () => {
      const componentId = 'rapid-comp';
      const iterations = 99;

      const startTime = Date.now();

      // Process many changing deltas
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

      // Final stable delta
      await parser.processObjectDelta({
        dataComponents: [
          {
            id: componentId,
            name: 'Rapid Component',
            props: { counter: iterations - 1 }, // Same as last = stable
          },
        ],
      });

      const duration = Date.now() - startTime;

      // Should complete within reasonable time and only stream once when stable
      expect(duration).toBeLessThan(1000); // < 1 second
      expect(mockArtifactParser.parseObject).toHaveBeenCalledTimes(1);
    });
  });
});
