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
    isCompressionNeeded: vi.fn().mockReturnValue(true),
    isCompressionNeededFromActualUsage: vi.fn().mockReturnValue(true),
    effectiveBaseline: vi.fn((original: number) => original),
    markCompressed: vi.fn(),
    calculateContextSize: vi.fn().mockReturnValue(1000),
    getHardLimit: vi.fn().mockReturnValue(100000),
    getCompressionCycleCount: vi.fn().mockReturnValue(0),
    getState: vi.fn().mockReturnValue({ config: { safetyBuffer: 10000 } }),
    safeCompress: vi.fn().mockResolvedValue({
      artifactIds: [],
      summary: {
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

  it('returns empty regardless of compressor state (token-budget branch removed)', async () => {
    const compressor = makeCompressor();
    const steps = makeSteps(2, 90000, 5000);
    const result = await handlePrepareStepCompression(makeMessages(6), steps, compressor, 2);
    expect(result).toEqual({});
    expect(compressor.safeCompress).not.toHaveBeenCalled();
    expect(compressor.isCompressionNeededFromActualUsage).not.toHaveBeenCalled();
  });

  it('does not call any compressor methods', async () => {
    const compressor = makeCompressor();
    await handlePrepareStepCompression(makeMessages(10), makeSteps(3), compressor, 3);
    expect(compressor.isCompressionNeeded).not.toHaveBeenCalled();
    expect(compressor.isCompressionNeededFromActualUsage).not.toHaveBeenCalled();
    expect(compressor.safeCompress).not.toHaveBeenCalled();
    expect(compressor.markCompressed).not.toHaveBeenCalled();
  });
});
