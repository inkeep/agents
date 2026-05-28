import { ModelFactory, type ModelSettings } from '@inkeep/agents-core';
import { isPromptCachingEnabled } from './caching-config';

type ProviderOptionsBag = Record<string, unknown>;

type CacheableMessage = {
  role?: unknown;
  providerOptions?: ProviderOptionsBag;
  [key: string]: unknown;
};

type CacheableConfig = {
  providerOptions?: ProviderOptionsBag;
  messages?: CacheableMessage[];
  [key: string]: unknown;
};

export function attachPromptCaching<T extends CacheableConfig>(
  config: T,
  modelSettings: ModelSettings
): T {
  if (!isPromptCachingEnabled()) {
    return config;
  }

  if (ModelFactory.shouldRouteViaGateway(modelSettings)) {
    const providerOptions = config.providerOptions ?? {};
    const gateway = (providerOptions.gateway as ProviderOptionsBag | undefined) ?? {};
    return {
      ...config,
      providerOptions: {
        ...providerOptions,
        gateway: {
          ...gateway,
          caching: gateway.caching ?? 'auto',
        },
      },
    };
  }

  if (!config.messages || config.messages.length === 0) {
    return config;
  }

  const modelString = modelSettings.model?.trim();
  if (!modelString) {
    return config;
  }

  const { provider } = ModelFactory.parseModelString(modelString);
  if (provider !== 'anthropic') {
    return config;
  }

  return {
    ...config,
    messages: config.messages.map((msg) => {
      if (msg.role !== 'system') return msg;
      const msgProviderOptions = msg.providerOptions ?? {};
      const anthropic = (msgProviderOptions.anthropic as ProviderOptionsBag | undefined) ?? {};
      return {
        ...msg,
        providerOptions: {
          ...msgProviderOptions,
          anthropic: {
            ...anthropic,
            cacheControl: anthropic.cacheControl ?? { type: 'ephemeral' },
          },
        },
      };
    }),
  };
}
