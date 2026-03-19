import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
