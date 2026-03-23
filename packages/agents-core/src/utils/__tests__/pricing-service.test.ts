import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelPricing, TokenUsage } from '../pricing-service';
import { PricingService } from '../pricing-service';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('calculateCost', () => {
    const basePricing: ModelPricing = {
      inputPerToken: 0.000003,
      outputPerToken: 0.000015,
    };

    it('calculates cost for basic input/output tokens', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
      };
      const cost = service.calculateCost(usage, basePricing);
      expect(cost).toBeCloseTo(0.000003 * 1000 + 0.000015 * 500);
    });

    it('returns 0 for zero tokens', () => {
      const cost = service.calculateCost({ inputTokens: 0, outputTokens: 0 }, basePricing);
      expect(cost).toBe(0);
    });

    it('handles undefined token counts', () => {
      const cost = service.calculateCost({}, basePricing);
      expect(cost).toBe(0);
    });

    it('uses cached read pricing when available', () => {
      const pricing: ModelPricing = {
        ...basePricing,
        cachedReadPerToken: 0.0000003,
      };
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        cachedReadTokens: 2000,
      };
      const cost = service.calculateCost(usage, pricing);
      expect(cost).toBeCloseTo(0.000003 * 1000 + 0.000015 * 500 + 0.0000003 * 2000);
    });

    it('uses cached write pricing when available', () => {
      const pricing: ModelPricing = {
        ...basePricing,
        cachedWritePerToken: 0.00000375,
      };
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cachedWriteTokens: 500,
      };
      const cost = service.calculateCost(usage, pricing);
      expect(cost).toBeCloseTo(0.000003 * 100 + 0.000015 * 50 + 0.00000375 * 500);
    });

    it('uses reasoning pricing when available', () => {
      const pricing: ModelPricing = {
        ...basePricing,
        reasoningPerToken: 0.00006,
      };
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 200,
        reasoningTokens: 300,
      };
      const cost = service.calculateCost(usage, pricing);
      expect(cost).toBeCloseTo(0.000003 * 1000 + 0.000015 * 200 + 0.00006 * 300);
    });

    it('falls back to output pricing for reasoning tokens when no reasoning price', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 200,
        reasoningTokens: 300,
      };
      const cost = service.calculateCost(usage, basePricing);
      expect(cost).toBeCloseTo(0.000003 * 1000 + 0.000015 * 200 + 0.000015 * 300);
    });

    it('handles all token types together', () => {
      const pricing: ModelPricing = {
        inputPerToken: 0.000003,
        outputPerToken: 0.000015,
        cachedReadPerToken: 0.0000003,
        cachedWritePerToken: 0.00000375,
        reasoningPerToken: 0.00006,
      };
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 200,
        cachedReadTokens: 3000,
        cachedWriteTokens: 100,
      };
      const cost = service.calculateCost(usage, pricing);
      const expected =
        0.000003 * 1000 + 0.000015 * 500 + 0.00006 * 200 + 0.0000003 * 3000 + 0.00000375 * 100;
      expect(cost).toBeCloseTo(expected);
    });
  });

  describe('getModelPricing', () => {
    it('returns null when no pricing data is loaded', () => {
      const result = service.getModelPricing('claude-sonnet-4', 'anthropic');
      expect(result).toBeNull();
    });
  });

  describe('initialize', () => {
    it('is idempotent — concurrent calls share the same promise', async () => {
      const modelsDevResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            anthropic: {
              models: {
                'claude-sonnet-4': {
                  id: 'claude-sonnet-4',
                  cost: { input: 3, output: 15 },
                },
              },
            },
          }),
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelsDevResponse as any);

      const [result1, result2] = await Promise.allSettled([
        service.initialize(),
        service.initialize(),
      ]);

      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');
      // models.dev fetch should only happen once despite two concurrent calls
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it('loads pricing from models.dev and makes it available via getModelPricing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            anthropic: {
              models: {
                'claude-sonnet-4': {
                  id: 'claude-sonnet-4',
                  cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
                },
              },
            },
            openai: {
              models: {
                'gpt-4o': {
                  id: 'gpt-4o',
                  cost: { input: 2.5, output: 10 },
                },
              },
            },
          }),
      } as any);

      await service.initialize();

      const anthropicPricing = service.getModelPricing('claude-sonnet-4', 'anthropic');
      expect(anthropicPricing).not.toBeNull();
      expect(anthropicPricing?.inputPerToken).toBeCloseTo(3 / 1_000_000);
      expect(anthropicPricing?.outputPerToken).toBeCloseTo(15 / 1_000_000);
      expect(anthropicPricing?.cachedReadPerToken).toBeCloseTo(0.3 / 1_000_000);
      expect(anthropicPricing?.cachedWritePerToken).toBeCloseTo(3.75 / 1_000_000);

      const openaiPricing = service.getModelPricing('gpt-4o', 'openai');
      expect(openaiPricing).not.toBeNull();
      expect(openaiPricing?.inputPerToken).toBeCloseTo(2.5 / 1_000_000);

      fetchSpy.mockRestore();
    });

    it('strips date suffixes for pricing lookup', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            anthropic: {
              models: {
                'claude-sonnet-4': {
                  cost: { input: 3, output: 15 },
                },
              },
            },
          }),
      } as any);

      await service.initialize();

      // Should find pricing via date-stripped lookup
      const pricing = service.getModelPricing('claude-sonnet-4-20250514', 'anthropic');
      expect(pricing).not.toBeNull();

      fetchSpy.mockRestore();
    });

    it('handles models.dev fetch failure gracefully', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

      await service.initialize();

      const pricing = service.getModelPricing('claude-sonnet-4', 'anthropic');
      expect(pricing).toBeNull();

      fetchSpy.mockRestore();
    });

    it('handles non-OK response from models.dev', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: false, status: 500 } as any);

      await service.initialize();

      const pricing = service.getModelPricing('claude-sonnet-4', 'anthropic');
      expect(pricing).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('clears caches and allows re-initialization', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            anthropic: {
              models: {
                'claude-sonnet-4': { cost: { input: 3, output: 15 } },
              },
            },
          }),
      } as any);

      await service.initialize();
      expect(service.getModelPricing('claude-sonnet-4', 'anthropic')).not.toBeNull();

      service.destroy();
      expect(service.getModelPricing('claude-sonnet-4', 'anthropic')).toBeNull();

      // Can re-initialize after destroy
      await service.initialize();
      expect(service.getModelPricing('claude-sonnet-4', 'anthropic')).not.toBeNull();

      fetchSpy.mockRestore();
    });
  });
});
