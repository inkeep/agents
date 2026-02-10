import { z } from '@hono/zod-openapi';

export const ModelTypeSchema = z
  .enum(['chat', 'embedding', 'image', 'tts', 'stt', 'moderation'])
  .openapi('ModelType');

export type ModelType = z.infer<typeof ModelTypeSchema>;

export const AvailableModelSchema = z
  .object({
    id: z.string().describe('Raw provider model ID, e.g. "claude-opus-4-6"'),
    value: z
      .string()
      .describe('Prefixed model ID matching existing convention, e.g. "anthropic/claude-opus-4-6"'),
    label: z.string().describe('Human-readable display name, e.g. "Claude Opus 4.6"'),
    provider: z.enum(['anthropic', 'openai', 'google']).describe('AI provider'),
    type: ModelTypeSchema.describe('Primary capability classification of the model'),
  })
  .openapi('AvailableModel');

export type AvailableModel = z.infer<typeof AvailableModelSchema>;

export const AvailableModelsResponseSchema = z
  .object({
    anthropic: z.array(AvailableModelSchema),
    openai: z.array(AvailableModelSchema),
    google: z.array(AvailableModelSchema),
    cached: z.boolean(),
    fetchedAt: z.string().describe('ISO 8601 timestamp of when the data was fetched'),
  })
  .openapi('AvailableModelsResponse');

export type AvailableModelsResponse = z.infer<typeof AvailableModelsResponseSchema>;

function classifyOpenAIModel(id: string): ModelType | null {
  const lower = id.toLowerCase();

  if (
    lower.includes('-audio') ||
    lower.includes('-realtime') ||
    lower.includes('-search') ||
    lower.includes('-chat-latest') ||
    lower.includes('chat-latest')
  ) {
    return null;
  }

  if (lower.startsWith('text-embedding')) return 'embedding';
  if (
    lower.startsWith('dall-e') ||
    lower.startsWith('gpt-image') ||
    lower.startsWith('chatgpt-image')
  ) {
    return 'image';
  }
  if (lower.startsWith('tts-') || lower.endsWith('-tts')) return 'tts';
  if (lower.startsWith('whisper') || lower.includes('-transcribe')) return 'stt';
  if (lower.includes('-moderation') || lower.startsWith('omni-moderation')) return 'moderation';

  if (
    lower.startsWith('gpt-5') ||
    lower.startsWith('gpt-4.1') ||
    lower.startsWith('gpt-4o') ||
    lower.startsWith('gpt-4-turbo') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4')
  ) {
    return 'chat';
  }

  return null;
}

function classifyAnthropicModel(id: string): ModelType | null {
  if (id.startsWith('claude-')) return 'chat';
  return null;
}

function classifyGoogleModel(supportedMethods: string[]): ModelType | null {
  if (supportedMethods.includes('generateContent')) return 'chat';
  if (supportedMethods.includes('embedContent')) return 'embedding';
  return null;
}

function formatModelLabel(id: string): string {
  return id
    .replace(/^(gpt-|claude-|gemini-)/, (match) => {
      if (match === 'gpt-') return 'GPT-';
      if (match === 'claude-') return 'Claude ';
      if (match === 'gemini-') return 'Gemini ';
      return match;
    })
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Gpt/g, 'GPT');
}

interface OpenAIModel {
  id: string;
  owned_by: string;
}

interface AnthropicModel {
  id: string;
  display_name: string;
  type: string;
  created_at: string;
}

interface GoogleModel {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
}

export async function fetchOpenAIModels(apiKey: string): Promise<AvailableModel[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data: { data: OpenAIModel[] } = await response.json();
  const models: AvailableModel[] = [];

  for (const model of data.data) {
    const type = classifyOpenAIModel(model.id);
    if (type === null) continue;

    models.push({
      id: model.id,
      value: `openai/${model.id}`,
      label: formatModelLabel(model.id),
      provider: 'openai',
      type,
    });
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchAnthropicModels(apiKey: string): Promise<AvailableModel[]> {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
  }

  const data: { data: AnthropicModel[] } = await response.json();
  const models: AvailableModel[] = [];

  for (const model of data.data) {
    const type = classifyAnthropicModel(model.id);
    if (type === null) continue;

    models.push({
      id: model.id,
      value: `anthropic/${model.id}`,
      label: model.display_name || formatModelLabel(model.id),
      provider: 'anthropic',
      type,
    });
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchGoogleModels(apiKey: string): Promise<AvailableModel[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status} ${response.statusText}`);
  }

  const data: { models: GoogleModel[] } = await response.json();
  const models: AvailableModel[] = [];

  for (const model of data.models) {
    const modelId = model.name.replace('models/', '');
    if (!modelId.startsWith('gemini-')) continue;

    const type = classifyGoogleModel(model.supportedGenerationMethods || []);
    if (type === null) continue;

    models.push({
      id: modelId,
      value: `google/${modelId}`,
      label: model.displayName || formatModelLabel(modelId),
      provider: 'google',
      type,
    });
  }

  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export interface FetchAllModelsOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
}

export interface FetchAllModelsResult {
  anthropic: AvailableModel[];
  openai: AvailableModel[];
  google: AvailableModel[];
  fetchedAt: string;
}

export async function fetchAllProviderModels(
  options: FetchAllModelsOptions
): Promise<FetchAllModelsResult> {
  const fetchers: Promise<{ provider: string; models: AvailableModel[] }>[] = [];

  if (options.anthropicApiKey) {
    fetchers.push(
      fetchAnthropicModels(options.anthropicApiKey)
        .then((models) => ({ provider: 'anthropic', models }))
        .catch((err) => {
          console.error('Failed to fetch Anthropic models:', err.message);
          return { provider: 'anthropic', models: [] };
        })
    );
  }

  if (options.openaiApiKey) {
    fetchers.push(
      fetchOpenAIModels(options.openaiApiKey)
        .then((models) => ({ provider: 'openai', models }))
        .catch((err) => {
          console.error('Failed to fetch OpenAI models:', err.message);
          return { provider: 'openai', models: [] };
        })
    );
  }

  if (options.googleApiKey) {
    fetchers.push(
      fetchGoogleModels(options.googleApiKey)
        .then((models) => ({ provider: 'google', models }))
        .catch((err) => {
          console.error('Failed to fetch Google models:', err.message);
          return { provider: 'google', models: [] };
        })
    );
  }

  const results = await Promise.all(fetchers);

  const result: FetchAllModelsResult = {
    anthropic: [],
    openai: [],
    google: [],
    fetchedAt: new Date().toISOString(),
  };

  for (const { provider, models } of results) {
    if (provider === 'anthropic') result.anthropic = models;
    else if (provider === 'openai') result.openai = models;
    else if (provider === 'google') result.google = models;
  }

  return result;
}
