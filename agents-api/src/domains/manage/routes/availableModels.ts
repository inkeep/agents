import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AvailableModelsResponseSchema,
  ErrorResponseSchema,
  ModelTypeSchema,
  TenantParamsSchema,
} from '@inkeep/agents-core';
import type { ManageAppVariables } from 'src/types/app';
import { env } from '../../../env';
import { getAvailableModels } from '../utils/model-cache';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const AvailableModelsQuerySchema = z.object({
  type: z
    .string()
    .optional()
    .default('chat')
    .describe(
      'Comma-separated model types to include. Defaults to "chat". Valid values: chat, embedding, image, tts, stt, moderation'
    ),
  refresh: z
    .string()
    .optional()
    .describe('Set to "true" to bypass cache and fetch fresh data from providers'),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Available Models',
    description:
      'Lists models available from configured AI providers (OpenAI, Anthropic, Google) using the server API keys. Results are cached for 1 hour.',
    operationId: 'list-available-models',
    tags: ['Models'],
    request: {
      params: TenantParamsSchema,
      query: AvailableModelsQuerySchema,
    },
    responses: {
      200: {
        description: 'Available models from configured providers',
        content: {
          'application/json': {
            schema: AvailableModelsResponseSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch models from providers',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { type, refresh } = c.req.valid('query');

    const typeValues = type
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const parsedTypes = typeValues.map((t) => ModelTypeSchema.parse(t));

    const result = await getAvailableModels({
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      openaiApiKey: env.OPENAI_API_KEY,
      googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      types: parsedTypes,
      refresh: refresh === 'true',
    });

    return c.json(result, 200);
  }
);

export default app;
