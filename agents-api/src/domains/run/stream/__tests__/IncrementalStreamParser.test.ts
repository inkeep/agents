import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactParser } from '../../artifacts/ArtifactParser';
import { IncrementalStreamParser } from '../IncrementalStreamParser';
import type { StreamHelper } from '../stream-helpers';

const refs = vi.hoisted(() => ({ mockLogger: null as any }));

// Mock dependencies
vi.mock('../../artifacts/ArtifactParser');
vi.mock('../../session/AgentSession', () => ({
  agentSessionManager: {
    getArtifactParser: vi.fn().mockReturnValue(null),
  },
}));
vi.mock('../../../../logger', async () => {
  const { createMockLoggerModule } = await import('@inkeep/agents-core/test-utils');
  const result = createMockLoggerModule();
  refs.mockLogger = result.mockLogger;
  return result.module;
});

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
      parseText: vi.fn().mockImplementation(async (text: string) => {
        if (!text) return [];
        return [{ kind: 'text', text }];
      }),
      hasIncompleteArtifact: vi.fn().mockReturnValue(false),
      getContextArtifacts: vi.fn().mockResolvedValue(new Map()),
    } as any;

    // Create mock constructor that returns the same mock instance
    vi.mocked(ArtifactParser).mockImplementation(() => mockArtifactParser);

    const mockExecutionContext = {
      apiKey: 'test-api-key',
      apiKeyId: 'test-api-key-id',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'test-agent',
      baseUrl: 'http://localhost:3000',
      resolvedRef: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
      project: {
        id: 'test-project',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: null,
        models: null,
        stopWhen: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        agents: {},
        tools: {},
        functionTools: {},
        functions: {},
        dataComponents: {},
        artifactComponents: {},
        externalAgents: {},
        credentialReferences: {},
        statusUpdates: null,
      },
    };

    parser = new IncrementalStreamParser(mockStreamHelper, mockExecutionContext, 'test-context', {
      sessionId: 'test-session',
      taskId: 'test-task',
      subAgentId: 'test-agent',
      streamRequestId: 'test-stream-request',
    });

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
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('Hello', 0);
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith(' world', 0);
    });

    it('inserts a \\n\\n separator between distinct Text components so they do not run together', async () => {
      // First Text component's initial snapshot.
      await parser.processObjectDelta({
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'First paragraph.' } }],
      });

      // Second Text component arrives as a new id — separator should fire before its text.
      await parser.processObjectDelta({
        dataComponents: [
          { id: 'text1', name: 'Text', props: { text: 'First paragraph.' } },
          { id: 'text2', name: 'Text', props: { text: 'Second paragraph.' } },
        ],
      });

      const calls = (mockStreamHelper.streamText as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0]
      );
      expect(calls).toEqual(['First paragraph.', '\n\n', 'Second paragraph.']);
    });

    it('does not insert a separator before the first Text component', async () => {
      await parser.processObjectDelta({
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Only paragraph.' } }],
      });

      const calls = (mockStreamHelper.streamText as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0]
      );
      expect(calls).toEqual(['Only paragraph.']);
    });

    it('does not insert a separator on incremental updates to the same Text component', async () => {
      await parser.processObjectDelta({
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hello' } }],
      });
      await parser.processObjectDelta({
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hello world' } }],
      });
      await parser.processObjectDelta({
        dataComponents: [{ id: 'text1', name: 'Text', props: { text: 'Hello world!' } }],
      });

      const calls = (mockStreamHelper.streamText as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0]
      );
      expect(calls).toEqual(['Hello', ' world', '!']);
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
      expect(mockStreamHelper.streamText).toHaveBeenCalledWith('Here is the weather:', 0);
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

  describe('write queue serialization', () => {
    it('serializes interleaved processTextChunk and processObjectDelta calls in enqueue order', async () => {
      const order: string[] = [];
      (mockStreamHelper.streamText as any).mockImplementation(async (text: string) => {
        order.push(text);
      });

      const p1 = parser.processTextChunk('A');
      const p2 = parser.processObjectDelta({
        dataComponents: [{ id: 't1', name: 'Text', props: { text: 'X' } }],
      });
      const p3 = parser.processTextChunk('B');
      const p4 = parser.processObjectDelta({
        dataComponents: [{ id: 't2', name: 'Text', props: { text: 'Y' } }],
      });
      const p5 = parser.processTextChunk('C');

      await Promise.all([p1, p2, p3, p4, p5]);

      // When transitioning between distinct Text components (t1 → t2), the parser emits a
      // '\n\n' paragraph separator so consecutive Text blocks don't render as one run-on
      // paragraph in Markdown.
      expect(order).toEqual(['A', 'X', 'B', '\n\n', 'Y', 'C']);
    });

    it('produces deterministic getCollectedParts ordering across repeated runs', async () => {
      const snapshots: string[] = [];

      for (let run = 0; run < 20; run++) {
        const mockStreamHelperLocal = {
          writeRole: vi.fn(),
          streamText: vi.fn(),
          writeData: vi.fn(),
        } as any;

        const mockExecutionContext = {
          apiKey: 'k',
          apiKeyId: 'id',
          tenantId: 't',
          projectId: 'p',
          agentId: 'a',
          baseUrl: 'http://localhost',
          resolvedRef: { name: 'main', type: 'branch' as const, hash: 'h' },
          project: {
            id: 'p',
            tenantId: 't',
            name: 'P',
            description: null,
            models: null,
            stopWhen: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            agents: {},
            tools: {},
            functionTools: {},
            functions: {},
            dataComponents: {},
            artifactComponents: {},
            externalAgents: {},
            credentialReferences: {},
            statusUpdates: null,
          },
        };

        const local = new IncrementalStreamParser(
          mockStreamHelperLocal,
          mockExecutionContext,
          'ctx',
          { subAgentId: 'a', streamRequestId: 'req' }
        );
        await local.initializeArtifactMap();

        const p1 = local.processTextChunk('one ');
        const p2 = local.processObjectDelta({
          dataComponents: [{ id: 'tA', name: 'Text', props: { text: 'two ' } }],
        });
        const p3 = local.processTextChunk('three ');
        const p4 = local.processObjectDelta({
          dataComponents: [{ id: 'tB', name: 'Text', props: { text: 'four ' } }],
        });
        const p5 = local.processTextChunk('five');

        await Promise.all([p1, p2, p3, p4, p5]);

        const parts = local
          .getCollectedParts()
          .map((p) => (p.kind === 'text' ? p.text : `data:${(p as any).data?.id ?? ''}`));
        snapshots.push(parts.join('|'));
      }

      const unique = new Set(snapshots);
      expect(unique.size).toBe(1);
    });

    it('calls writeRole exactly once across a batch of concurrent writes', async () => {
      const p1 = parser.processTextChunk('A');
      const p2 = parser.processObjectDelta({
        dataComponents: [{ id: 't1', name: 'Text', props: { text: 'X' } }],
      });
      const p3 = parser.processTextChunk('B');
      const p4 = parser.processObjectDelta({
        dataComponents: [{ id: 't2', name: 'Text', props: { text: 'Y' } }],
      });

      await Promise.all([p1, p2, p3, p4]);

      expect(mockStreamHelper.writeRole).toHaveBeenCalledTimes(1);
      expect(mockStreamHelper.writeRole).toHaveBeenCalledWith('assistant');
    });

    it('continues processing subsequent writes after an earlier write throws', async () => {
      (mockStreamHelper.streamText as any)
        .mockImplementationOnce(() => {
          throw new Error('boom');
        })
        .mockImplementation(async () => undefined);

      const p1 = parser.processTextChunk('A');
      const p2 = parser.processTextChunk('B');

      await expect(p1).rejects.toThrow('boom');
      await expect(p2).resolves.toBeUndefined();
    });

    it('logs an error on the queue chain when a write throws (no silent absorption)', async () => {
      refs.mockLogger.error.mockClear();

      (mockStreamHelper.streamText as any).mockImplementationOnce(() => {
        throw new Error('queue chain failure');
      });

      // Kick off a second write so the queue's .catch handler has a reason to flush
      // before we assert. p1 rejects; p2's then() chains after p1's .catch so p2
      // resolving guarantees the catch handler ran.
      const p1 = parser.processTextChunk('A');
      const p2 = parser.processTextChunk('B');

      await expect(p1).rejects.toThrow('queue chain failure');
      await expect(p2).resolves.toBeUndefined();

      expect(refs.mockLogger.error).toHaveBeenCalled();
      const writeQueueCalls = refs.mockLogger.error.mock.calls.filter(
        (c: any[]) => typeof c[1] === 'string' && c[1].includes('writeQueue entry failed')
      );
      expect(writeQueueCalls.length).toBeGreaterThanOrEqual(1);
      expect(writeQueueCalls[0][0]).toMatchObject({
        op: 'processTextChunk',
        contextId: 'test-context',
      });
    });

    it('keeps hasStartedRole, collectedParts, and allStreamedContent internally consistent under interleaved writes', async () => {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(parser.processTextChunk(`t${i}`));
        promises.push(
          parser.processObjectDelta({
            dataComponents: [{ id: `c${i}`, name: 'Text', props: { text: `d${i}` } }],
          })
        );
      }
      await Promise.all(promises);

      const collected = parser.getCollectedParts();
      const streamed = parser.getAllStreamedContent();

      expect(mockStreamHelper.writeRole).toHaveBeenCalledTimes(1);
      expect(collected.length).toBeGreaterThan(0);
      expect(streamed.length).toBeGreaterThan(0);
      for (const part of collected) {
        expect(['text', 'data']).toContain(part.kind);
      }
    });
  });
});
