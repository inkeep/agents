import { getLogger } from './logger';

const logger = getLogger('PricingService');

export interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
  cachedReadPerToken?: number;
  cachedWritePerToken?: number;
  reasoningPerToken?: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
}

interface ModelsDevProvider {
  models: Record<
    string,
    {
      id?: string;
      name?: string;
      cost?: {
        input?: number;
        output?: number;
        cache_read?: number;
        cache_write?: number;
      };
    }
  >;
}

type ModelsDevData = Record<string, ModelsDevProvider>;

interface GatewayModelEntry {
  id: string;
  name: string;
  pricing?: {
    input: string;
    output: string;
    cachedInputTokens?: string;
    cacheCreationInputTokens?: string;
  };
}

const GATEWAY_REFRESH_MS = 60 * 60 * 1000;
const MODELS_DEV_REFRESH_MS = 6 * 60 * 60 * 1000;
const MODELS_DEV_API_URL = 'https://models.dev/api.json';

export class PricingService {
  private gatewayCache = new Map<string, ModelPricing>();
  private modelsDevCache = new Map<string, ModelPricing>();
  private gatewayInterval: ReturnType<typeof setInterval> | null = null;
  private modelsDevInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await Promise.allSettled([this.refreshGateway(), this.refreshModelsDev()]);

    this.gatewayInterval = setInterval(() => {
      this.refreshGateway().catch((e) =>
        logger.warn({ error: e }, 'Gateway pricing refresh failed')
      );
    }, GATEWAY_REFRESH_MS);

    this.modelsDevInterval = setInterval(() => {
      this.refreshModelsDev().catch((e) =>
        logger.warn({ error: e }, 'models.dev pricing refresh failed')
      );
    }, MODELS_DEV_REFRESH_MS);
  }

  destroy(): void {
    if (this.gatewayInterval) clearInterval(this.gatewayInterval);
    if (this.modelsDevInterval) clearInterval(this.modelsDevInterval);
    this.gatewayInterval = null;
    this.modelsDevInterval = null;
    this.initialized = false;
  }

  private async refreshGateway(): Promise<void> {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) return;

    try {
      const { createGateway } = await import('@ai-sdk/gateway');
      const gw = createGateway({ apiKey });
      const response = (await gw.getAvailableModels()) as { models?: GatewayModelEntry[] };
      const models = response?.models ?? [];

      for (const model of models) {
        if (!model.pricing) continue;
        const pricing: ModelPricing = {
          inputPerToken: Number.parseFloat(model.pricing.input) || 0,
          outputPerToken: Number.parseFloat(model.pricing.output) || 0,
        };
        if (model.pricing.cachedInputTokens) {
          pricing.cachedReadPerToken = Number.parseFloat(model.pricing.cachedInputTokens) || 0;
        }
        if (model.pricing.cacheCreationInputTokens) {
          pricing.cachedWritePerToken =
            Number.parseFloat(model.pricing.cacheCreationInputTokens) || 0;
        }
        this.gatewayCache.set(model.id, pricing);
      }

      logger.info({ modelCount: models.length }, 'Gateway pricing refreshed');
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch gateway pricing');
    }
  }

  private async refreshModelsDev(): Promise<void> {
    try {
      const response = await fetch(MODELS_DEV_API_URL);
      if (!response.ok) {
        logger.warn({ status: response.status }, 'models.dev API returned non-OK status');
        return;
      }

      const data = (await response.json()) as ModelsDevData;
      let modelCount = 0;

      for (const [providerKey, provider] of Object.entries(data)) {
        if (!provider?.models) continue;
        for (const [modelKey, model] of Object.entries(provider.models)) {
          if (!model?.cost) continue;

          const pricing: ModelPricing = {
            inputPerToken: (model.cost.input ?? 0) / 1_000_000,
            outputPerToken: (model.cost.output ?? 0) / 1_000_000,
          };
          if (model.cost.cache_read != null) {
            pricing.cachedReadPerToken = model.cost.cache_read / 1_000_000;
          }
          if (model.cost.cache_write != null) {
            pricing.cachedWritePerToken = model.cost.cache_write / 1_000_000;
          }

          const key = `${providerKey}/${modelKey}`;
          this.modelsDevCache.set(key, pricing);
          this.modelsDevCache.set(modelKey, pricing);
          if (model.id) {
            this.modelsDevCache.set(model.id, pricing);
          }
          modelCount++;
        }
      }

      logger.info({ modelCount }, 'models.dev pricing refreshed');
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch models.dev pricing');
    }
  }

  getModelPricing(modelId: string, provider: string): ModelPricing | null {
    const gatewayKey = `${provider}/${modelId}`;
    const gatewayResult = this.gatewayCache.get(gatewayKey) ?? this.gatewayCache.get(modelId);
    if (gatewayResult) return gatewayResult;

    const modelsDevResult = this.modelsDevCache.get(gatewayKey) ?? this.modelsDevCache.get(modelId);
    if (modelsDevResult) return modelsDevResult;

    return null;
  }

  calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
    let cost = 0;

    cost += (usage.inputTokens ?? 0) * pricing.inputPerToken;
    cost += (usage.outputTokens ?? 0) * pricing.outputPerToken;

    if (usage.cachedReadTokens && pricing.cachedReadPerToken != null) {
      cost += usage.cachedReadTokens * pricing.cachedReadPerToken;
    }
    if (usage.cachedWriteTokens && pricing.cachedWritePerToken != null) {
      cost += usage.cachedWriteTokens * pricing.cachedWritePerToken;
    }
    if (usage.reasoningTokens && pricing.reasoningPerToken != null) {
      cost += usage.reasoningTokens * pricing.reasoningPerToken;
    } else if (usage.reasoningTokens) {
      cost += usage.reasoningTokens * pricing.outputPerToken;
    }

    return cost;
  }
}

let defaultInstance: PricingService | null = null;

export function getPricingService(): PricingService {
  if (!defaultInstance) {
    defaultInstance = new PricingService();
  }
  return defaultInstance;
}
