import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toolSessionManager } from '../../agents/ToolSessionManager';
import type { ArtifactSavedData } from '../AgentSession';
import { agentSessionManager } from '../AgentSession';
import { ArtifactService } from '../ArtifactService';

vi.mock('../../agents/ToolSessionManager');
vi.mock('../AgentSession');

describe('Oversized Artifact Detection', () => {
  const mockExecutionContext = {
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    resolvedRef: { ref: 'main', branchId: 'main' },
    project: { id: 'test-project', name: 'Test Project' },
    apiKey: 'test-key',
    baseUrl: 'http://localhost',
    apiKeyId: 'test-key-id',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect oversized artifacts when contextWindowSize is provided', async () => {
    const artifactService = new ArtifactService({
      executionContext: mockExecutionContext,
      sessionId: 'test-session',
      taskId: 'test-task',
      contextId: 'test-context',
      streamRequestId: 'test-stream',
    });

    // Create a large result (>30% of 100K context window = >30K tokens = >120K chars)
    const largeResult = 'x'.repeat(150000); // ~37.5K tokens

    const mockToolResult = {
      toolCallId: 'test-tool-call',
      toolName: 'test-tool',
      args: { query: 'test query' },
      result: largeResult,
      timestamp: Date.now(),
    };

    vi.mocked(toolSessionManager.getToolResult).mockReturnValue(mockToolResult);
    vi.mocked(agentSessionManager.recordEvent).mockResolvedValue(undefined);
    vi.mocked(agentSessionManager.setArtifactCache).mockResolvedValue(undefined);

    const request = {
      artifactId: 'test-artifact',
      toolCallId: 'test-tool-call',
      type: 'TestType',
      baseSelector: '@',
    };

    const result = await artifactService.createArtifact(
      request,
      'test-agent',
      100000 // 100K context window
    );

    expect(result).toBeTruthy();

    // Verify that recordEvent was called with oversized metadata
    const recordEventCall = vi.mocked(agentSessionManager.recordEvent).mock.calls[0];
    expect(recordEventCall).toBeDefined();

    const eventData = recordEventCall[3] as ArtifactSavedData; // The data parameter
    expect(eventData.metadata?.isOversized).toBe(true);
    expect(eventData.metadata?.retrievalBlocked).toBe(true);
    expect(eventData.metadata?.toolArgs).toEqual({ query: 'test query' });
    expect(eventData.metadata?.originalTokenSize).toBeGreaterThan(30000);
    expect(eventData.metadata?.contextWindowSize).toBe(100000);

    // Verify enhanced summary data
    expect(eventData.summaryData?._oversizedWarning).toContain('OVERSIZED');
    expect(eventData.summaryData?._structureInfo).toBeDefined();
  });

  it('should not mark small artifacts as oversized', async () => {
    const artifactService = new ArtifactService({
      executionContext: mockExecutionContext,
      sessionId: 'test-session',
      taskId: 'test-task',
      contextId: 'test-context',
      streamRequestId: 'test-stream',
    });

    // Create a small result
    const smallResult = { data: 'small result' };

    const mockToolResult = {
      toolCallId: 'test-tool-call',
      toolName: 'test-tool',
      args: { query: 'test query' },
      result: smallResult,
      timestamp: Date.now(),
    };

    vi.mocked(toolSessionManager.getToolResult).mockReturnValue(mockToolResult);
    vi.mocked(agentSessionManager.recordEvent).mockResolvedValue(undefined);
    vi.mocked(agentSessionManager.setArtifactCache).mockResolvedValue(undefined);

    const request = {
      artifactId: 'test-artifact',
      toolCallId: 'test-tool-call',
      type: 'TestType',
      baseSelector: '@',
    };

    const result = await artifactService.createArtifact(
      request,
      'test-agent',
      100000 // 100K context window
    );

    expect(result).toBeTruthy();

    // Verify that recordEvent was called WITHOUT oversized metadata
    const recordEventCall = vi.mocked(agentSessionManager.recordEvent).mock.calls[0];
    expect(recordEventCall).toBeDefined();

    const eventData = recordEventCall[3] as ArtifactSavedData;
    expect(eventData.metadata?.isOversized).toBe(false);
    expect(eventData.metadata?.retrievalBlocked).toBe(false);

    // Verify no oversized warning in summary
    expect(eventData.summaryData?._oversizedWarning).toBeUndefined();
  });

  it('should save tool arguments for all artifacts', async () => {
    const artifactService = new ArtifactService({
      executionContext: mockExecutionContext,
      sessionId: 'test-session',
      taskId: 'test-task',
      contextId: 'test-context',
      streamRequestId: 'test-stream',
    });

    const mockToolResult = {
      toolCallId: 'test-tool-call',
      toolName: 'test-tool',
      args: { query: 'test query', filter: 'active' },
      result: { data: 'result' },
      timestamp: Date.now(),
    };

    vi.mocked(toolSessionManager.getToolResult).mockReturnValue(mockToolResult);
    vi.mocked(agentSessionManager.recordEvent).mockResolvedValue(undefined);
    vi.mocked(agentSessionManager.setArtifactCache).mockResolvedValue(undefined);

    const request = {
      artifactId: 'test-artifact',
      toolCallId: 'test-tool-call',
      type: 'TestType',
      baseSelector: '@',
    };

    await artifactService.createArtifact(request, 'test-agent', 100000);

    const recordEventCall = vi.mocked(agentSessionManager.recordEvent).mock.calls[0];
    const eventData = recordEventCall[3] as ArtifactSavedData;

    // Verify tool arguments are saved
    expect(eventData.metadata?.toolArgs).toEqual({
      query: 'test query',
      filter: 'active',
    });
  });
});
