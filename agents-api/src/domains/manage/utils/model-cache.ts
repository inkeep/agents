import { LRUCache } from 'lru-cache';
import {
  type AvailableModelsResponse,
  type FetchAllModelsOptions,
  type ModelType,
  fetchAllProviderModels,
} from '@inkeep/agents-core';

interface CachedModelData {
  anthropic: import('@inkeep/agents-core').AvailableModel[];
  openai: import('@inkeep/agents-core').AvailableModel[];
  google: import('@inkeep/agents-core').AvailableModel[];
  fetchedAt: string;
}

const cache = new LRUCache<string, CachedModelData>({
  max: 10,
  ttl: 60 * 60 * 1000, // 1 hour
});

const CACHE_KEY = 'available-models';

export async function getAvailableModels(
  options: FetchAllModelsOptions & {
    types?: ModelType[];
    refresh?: boolean;
  }
): Promise<AvailableModelsResponse> {
  const { types = ['chat'], refresh = false, ...fetchOptions } = options;

  let data = refresh ? undefined : cache.get(CACHE_KEY);
  const cached = !!data;

  if (!data) {
    const result = await fetchAllProviderModels(fetchOptions);
    data = result;
    cache.set(CACHE_KEY, result);
  }

  const filterByType = (models: import('@inkeep/agents-core').AvailableModel[]) =>
    models.filter((m) => types.includes(m.type));

  return {
    anthropic: filterByType(data.anthropic),
    openai: filterByType(data.openai),
    google: filterByType(data.google),
    cached,
    fetchedAt: data.fetchedAt,
  };
}

export function invalidateModelCache(): void {
  cache.delete(CACHE_KEY);
}
