import { describe, expect, it } from 'vitest';

function extractUsage(response: {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
    outputTokenDetails?: { reasoningTokens?: number };
  };
  totalUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
    outputTokenDetails?: { reasoningTokens?: number };
  };
  response?: { modelId?: string };
  steps?: unknown[];
}) {
  const usage = response.totalUsage ?? response.usage;
  return {
    inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? 0,
    outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? 0,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? undefined,
    cachedReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? undefined,
    cachedWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? undefined,
    stepCount: Array.isArray(response.steps) ? response.steps.length : 1,
    resolvedModel: response.response?.modelId ?? undefined,
  };
}

describe('UsageTracker', () => {
  describe('extractUsage', () => {
    it('extracts basic token counts from usage', () => {
      const result = extractUsage({
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
    });

    it('prefers totalUsage over usage', () => {
      const result = extractUsage({
        usage: { inputTokens: 100, outputTokens: 50 },
        totalUsage: { inputTokens: 200, outputTokens: 150 },
      });
      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(150);
    });

    it('handles promptTokens/completionTokens naming', () => {
      const result = extractUsage({
        usage: { promptTokens: 300, completionTokens: 100 },
      });
      expect(result.inputTokens).toBe(300);
      expect(result.outputTokens).toBe(100);
    });

    it('extracts reasoning tokens', () => {
      const result = extractUsage({
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          outputTokenDetails: { reasoningTokens: 20 },
        },
      });
      expect(result.reasoningTokens).toBe(20);
    });

    it('extracts cached tokens', () => {
      const result = extractUsage({
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          inputTokenDetails: { cacheReadTokens: 80, cacheWriteTokens: 10 },
        },
      });
      expect(result.cachedReadTokens).toBe(80);
      expect(result.cachedWriteTokens).toBe(10);
    });

    it('counts steps from response', () => {
      const result = extractUsage({
        usage: { inputTokens: 100, outputTokens: 50 },
        steps: [{}, {}, {}],
      });
      expect(result.stepCount).toBe(3);
    });

    it('extracts resolved model from response', () => {
      const result = extractUsage({
        usage: { inputTokens: 100, outputTokens: 50 },
        response: { modelId: 'claude-sonnet-4-20250514' },
      });
      expect(result.resolvedModel).toBe('claude-sonnet-4-20250514');
    });

    it('defaults to 0 tokens when usage is missing', () => {
      const result = extractUsage({});
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.stepCount).toBe(1);
    });
  });
});
