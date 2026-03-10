import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentSessionManager } from '../../session/AgentSession';
import { MidGenerationCompressor } from '../MidGenerationCompressor';

vi.mock('../../session/AgentSession', () => ({
  agentSessionManager: {
    getSession: vi.fn(),
  },
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getLedgerArtifacts: vi.fn(),
    loadEnvironmentFiles: vi.fn(),
  };
});

vi.mock('../../tools/distill-conversation-tool', () => ({
  distillConversation: vi.fn(),
}));

function makeToolResultMessages(count: number, prefix = 'call'): any[] {
  return Array.from({ length: count }, (_, i) => [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: `${prefix}-${i}`,
          toolName: 'search',
          input: { query: `q${i}` },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: `${prefix}-${i}`,
          toolName: 'search',
          output: `result-${i}`,
        },
      ],
    },
  ]).flat();
}

const mockSummary = {
  high_level: 'Summary of research',
  user_intent: 'Find information',
  decisions: { for_agent: [] as string[], for_user: [] as string[] },
  open_questions: [],
  next_steps: [],
  related_artifacts: [],
  text_messages: [],
};

describe('MidGenerationCompressor', () => {
  let compressor: MidGenerationCompressor;
  let mockSession: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSession = { recordEvent: vi.fn() };
    vi.mocked(agentSessionManager.getSession).mockReturnValue(mockSession);

    const { getLedgerArtifacts } = await import('@inkeep/agents-core');
    vi.mocked(getLedgerArtifacts).mockReturnValue(vi.fn().mockResolvedValue([]));

    const { distillConversation } = await import('../../tools/distill-conversation-tool');
    vi.mocked(distillConversation).mockResolvedValue(mockSummary as any);

    compressor = new MidGenerationCompressor(
      'session-123',
      'conv-456',
      'tenant-789',
      'project-abc',
      { hardLimit: 100000, safetyBuffer: 10000, enabled: true }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('lastProcessedMessageIndex reset after compression', () => {
    it('processes all new messages on second compression after context reset', async () => {
      const { distillConversation } = await import('../../tools/distill-conversation-tool');

      // First compression: 10 tool calls (20 messages)
      const firstBatch = makeToolResultMessages(10, 'first');
      await compressor.compress(firstBatch);

      expect(vi.mocked(distillConversation)).toHaveBeenCalledTimes(1);

      // After first compression the AI SDK replaces messages with a short summary.
      // The second compress() call receives a completely fresh, short array.
      const secondBatch = [
        {
          role: 'user',
          content: 'Based on research: [compressed summary]',
        },
        ...makeToolResultMessages(5, 'second'),
      ];
      await compressor.compress(secondBatch);

      // distillConversation must be called a second time with the new messages
      expect(vi.mocked(distillConversation)).toHaveBeenCalledTimes(2);

      const secondCallArgs = vi.mocked(distillConversation).mock.calls[1][0];
      const formatted = secondCallArgs.messageFormatter(undefined);
      expect(formatted).toContain('second-0');
    });

    it('does NOT re-process artifacts that were already saved in the first compression', async () => {
      // First compression creates 3 artifacts for 'dup-0', 'dup-1', 'dup-2'
      const firstBatch = makeToolResultMessages(3, 'dup');
      await compressor.compress(firstBatch);

      // recordEvent is called as ('artifact_saved', sessionId, data) — event type is at index 0
      const artifactSavedAfterFirst = mockSession.recordEvent.mock.calls.filter(
        (c: any[]) => c[0] === 'artifact_saved'
      );
      expect(artifactSavedAfterFirst.length).toBe(3);

      // Second compression: same tool call IDs appear again (processedToolCalls guards re-creation)
      const secondBatch = makeToolResultMessages(3, 'dup');
      await compressor.compress(secondBatch);

      // Still only 3 artifact_saved events — the second batch is skipped via processedToolCalls
      const artifactSavedTotal = mockSession.recordEvent.mock.calls.filter(
        (c: any[]) => c[0] === 'artifact_saved'
      );
      expect(artifactSavedTotal.length).toBe(3);
    });
  });

  describe('existing artifacts marked as processed', () => {
    it('marks reused artifacts as processed to avoid redundant DB lookups', async () => {
      const { getLedgerArtifacts } = await import('@inkeep/agents-core');

      // Simulate an artifact already stored in the DB for toolCallId 'cached-0'
      const existingArtifact = {
        artifactId: 'existing-artifact-1',
        toolCallId: 'cached-0',
        parts: [{ kind: 'data', data: { summary: { note: 'cached' } } }],
        metadata: { isOversized: false, toolArgs: {}, toolName: 'search' },
      };

      vi.mocked(getLedgerArtifacts).mockReturnValue(vi.fn().mockResolvedValue([existingArtifact]));

      const batch = makeToolResultMessages(1, 'cached');
      await compressor.compress(batch);

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for testing
      expect(compressor['processedToolCalls'].has('cached-0')).toBe(true);
    });
  });

  describe('requestManualCompression', () => {
    it('sets shouldCompress and isCompressionNeeded returns true', () => {
      compressor.requestManualCompression('test reason');
      expect(compressor.isCompressionNeeded([])).toBe(true);
    });

    it('clears shouldCompress after compress()', async () => {
      compressor.requestManualCompression();
      await compressor.compress([]);

      const state = compressor.getState();
      expect(state.shouldCompress).toBe(false);
    });
  });
});
