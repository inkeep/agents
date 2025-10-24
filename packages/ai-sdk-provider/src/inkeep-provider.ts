import { loadSetting, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { InkeepChatLanguageModel } from './inkeep-chat-language-model';
import type { InkeepChatOptions } from './inkeep-chat-options';

export interface InkeepProvider {
  (agentId: string, options?: InkeepChatOptions): InkeepChatLanguageModel;

  languageModel(agentId: string, options?: InkeepChatOptions): InkeepChatLanguageModel;
}

export interface InkeepProviderSettings {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export function createInkeep(options: InkeepProviderSettings = {}): InkeepProvider {
  const getBaseURL = (): string => {
    const baseURL = loadSetting({
      settingValue: options.baseURL,
      environmentVariableName: 'INKEEP_AGENTS_RUN_API_URL',
      settingName: 'baseURL',
      description: 'Inkeep Agents API base URL',
    });
    return withoutTrailingSlash(baseURL) as string;
  };

  const getHeaders = () => {
    // API key is optional for development use cases (e.g., localhost)
    const apiKey = options.apiKey;
    return {
      Authorization: apiKey ? `Bearer ${apiKey}` : undefined,
      ...options.headers,
    };
  };

  const createChatModel = (agentId: string, chatOptions?: InkeepChatOptions) =>
    new InkeepChatLanguageModel(agentId, chatOptions ?? {}, {
      provider: 'inkeep',
      baseURL: getBaseURL(),
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (agentId: string, chatOptions?: InkeepChatOptions) =>
    createChatModel(agentId, chatOptions);

  provider.languageModel = createChatModel;

  return provider as InkeepProvider;
}

export const inkeep = createInkeep();
