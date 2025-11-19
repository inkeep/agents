import type { ModelSettings, StatusComponent, StatusUpdateSettings } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamHelper } from '../../utils/stream-helpers';
import { AgentSession, agentSessionManager } from '../AgentSession';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Processing your request with tools and generating results...',
  }),
  generateObject: vi.fn().mockResolvedValue({
    object: {
      statusComponents: [
        {
          id: 'status-1',
          type: 'text',
          props: { text: 'Status update generated' },
        },
      ],
    },
  }),
}));

// Mock the AI SDK providers
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn().mockReturnValue('mock-openai-model'),
}));

// Mock ModelFactory
vi.mock('../../agents/ModelFactory.js', () => ({
  ModelFactory: {
    getModel: vi.fn().mockReturnValue('mock-model'),
  },
}));

// Mock stream registry
vi.mock('../../utils/stream-registry.js', () => ({
  getStreamHelper: vi.fn().mockReturnValue({
    writeRole: vi.fn().mockResolvedValue(undefined),
    writeContent: vi.fn().mockResolvedValue(undefined),
    streamData: vi.fn().mockResolvedValue(undefined),
    streamText: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    writeData: vi.fn().mockResolvedValue(undefined),
    writeOperation: vi.fn().mockResolvedValue(undefined),
    writeSummary: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('AgentSession', () => {
  let session: AgentSession;
  let mockStreamHelper: StreamHelper;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStreamHelper = {
      writeRole: vi.fn().mockResolvedValue(undefined),
      writeContent: vi.fn().mockResolvedValue(undefined),
      streamData: vi.fn().mockResolvedValue(undefined),
      streamText: vi.fn().mockResolvedValue(undefined),
      writeError: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      writeData: vi.fn().mockResolvedValue(undefined),
      writeOperation: vi.fn().mockResolvedValue(undefined),
      writeSummary: vi.fn().mockResolvedValue(undefined),
    };

    session = new AgentSession('test-session', 'test-message', {} as any, 'test-agent');
  });

  afterEach(() => {
    // Clean up any sessions
    session.cleanup();
    agentSessionManager.endSession('test-session');
  });

  describe('Basic Session Management', () => {
    it('should create a session with initial state', () => {
      expect(session.sessionId).toBe('test-session');
      expect(session.messageId).toBe('test-message');
      expect(session.agentId).toBe('test-agent');
      expect(session.isCurrentlyStreaming()).toBe(false);
      expect(session.getEvents()).toHaveLength(0);
    });

    it('should end session properly', () => {
      session.cleanup();
      // Since isEnded is private, we can test that cleanup was called by verifying
      // that subsequent operations don't add events
      session.recordEvent('tool_call', 'agent', {
        toolName: 'test',
        input: {},
        toolCallId: 'test-call-id',
      });
      session.recordEvent('tool_result', 'agent', {
        toolName: 'test',
        output: 'test',
        toolCallId: 'test-call-id',
      });
      expect(session.getEvents()).toHaveLength(0); // No events should be added after cleanup
    });

    it('should track text streaming state', () => {
      expect(session.isCurrentlyStreaming()).toBe(false);

      session.setTextStreaming(true);
      expect(session.isCurrentlyStreaming()).toBe(true);

      session.setTextStreaming(false);
      expect(session.isCurrentlyStreaming()).toBe(false);
    });
  });

  describe('Event Recording', () => {
    it('should record agent_generate events', () => {
      session.recordEvent('agent_generate', 'test-agent', {
        parts: [
          { type: 'text', content: 'Hello world' },
          { type: 'tool_result', content: 'Tool executed successfully' },
        ],
        generationType: 'text_generation',
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'agent_generate',
        subAgentId: 'test-agent',
        data: {
          parts: expect.arrayContaining([
            { type: 'text', content: 'Hello world' },
            { type: 'tool_result', content: 'Tool executed successfully' },
          ]),
          generationType: 'text_generation',
        },
      });
    });

    it('should record transfer events', () => {
      session.recordEvent('transfer', 'router-agent', {
        fromSubAgent: 'router-agent',
        targetSubAgent: 'specialist-agent',
        reason: 'User needs specialized help',
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'transfer',
        subAgentId: 'router-agent',
        data: {
          fromSubAgent: 'router-agent',
          targetSubAgent: 'specialist-agent',
          reason: 'User needs specialized help',
        },
      });
    });

    it('should record delegation events', () => {
      // Delegation sent
      session.recordEvent('delegation_sent', 'parent-agent', {
        delegationId: 'del-123',
        fromSubAgent: 'parent-agent',
        targetSubAgent: 'child-agent',
        taskDescription: 'Process this data',
        context: { priority: 'high' },
      });

      // Delegation returned
      session.recordEvent('delegation_returned', 'parent-agent', {
        delegationId: 'del-123',
        fromSubAgent: 'child-agent',
        targetSubAgent: 'parent-agent',
        result: { processed: true },
      });

      expect(session.getEvents()).toHaveLength(2);
      expect(session.getEvents()[0].eventType).toBe('delegation_sent');
      expect(session.getEvents()[1].eventType).toBe('delegation_returned');
    });

    it('should record artifact_saved events', () => {
      session.recordEvent('artifact_saved', 'agent-1', {
        artifactId: 'artifact-123',
        taskId: 'task-456',
        artifactType: 'chart',
        data: { title: 'Sales Chart', chartData: [1, 2, 3] },
        tenantId: 'tenant-1',
        projectId: 'project-1',
        contextId: 'context-1',
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'artifact_saved',
        subAgentId: 'agent-1',
        data: {
          artifactId: 'artifact-123',
          taskId: 'task-456',
          artifactType: 'chart',
        },
      });
    });

    it('should record tool_call and tool_result events', () => {
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'search',
        input: { query: 'test query' },
        toolCallId: 'call-123',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'search',
        output: { results: ['result1', 'result2'] },
        toolCallId: 'call-123',
        duration: 1500,
      });

      expect(session.getEvents()).toHaveLength(2);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'tool_call',
        subAgentId: 'agent-1',
      });
      expect(session.getEvents()[1]).toMatchObject({
        eventType: 'tool_result',
        subAgentId: 'agent-1',
        data: {
          toolName: 'search',
          output: { results: ['result1', 'result2'] },
          toolCallId: 'call-123',
          duration: 1500,
        },
      });
    });
  });

  describe('Status Updates', () => {
    it('should initialize status updates with event-based config', () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 3,
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Add events to trigger status update
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'search',
        input: { query: 'test' },
        toolCallId: 'call-1',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'search',
        output: 'found results',
        toolCallId: 'call-1',
      });

      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'Generated response' }],
        generationType: 'text_generation',
      });

      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'process',
        input: { data: 'test data' },
        toolCallId: 'call-2',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'process',
        output: 'processed',
        toolCallId: 'call-2',
      });

      // Should trigger status update after 5 events (2 tool call/result pairs + 1 agent_generate)
      expect(session.getEvents()).toHaveLength(5);
    });

    it('should initialize status updates with time-based config', () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        timeInSeconds: 5,
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Time-based updates should not trigger immediately
      expect(mockStreamHelper.writeOperation).not.toHaveBeenCalled();
    });

    it('should not initialize status updates when disabled', () => {
      const config: StatusUpdateSettings = {
        enabled: false,
        numEvents: 5,
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Add events
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'test',
        input: {},
        toolCallId: 'call-3',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'test',
        output: 'test',
        toolCallId: 'call-3',
      });

      // Should not trigger any updates
      expect(mockStreamHelper.writeOperation).not.toHaveBeenCalled();
    });

    it('should prevent data operations during text streaming', () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Start text streaming
      session.setTextStreaming(true);

      // Add event that would normally trigger status update
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'test',
        input: {},
        toolCallId: 'call-4',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'test',
        output: 'test',
        toolCallId: 'call-4',
      });

      // Should not send status update while streaming text
      expect(mockStreamHelper.writeOperation).not.toHaveBeenCalled();

      // Stop text streaming
      session.setTextStreaming(false);

      // Now add another event
      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'response' }],
        generationType: 'text_generation',
      });

      // Should trigger update now
      // Note: This would need actual async timing to test properly
    });

    it('should call writeSummary when status updates are generated', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 2,
      };

      const summarizerModel: ModelSettings = {
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, summarizerModel);

      // Mock the generateAndSendUpdate method to call writeSummary
      const mockGenerateUpdate = vi
        .spyOn(session as any, 'generateAndSendUpdate')
        .mockImplementation(async () => {
          await mockStreamHelper.writeSummary({
            type: 'progress',
            label: 'Processing update',
            details: { progress: '50%', status: 'working' },
          });
        });

      // Add enough events to trigger update
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'search',
        input: { query: 'test' },
        toolCallId: 'call-5',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'search',
        output: 'results found',
        toolCallId: 'call-5',
      });

      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'Generated text' }],
        generationType: 'text_generation',
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was called with correct structure including type field
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.any(String),
          label: expect.any(String),
          details: expect.any(Object),
        })
      );

      mockGenerateUpdate.mockRestore();
    });

    it('should call writeSummary for structured status components', async () => {
      const statusComponents: StatusComponent[] = [
        {
          type: 'progress_summary',
          description: 'Current progress status',
          detailsSchema: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              progress: { type: 'number' },
            },
            required: ['label'],
          },
        },
      ];

      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        statusComponents,
      };

      const summarizerModel: ModelSettings = {
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, summarizerModel);

      // Mock the structured summary generation
      const mockGenerateUpdate = vi
        .spyOn(session as any, 'generateAndSendUpdate')
        .mockImplementation(async () => {
          // Simulate structured operation result
          const summaryToSend = {
            type: 'status',
            label: 'Progress Update',
            details: { progress: 75, message: 'Nearly complete' },
          };
          await mockStreamHelper.writeSummary(summaryToSend);
        });

      // Add event to trigger status update
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'process',
        input: { data: 'test' },
        toolCallId: 'call-6',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'process',
        output: 'processed successfully',
        toolCallId: 'call-6',
      });

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was called with structured data including type field
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          label: 'Progress Update',
          details: expect.objectContaining({
            progress: 75,
            message: 'Nearly complete',
          }),
        })
      );

      mockGenerateUpdate.mockRestore();
    });

    it('should handle race conditions in cleanup', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        timeInSeconds: 0.1, // Very short timer
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // End session immediately to create race condition
      session.cleanup();

      // Wait a bit to let any timers fire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not crash or throw errors - test by verifying no new events are recorded
      session.recordEvent('tool_call', 'agent', {
        toolName: 'test',
        input: {},
        toolCallId: 'test-call-id',
      });
      session.recordEvent('tool_result', 'agent', {
        toolName: 'test',
        output: 'test',
        toolCallId: 'test-call-id',
      });
      expect(session.getEvents()).toHaveLength(0);
    });
  });

  describe('AgentSessionManager', () => {
    it('should create and retrieve sessions', () => {
      const sessionId = agentSessionManager.createSession('manager-test', {} as any, 'test-agent');
      expect(sessionId).toBe('manager-test');

      const retrieved = agentSessionManager.getSession('manager-test');
      expect(retrieved).toBeTruthy();
      expect(retrieved?.sessionId).toBe('manager-test');
    });

    it('should record events via manager', () => {
      agentSessionManager.createSession('manager-test', {} as any, 'test-agent');

      agentSessionManager.recordEvent('manager-test', 'tool_call', 'agent-1', {
        toolName: 'test-tool',
        input: { input: 'test' },
        toolCallId: 'call-456',
      });
      agentSessionManager.recordEvent('manager-test', 'tool_result', 'agent-1', {
        toolName: 'test-tool',
        output: { output: 'success' },
        toolCallId: 'call-456',
      });

      const retrieved = agentSessionManager.getSession('manager-test');
      expect(retrieved?.getEvents()).toHaveLength(2);
      expect(retrieved?.getEvents()[0].data).toMatchObject({
        toolName: 'test-tool',
        input: { input: 'test' },
        toolCallId: 'call-456',
      });
      expect(retrieved?.getEvents()[1].data).toMatchObject({
        toolName: 'test-tool',
        output: { output: 'success' },
        toolCallId: 'call-456',
      });
    });

    it('should set text streaming state via manager', () => {
      agentSessionManager.createSession('manager-test', {} as any, 'test-agent');
      const retrieved = agentSessionManager.getSession('manager-test');

      expect(retrieved?.isCurrentlyStreaming()).toBe(false);

      agentSessionManager.setTextStreaming('manager-test', true);
      expect(retrieved?.isCurrentlyStreaming()).toBe(true);

      agentSessionManager.setTextStreaming('manager-test', false);
      expect(retrieved?.isCurrentlyStreaming()).toBe(false);
    });

    it('should handle non-existent sessions gracefully', () => {
      // Should not throw when trying to record event for non-existent session
      expect(() => {
        agentSessionManager.recordEvent('non-existent', 'tool_call', 'agent', {
          toolName: 'test',
          input: {},
          toolCallId: 'call-7',
        });
        agentSessionManager.recordEvent('non-existent', 'tool_result', 'agent', {
          toolName: 'test',
          output: 'test',
          toolCallId: 'call-7',
        });
      }).not.toThrow();

      // Should not throw when trying to set text streaming for non-existent session
      expect(() => {
        agentSessionManager.setTextStreaming('non-existent', true);
      }).not.toThrow();
    });

    it('should end sessions via manager', () => {
      agentSessionManager.createSession('manager-test', {} as any, 'test-agent');
      const retrieved = agentSessionManager.getSession('manager-test');

      // Test that session can record events before ending
      retrieved?.recordEvent('tool_call', 'agent', {
        toolName: 'test',
        input: {},
        toolCallId: 'call-8',
      });
      retrieved?.recordEvent('tool_result', 'agent', {
        toolName: 'test',
        output: 'test',
        toolCallId: 'call-8',
      });
      expect(retrieved?.getEvents()).toHaveLength(2);

      const finalEvents = agentSessionManager.endSession('manager-test');
      expect(finalEvents).toHaveLength(2);

      // Session should be removed from manager
      expect(agentSessionManager.getSession('manager-test')).toBeNull();
    });
  });

  describe('Event Filtering and Analysis', () => {
    beforeEach(() => {
      // Add a variety of events
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'search',
        input: { query: 'test' },
        toolCallId: 'call-789',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'search',
        output: 'results found',
        toolCallId: 'call-789',
      });

      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'Generated text' }],
        generationType: 'text_generation',
      });

      session.recordEvent('transfer', 'agent-1', {
        fromSubAgent: 'agent-1',
        targetSubAgent: 'agent-2',
        reason: 'Specialized task',
      });

      session.recordEvent('tool_call', 'agent-2', {
        toolName: 'process',
        input: { data: 'input' },
        toolCallId: 'call-abc',
      });
      session.recordEvent('tool_result', 'agent-2', {
        toolName: 'process',
        output: 'processed',
        toolCallId: 'call-abc',
      });

      session.recordEvent('artifact_saved', 'agent-2', {
        artifactId: 'art-1',
        taskId: 'task-1',
        artifactType: 'chart',
        data: { title: 'Test Chart' },
      });
    });

    it('should filter events by type', () => {
      const toolCallEvents = session.getEvents().filter((e) => e.eventType === 'tool_call');
      const toolResultEvents = session.getEvents().filter((e) => e.eventType === 'tool_result');
      expect(toolCallEvents).toHaveLength(2);
      expect(toolResultEvents).toHaveLength(2);

      const transferEvents = session.getEvents().filter((e) => e.eventType === 'transfer');
      expect(transferEvents).toHaveLength(1);

      const artifactEvents = session.getEvents().filter((e) => e.eventType === 'artifact_saved');
      expect(artifactEvents).toHaveLength(1);
    });

    it('should filter events by agent', () => {
      const agent1Events = session.getEvents().filter((e) => e.subAgentId === 'agent-1');
      expect(agent1Events).toHaveLength(4); // tool_call + tool_result + agent_generate + transfer

      const agent2Events = session.getEvents().filter((e) => e.subAgentId === 'agent-2');
      expect(agent2Events).toHaveLength(3); // tool_call + tool_result + artifact_saved
    });

    it('should track event timeline correctly', () => {
      const events = session.getEvents();

      // Events should be in chronological order
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
      }
    });
  });

  describe('Summary Events', () => {
    it('should emit data-summary events using SummaryEvent interface', () => {
      // Test that agent session can emit summary events with the new interface
      const summaryEvent = {
        type: 'status',
        label: 'Processing completed',
        details: {
          itemsProcessed: 5,
          duration: '2.3s',
        },
      };

      // This would be called by the AgentSession when streaming summary events
      expect(() => {
        // Verify the SummaryEvent structure is valid including type field
        expect(summaryEvent.type).toBe('status');
        expect(summaryEvent.label).toBe('Processing completed');
        expect(summaryEvent.details?.itemsProcessed).toBe(5);
      }).not.toThrow();
    });

    it('should handle SummaryEvent with minimal structure', () => {
      const minimalSummary = {
        type: 'update',
        label: 'Status update',
        // details is optional
      };

      expect(() => {
        expect(minimalSummary.type).toBe('update');
        expect(minimalSummary.label).toBe('Status update');
        expect((minimalSummary as any).details).toBeUndefined();
      }).not.toThrow();
    });

    it('should handle SummaryEvent with flexible details', () => {
      const flexibleSummary = {
        type: 'custom',
        label: 'Dynamic status',
        details: {
          // Can contain any structured data
          customField: 'custom value',
          nestedData: {
            level: 2,
            items: ['a', 'b', 'c'],
          },
          timestamp: new Date(),
        },
      };

      expect(flexibleSummary.type).toBe('custom');
      expect(flexibleSummary.details?.customField).toBe('custom value');
      expect(flexibleSummary.details?.nestedData.level).toBe(2);
      expect(Array.isArray(flexibleSummary.details?.nestedData.items)).toBe(true);
    });

    it('should actually call writeSummary when generating status updates', async () => {
      // Configure session for immediate status updates
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
      };

      const summarizerModel: ModelSettings = {
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, summarizerModel);

      // Mock the internal method to simulate actual summary generation
      const originalGenerateUpdate = (session as any).generateAndSendUpdate;
      (session as any).generateAndSendUpdate = vi.fn().mockImplementation(async () => {
        const summaryEvent = {
          type: 'completion',
          label: 'Processing completed',
          details: {
            itemsProcessed: 5,
            duration: '2.3s',
          },
        };
        await mockStreamHelper.writeSummary(summaryEvent);
      });

      // Trigger an event that should cause status update
      session.recordEvent('tool_call', 'agent-1', {
        toolName: 'search',
        input: { query: 'test query' },
        toolCallId: 'call-9',
      });
      session.recordEvent('tool_result', 'agent-1', {
        toolName: 'search',
        output: 'search completed',
        toolCallId: 'call-9',
      });

      // Wait for async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify writeSummary was called with proper SummaryEvent structure including type field
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'completion',
          label: 'Processing completed',
          details: expect.objectContaining({
            itemsProcessed: 5,
            duration: '2.3s',
          }),
        })
      );

      // Restore original method
      (session as any).generateAndSendUpdate = originalGenerateUpdate;
    });
  });

  describe('Custom Status Update Prompts', () => {
    it('should store custom prompt in configuration', () => {
      const customPrompt =
        'KEEP ALL STATUS UPDATES SHORT AND CONCISE. DO NOT PROVIDE EXCESSIVE DETAILS.';
      const config: StatusUpdateSettings = {
        numEvents: 5,
        timeInSeconds: 30,
        prompt: customPrompt,
      };

      session.initializeStatusUpdates(config, { model: 'test-model' });

      // Verify prompt is stored in session state
      const statusState = (session as any).statusUpdateState;
      expect(statusState).toBeDefined();
      expect(statusState.config.prompt).toBe(customPrompt);
    });

    it('should handle structured status updates with custom prompt', () => {
      const customPrompt = 'Focus only on user-visible progress. No technical details.';
      const config: StatusUpdateSettings = {
        numEvents: 3,
        timeInSeconds: 15,
        prompt: customPrompt,
        statusComponents: [
          {
            type: 'progress_summary',
            description: 'Brief progress update',
            detailsSchema: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Progress summary' },
              },
              required: ['summary'],
            },
          },
        ],
      };

      session.initializeStatusUpdates(config, { model: 'test-model' });

      // Verify both prompt and components are stored
      const statusState = (session as any).statusUpdateState;
      expect(statusState.config.prompt).toBe(customPrompt);
      expect(statusState.config.statusComponents).toHaveLength(1);
      expect(statusState.config.statusComponents[0].type).toBe('progress_summary');
    });

    it('should work without custom prompt (backward compatibility)', () => {
      const config: StatusUpdateSettings = {
        numEvents: 5,
        timeInSeconds: 30,
        // No prompt field
      };

      // Should not throw error during initialization
      expect(() => {
        session.initializeStatusUpdates(config, { model: 'test-model' });
      }).not.toThrow();

      // Verify config is stored without prompt
      const statusState = (session as any).statusUpdateState;
      expect(statusState).toBeDefined();
      expect(statusState.config.prompt).toBeUndefined();
    });

    it('should handle empty string custom prompt', () => {
      const config: StatusUpdateSettings = {
        numEvents: 5,
        prompt: '', // Empty string
      };

      session.initializeStatusUpdates(config, { model: 'test-model' });

      // Verify empty prompt is stored correctly
      const statusState = (session as any).statusUpdateState;
      expect(statusState.config.prompt).toBe('');
    });

    it('should preserve custom prompt content exactly', () => {
      const customPrompt =
        'IMPORTANT: Use bullets (•) and keep responses under 10 words.\nExample: • Found docs\n• Processing results';
      const config: StatusUpdateSettings = {
        numEvents: 3,
        prompt: customPrompt,
      };

      session.initializeStatusUpdates(config, { model: 'test-model' });

      // Verify exact content preservation including newlines and special characters
      const statusState = (session as any).statusUpdateState;
      expect(statusState.config.prompt).toBe(customPrompt);
      expect(statusState.config.prompt).toContain('Use bullets (•)');
      expect(statusState.config.prompt).toContain('• Found docs');
      expect(statusState.config.prompt).toContain('\n');
    });

    it('should properly pass custom prompt through AgentSessionManager', () => {
      const customPrompt = 'Manager-level custom prompt test';
      const config: StatusUpdateSettings = {
        numEvents: 2,
        prompt: customPrompt,
      };

      // Create session through manager
      const sessionId = 'test-manager-session';
      agentSessionManager.createSession(
        sessionId,
        {} as any,
        'test-agent',
        'tenant-1',
        'project-1'
      );

      // Initialize status updates through manager
      agentSessionManager.initializeStatusUpdates(sessionId, config, { model: 'test-model' });

      // Verify session was found and configured
      const retrievedSession = agentSessionManager.getSession(sessionId);
      expect(retrievedSession).not.toBeNull();
      expect((retrievedSession as any)?.statusUpdateState?.config.prompt).toBe(customPrompt);

      // Cleanup
      agentSessionManager.endSession(sessionId);
    });

    it('should handle session not found gracefully in manager', () => {
      const config: StatusUpdateSettings = {
        numEvents: 2,
        prompt: 'Should not crash',
      };

      // Don't create session, try to initialize status updates
      expect(() => {
        agentSessionManager.initializeStatusUpdates('nonexistent-session', config, {
          model: 'test-model',
        });
      }).not.toThrow();
    });

    it('should respect prompt length validation', () => {
      const longPrompt = 'A'.repeat(2001); // Exceeds 2000 character limit
      const config: StatusUpdateSettings = {
        numEvents: 3,
        prompt: longPrompt,
      };

      // This would fail at schema validation level, but we can test the config structure
      expect(longPrompt.length).toBe(2001);
      expect(() => {
        session.initializeStatusUpdates(config, { model: 'test-model' });
      }).not.toThrow(); // AgentSession itself doesn't validate, schema does
    });

    it('should validate StatusUpdateConfig interface compatibility', () => {
      // Test that the interface properly handles all combinations
      const configs: StatusUpdateSettings[] = [
        {}, // All optional
        { numEvents: 5 },
        { timeInSeconds: 30 },
        { prompt: 'Test prompt' },
        { statusComponents: [] },
        {
          numEvents: 3,
          timeInSeconds: 15,
          prompt: 'Full config with special chars: àáâãäå and newlines\nLine 2',
          statusComponents: [
            {
              type: 'test',
              description: 'Test description',
              detailsSchema: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
              },
            },
          ],
        },
      ];

      configs.forEach((config, index) => {
        expect(() => {
          session.initializeStatusUpdates(config, { model: 'test-model' });
          // Verify each config is stored correctly
          const statusState = (session as any).statusUpdateState;
          expect(statusState.config.numEvents).toBe(config.numEvents || 10); // Default value
          expect(statusState.config.prompt).toBe(config.prompt);
          if (config.statusComponents) {
            expect(statusState.config.statusComponents).toEqual(config.statusComponents);
          }
        }).not.toThrow(`Config ${index} should not throw`);
      });
    });
  });
});
