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

function makeSteps(
  count: number,
  inputTokens = 5000,
  outputTokens = 1000
): Array<{ usage: { inputTokens: number; outputTokens: number } }> {
  return Array.from({ length: count }, () => ({
    usage: { inputTokens, outputTokens },
  }));
}

function makeCompressor(overrides: Partial<Record<string, any>> = {}): any {
  return {
    isCompressionNeeded: vi.fn().mockReturnValue(false),
    isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(false),
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
    const result = await handlePrepareStepCompression(makeMessages(5), [], null, 2);
    expect(result).toEqual({});
  });

  describe('step 0 (no prior steps — estimate fallback)', () => {
    it('returns empty when estimate says compression not needed', async () => {
      const compressor = makeCompressor({ isCompressionNeeded: vi.fn().mockReturnValue(false) });
      const result = await handlePrepareStepCompression(makeMessages(5), [], compressor, 2);
      expect(result).toEqual({});
      expect(compressor.isCompressionNeeded).toHaveBeenCalled();
      expect(compressor.isCompressionNeededFromActualUsage).not.toHaveBeenCalled();
    });

    it('triggers compression when estimate says needed (safety net)', async () => {
      const compressor = makeCompressor({ isCompressionNeeded: vi.fn().mockReturnValue(true) });
      const result = await handlePrepareStepCompression(makeMessages(6), [], compressor, 2);
      expect(result.messages).toBeDefined();
      expect(compressor.isCompressionNeeded).toHaveBeenCalled();
    });
  });

  describe('step N≥1 (actual SDK usage)', () => {
    it('returns empty when actual usage says compression not needed', async () => {
      const compressor = makeCompressor({
        isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(false),
      });
      const steps = makeSteps(1, 5000, 1000);
      const result = await handlePrepareStepCompression(makeMessages(5), steps, compressor, 2);
      expect(result).toEqual({});
      expect(compressor.isCompressionNeededFromActualUsage).toHaveBeenCalledWith(6000);
      expect(compressor.isCompressionNeeded).not.toHaveBeenCalled();
    });

    it('uses inputTokens + outputTokens from last step for threshold check', async () => {
      const compressor = makeCompressor({
        isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(false),
      });
      const steps = makeSteps(3, 80000, 15000);
      await handlePrepareStepCompression(makeMessages(10), steps, compressor, 3);
      expect(compressor.isCompressionNeededFromActualUsage).toHaveBeenCalledWith(95000);
    });

    it('triggers compression when actual usage exceeds threshold', async () => {
      const compressor = makeCompressor({
        isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
      });
      const steps = makeSteps(2, 90000, 5000);
      const result = await handlePrepareStepCompression(makeMessages(6), steps, compressor, 2);
      expect(result.messages).toBeDefined();
      expect(compressor.isCompressionNeededFromActualUsage).toHaveBeenCalledWith(95000);
    });

    it('falls back to estimate when inputTokens is undefined', async () => {
      const compressor = makeCompressor({
        isCompressionNeeded: vi.fn().mockReturnValue(false),
      });
      const steps = [{ usage: { inputTokens: undefined, outputTokens: undefined } }];
      await handlePrepareStepCompression(makeMessages(5), steps as any, compressor, 2);
      expect(compressor.isCompressionNeededFromActualUsage).not.toHaveBeenCalled();
      expect(compressor.isCompressionNeeded).toHaveBeenCalled();
    });

    it('falls back to estimate when inputTokens is 0', async () => {
      const compressor = makeCompressor({
        isCompressionNeeded: vi.fn().mockReturnValue(false),
      });
      const steps = [{ usage: { inputTokens: 0, outputTokens: 0 } }];
      await handlePrepareStepCompression(makeMessages(5), steps as any, compressor, 2);
      expect(compressor.isCompressionNeededFromActualUsage).not.toHaveBeenCalled();
      expect(compressor.isCompressionNeeded).toHaveBeenCalled();
    });
  });

  it('slices originalMessages and generatedMessages correctly on first cycle', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
    });
    const stepMessages = makeMessages(8);
    const originalMessageCount = 3;
    const steps = makeSteps(1);

    await handlePrepareStepCompression(stepMessages, steps, compressor, originalMessageCount);

    expect(compressor.effectiveBaseline).toHaveBeenCalledWith(originalMessageCount);
    const compressArgs = compressor.safeCompress.mock.calls[0][0];
    expect(compressArgs).toHaveLength(5);
  });

  it('calls markCompressed with full stepMessages.length after compression succeeds', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
    });
    const stepMessages = makeMessages(10);
    const steps = makeSteps(1);

    await handlePrepareStepCompression(stepMessages, steps, compressor, 3);

    expect(compressor.markCompressed).toHaveBeenCalledWith(10);
    const markOrder = compressor.markCompressed.mock.invocationCallOrder[0];
    const compressOrder = compressor.safeCompress.mock.invocationCallOrder[0];
    expect(markOrder).toBeGreaterThan(compressOrder);
  });

  it('does not call markCompressed when safeCompress throws', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockRejectedValue(new Error('compression failed')),
    });
    const steps = makeSteps(1);

    await handlePrepareStepCompression(makeMessages(6), steps, compressor, 2);
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('uses effectiveBaseline from prior cycle for generatedMessages on second cycle', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
      effectiveBaseline: vi.fn().mockReturnValue(15),
    });
    const stepMessages = makeMessages(20);
    const originalMessageCount = 3;
    const steps = makeSteps(2);

    await handlePrepareStepCompression(stepMessages, steps, compressor, originalMessageCount);

    const compressArgs = compressor.safeCompress.mock.calls[0][0];
    expect(compressArgs).toHaveLength(5);
  });

  it('returns compressed messages with injected summary on success', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
    });
    const stepMessages = makeMessages(6);
    const steps = makeSteps(1);

    const result = await handlePrepareStepCompression(stepMessages, steps, compressor, 2);

    expect(result.messages).toBeDefined();
    expect(result.messages?.length).toBe(3);
    expect(result.messages?.at(-1)?.role).toBe('user');
    expect(result.messages?.at(-1)?.content).toContain('RESPOND NOW');
  });

  it('returns originalMessages + compressedMessages when safeCompress returns array summary', async () => {
    const compressedMessages = makeMessages(2, 'compressed');
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockResolvedValue({ artifactIds: [], summary: compressedMessages }),
    });
    const stepMessages = makeMessages(6);
    const steps = makeSteps(1);

    const result = await handlePrepareStepCompression(stepMessages, steps, compressor, 2);

    expect(result.messages).toEqual([...makeMessages(2), ...compressedMessages]);
    expect(result.messages?.some((m: any) => m.content?.includes?.('YOU MUST RESPOND NOW'))).toBe(
      false
    );
  });

  it('returns empty when safeCompress throws', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
      safeCompress: vi.fn().mockRejectedValue(new Error('compression failed')),
    });
    const steps = makeSteps(1);

    const result = await handlePrepareStepCompression(makeMessages(6), steps, compressor, 2);
    expect(result).toEqual({});
  });

  it('returns empty when compression is needed but generatedMessages is empty', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
      effectiveBaseline: vi.fn().mockReturnValue(10),
    });
    const stepMessages = makeMessages(5);
    const steps = makeSteps(1);

    const result = await handlePrepareStepCompression(stepMessages, steps, compressor, 2);

    expect(result).toEqual({});
    expect(compressor.safeCompress).not.toHaveBeenCalled();
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('enriches related_artifacts with artifact_reference tags in injected summary', async () => {
    const compressor = makeCompressor({
      isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
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
    const steps = makeSteps(1);

    const result = await handlePrepareStepCompression(makeMessages(4), steps, compressor, 2);
    const injected = result.messages?.at(-1)?.content as string;
    expect(injected).toContain('artifact:ref id=\\"art-1\\" tool=\\"call-1\\"');
  });

  it('returns empty when isCompressionNeeded throws (outer catch)', async () => {
    const compressor = makeCompressor({
      isCompressionNeeded: vi.fn().mockImplementation(() => {
        throw new Error('unexpected compressor error');
      }),
    });

    const result = await handlePrepareStepCompression(makeMessages(6), [], compressor, 2);
    expect(result).toEqual({});
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });

  it('returns empty when effectiveBaseline throws (outer catch)', async () => {
    const compressor = makeCompressor({
      effectiveBaseline: vi.fn().mockImplementation(() => {
        throw new Error('baseline error');
      }),
    });
    const steps = makeSteps(1);

    const result = await handlePrepareStepCompression(makeMessages(6), steps, compressor, 2);
    expect(result).toEqual({});
  });
});
