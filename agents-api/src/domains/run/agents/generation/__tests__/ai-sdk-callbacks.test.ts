import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePrepareStepCompression } from '../ai-sdk-callbacks';

vi.mock('../../../session/AgentSession', () => ({
  agentSessionManager: { getSession: vi.fn() },
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual, getLedgerArtifacts: vi.fn(), loadEnvironmentFiles: vi.fn() };
});

vi.mock('../../../tools/distill-conversation-tool', () => ({
  distillConversation: vi.fn(),
}));

function makeMessages(count: number, prefix = 'msg'): any[] {
  return Array.from({ length: count }, (_, i) => ({
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId: `${prefix}-${i}`, output: `r${i}` }],
  }));
}

function makeCompressor(overrides: Partial<Record<string, any>> = {}): any {
  return {
    isCompressionNeeded: vi.fn().mockReturnValue(false),
    effectiveBaseline: vi.fn((original: number) => original),
    markCompressed: vi.fn(),
    calculateContextSize: vi.fn().mockReturnValue(1000),
    getHardLimit: vi.fn().mockReturnValue(100000),
    getCompressionCycleCount: vi.fn().mockReturnValue(0),
    getState: vi.fn().mockReturnValue({ config: { safetyBuffer: 10000 } }),
    safeCompress: vi.fn().mockResolvedValue({
      artifactIds: [],
      summary: {
        type: 'conversation_summary_v1',
        session_id: null,
        _fallback: null,
        high_level: 'summary',
        user_intent: 'intent',
        decisions: [],
        open_questions: [],
        next_steps: { for_agent: [], for_user: [] },
        related_artifacts: [],
      },
    }),
    ...overrides,
  };
}

describe('handlePrepareStepCompression', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when no compressor', async () => {
    const result = await handlePrepareStepCompression(makeMessages(5), null, 2);
    expect(result).toEqual({});
  });

  it('returns empty when compression not needed', async () => {
    const compressor = makeCompressor({ isCompressionNeeded: vi.fn().mockReturnValue(false) });
    const result = await handlePrepareStepCompression(makeMessages(5), compressor, 2);
    expect(result).toEqual({});
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('slices originalMessages and generatedMessages correctly on first cycle', async () => {
    const compressor = makeCompressor({ isCompressionNeeded: vi.fn().mockReturnValue(true) });
    const stepMessages = makeMessages(8);
    const originalMessageCount = 3;

    await handlePrepareStepCompression(stepMessages, compressor, originalMessageCount);

    // effectiveBaseline returns originalMessageCount on first cycle (no prior compression)
    expect(compressor.effectiveBaseline).toHaveBeenCalledWith(originalMessageCount);
    // safeCompress receives only generated messages (indices 3-7)
    const compressArgs = compressor.safeCompress.mock.calls[0][0];
    expect(compressArgs).toHaveLength(5);
  });

  it('calls markCompressed with full stepMessages.length after compression succeeds', async () => {
    const compressor = makeCompressor({ isCompressionNeeded: vi.fn().mockReturnValue(true) });
    const stepMessages = makeMessages(10);

    await handlePrepareStepCompression(stepMessages, compressor, 3);

    expect(compressor.markCompressed).toHaveBeenCalledWith(10);
    // markCompressed must be called after safeCompress
    const markOrder = compressor.markCompressed.mock.invocationCallOrder[0];
    const compressOrder = compressor.safeCompress.mock.invocationCallOrder[0];
    expect(markOrder).toBeGreaterThan(compressOrder);
  });

  it('does not call markCompressed when safeCompress throws', async () => {
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockRejectedValue(new Error('compression failed')),
    });

    await handlePrepareStepCompression(makeMessages(6), compressor, 2);
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('uses effectiveBaseline from prior cycle for generatedMessages on second cycle', async () => {
    // Second cycle: effectiveBaseline returns 15 (set by previous markCompressed)
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockReturnValue(true),
      effectiveBaseline: vi.fn().mockReturnValue(15),
    });
    // stepMessages now has 20 entries (AI SDK accumulates all)
    const stepMessages = makeMessages(20);
    const originalMessageCount = 3;

    await handlePrepareStepCompression(stepMessages, compressor, originalMessageCount);

    // generatedMessages = stepMessages.slice(15) = 5 messages
    const compressArgs = compressor.safeCompress.mock.calls[0][0];
    expect(compressArgs).toHaveLength(5);
  });

  it('returns compressed messages with injected summary on success', async () => {
    const compressor = makeCompressor({ isCompressionNeeded: vi.fn().mockReturnValue(true) });
    const stepMessages = makeMessages(6);

    const result = await handlePrepareStepCompression(stepMessages, compressor, 2);

    expect(result.messages).toBeDefined();
    // originalMessages (2) + injected summary message (1)
    expect(result.messages?.length).toBe(3);
    expect(result.messages?.at(-1)?.role).toBe('user');
    expect(result.messages?.at(-1)?.content).toContain('RESPOND NOW');
  });

  it('returns originalMessages + compressedMessages when safeCompress returns array summary', async () => {
    const compressedMessages = makeMessages(2, 'compressed');
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockResolvedValue({ artifactIds: [], summary: compressedMessages }),
    });
    const stepMessages = makeMessages(6);

    const result = await handlePrepareStepCompression(stepMessages, compressor, 2);

    // originalMessages (2) + compressedMessages (2) — no injected summary prompt
    expect(result.messages).toEqual([...makeMessages(2), ...compressedMessages]);
    expect(result.messages?.some((m: any) => m.content?.includes?.('YOU MUST RESPOND NOW'))).toBe(
      false
    );
  });

  it('returns empty when safeCompress throws', async () => {
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockRejectedValue(new Error('compression failed')),
    });

    const result = await handlePrepareStepCompression(makeMessages(6), compressor, 2);
    expect(result).toEqual({});
  });

  it('returns empty when compression is needed but generatedMessages is empty', async () => {
    // effectiveBaseline >= stepMessages.length → generatedMessages = []
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockReturnValue(true),
      effectiveBaseline: vi.fn().mockReturnValue(10), // baseline past end of stepMessages
    });
    const stepMessages = makeMessages(5); // only 5 messages, baseline=10

    const result = await handlePrepareStepCompression(stepMessages, compressor, 2);

    expect(result).toEqual({});
    expect(compressor.safeCompress).not.toHaveBeenCalled();
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('enriches related_artifacts with artifact_reference tags in injected summary', async () => {
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockResolvedValue({
        artifactIds: ['art-1'],
        summary: {
          type: 'conversation_summary_v1',
          session_id: null,
          _fallback: null,
          high_level: 'findings',
          user_intent: 'intent',
          decisions: [],
          open_questions: [],
          next_steps: { for_agent: [], for_user: [] },
          related_artifacts: [
            {
              id: 'art-1',
              name: 'Result',
              tool_call_id: 'call-1',
              tool_name: 'search',
              content_type: 'search_results',
              key_findings: [],
            },
          ],
        },
      }),
    });

    const result = await handlePrepareStepCompression(makeMessages(4), compressor, 2);
    const injected = result.messages?.at(-1)?.content as string;
    // artifact_reference is serialized inside JSON.stringify, so quotes are escaped
    expect(injected).toContain('artifact:ref id=\\"art-1\\" tool=\\"call-1\\"');
  });

  it('returns empty when isCompressionNeeded throws (outer catch)', async () => {
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockImplementation(() => {
        throw new Error('unexpected compressor error');
      }),
    });

    const result = await handlePrepareStepCompression(makeMessages(6), compressor, 2);
    expect(result).toEqual({});
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('returns empty when effectiveBaseline throws (outer catch)', async () => {
    const compressor = makeCompressor({
      effectiveBaseline: vi.fn().mockImplementation(() => {
        throw new Error('baseline error');
      }),
    });

    const result = await handlePrepareStepCompression(makeMessages(6), compressor, 2);
    expect(result).toEqual({});
  });
});
