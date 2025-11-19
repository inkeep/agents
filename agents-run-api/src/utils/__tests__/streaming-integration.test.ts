import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactParser } from '../../services/ArtifactParser';
import { IncrementalStreamParser } from '../../services/IncrementalStreamParser';
import type { StreamHelper } from '../stream-helpers';

// Mock dependencies
vi.mock('../../services/ArtifactParser');
vi.mock('../../services/AgentSession', () => ({
  agentSessionManager: {
    getArtifactParser: vi.fn().mockReturnValue(null), // Return null to force fallback to new parser
  },
}));
vi.mock('../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Streaming Integration Tests', () => {
  let parser: IncrementalStreamParser;
  let mockStreamHelper: StreamHelper;
  let mockArtifactParser: ArtifactParser;
  let streamOrder: string[];

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    streamOrder = [];

    // Mock StreamHelper with order tracking
    mockStreamHelper = {
      writeRole: vi.fn(),
      streamText: vi.fn((text: string) => {
        streamOrder.push(`TEXT: ${text}`);
        return Promise.resolve();
      }),
      writeData: vi.fn((type: string, data: any) => {
        streamOrder.push(`DATA[${type}]: ${data.id || data.name || 'unknown'}`);
        return Promise.resolve();
      }),
    } as any;

    // Mock ArtifactParser
    mockArtifactParser = {
      parseObject: vi.fn().mockImplementation((obj, _artifactMap, _subAgentId) => {
        // Only return artifacts for components that are complete and stable
        const components = obj.dataComponents || [];
        const results = [];

        for (const component of components) {
          if (component?.id && component.name && component.props) {
            results.push({
              kind: 'data',
              data: { id: component.id, name: component.name, props: component.props },
            });
          }
        }

        return Promise.resolve(results);
      }),
      hasIncompleteArtifact: vi.fn().mockReturnValue(false),
      getContextArtifacts: vi.fn().mockResolvedValue(new Map()),
    } as any;

    // Reset and re-implement the mock for each test
    (ArtifactParser as any).mockReset();
    (ArtifactParser as any).mockImplementation(() => mockArtifactParser);

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

  describe('Real-world streaming scenarios', () => {
    it.skip('should handle a complete weather response flow', async () => {
      // Simulate real LLM streaming pattern for weather response
      const deltas = [
        // Initial empty structure
        { dataComponents: [{}] },

        // Text component starts
        { dataComponents: [{ id: 'intro' }] },
        { dataComponents: [{ id: 'intro', name: 'Text' }] },
        { dataComponents: [{ id: 'intro', name: 'Text', props: { text: 'Here' } }] },
        { dataComponents: [{ id: 'intro', name: 'Text', props: { text: 'Here is' } }] },
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
          ],
        },
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
          ],
        }, // Stable

        // Weather component appears
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
            { id: 'weather', name: 'WeatherForecast', props: { temp: 72 } },
          ],
        },
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
            { id: 'weather', name: 'WeatherForecast', props: { temp: 72, condition: 'sunny' } },
          ],
        },
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
            { id: 'weather', name: 'WeatherForecast', props: { temp: 72, condition: 'sunny' } }, // Stable
          ],
        },

        // Closing text
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
            { id: 'weather', name: 'WeatherForecast', props: { temp: 72, condition: 'sunny' } },
            { id: 'outro', name: 'Text', props: { text: 'Have a great day!' } },
          ],
        },
        {
          dataComponents: [
            { id: 'intro', name: 'Text', props: { text: 'Here is the weather forecast:' } },
            { id: 'weather', name: 'WeatherForecast', props: { temp: 72, condition: 'sunny' } },
            { id: 'outro', name: 'Text', props: { text: 'Have a great day!' } }, // Stable
          ],
        },
      ];

      // Process all deltas
      for (const delta of deltas) {
        await parser.processObjectDelta(delta);
      }

      // Verify streaming order
      expect(streamOrder).toEqual([
        'TEXT: Here',
        'TEXT:  is',
        'TEXT:  the weather forecast:',
        'DATA[data-component]: weather', // Weather component
        'TEXT: Have a great day!',
      ]);
    });

    it('should handle rapid text updates with character-by-character streaming', async () => {
      const textUpdates = [
        'H',
        'He',
        'Hel',
        'Hell',
        'Hello',
        'Hello ',
        'Hello w',
        'Hello wo',
        'Hello wor',
        'Hello worl',
        'Hello world',
        'Hello world!',
      ];

      for (let i = 0; i < textUpdates.length; i++) {
        await parser.processObjectDelta({
          dataComponents: [{ id: 'text1', name: 'Text', props: { text: textUpdates[i] } }],
        });
      }

      // Should stream incremental text changes character by character
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('H', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('e', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('l', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('l', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('o', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith(' ', 50); // Space should now be preserved!
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('w', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('o', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('r', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('l', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('d', 50);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('!', 50);

      // Should stream every character change
      expect(mockStreamHelper.streamText).toHaveBeenCalledTimes(textUpdates.length);
    });

    it.skip('should handle components appearing and disappearing from deltas', async () => {
      // Component appears, then disappears, then reappears
      const deltas = [
        { dataComponents: [{ id: 'comp1', name: 'Test', props: { value: 'test1' } }] },
        {
          dataComponents: [
            { id: 'comp1', name: 'Test', props: { value: 'test1' } },
            { id: 'comp2', name: 'Test', props: { value: 'test2' } },
          ],
        },
        {
          dataComponents: [
            { id: 'comp1', name: 'Test', props: { value: 'test1' } }, // comp2 disappeared
          ],
        },
        {
          dataComponents: [
            { id: 'comp1', name: 'Test', props: { value: 'test1' } }, // comp1 stable
          ],
        },
      ];

      for (const delta of deltas) {
        await parser.processObjectDelta(delta);
      }

      // comp1 should stream when stable, comp2 might stream when it disappears if complete
      expect(mockArtifactParser.parseObject).toHaveBeenCalledWith(
        {
          dataComponents: [{ id: 'comp1', name: 'Test', props: { value: 'test1' } }],
        },
        expect.any(Map), // artifactMap
        expect.any(String) // subAgentId
      );
    });
  });

  describe('Performance under load', () => {
    it('should handle many rapid deltas efficiently', async () => {
      const startTime = Date.now();

      // Simulate 1000 rapid deltas
      for (let i = 0; i < 1000; i++) {
        await parser.processObjectDelta({
          dataComponents: [{ id: `comp${i}`, name: 'Test', props: { value: i } }],
        });
      }

      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });
  });
});
