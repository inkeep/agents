import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core';
import { z } from 'zod';
import { env } from '../env';
export const headersBuilder = headers({
  schema: z.object({
    'x-target-tenant-id': z.string(),
    'x-target-project-id': z.string(),
    'x-target-agent-id': z.string().optional(),
    'x-target-ref': z.string().optional(),
    'x-inkeep-from-conversation-id': z.string().optional(),
    'x-inkeep-from-message-id': z.string().optional(),
    'x-forwarded-cookie': z.string().optional(),
  }),
});

const conversationResponseSchema = z
  .object({
    data: z.object({
      messages: z.array(z.any()),
      formatted: z.object({
        llmContext: z.string(),
      }),
    }),
  })
  .openapi('ConversationWithFormattedMessagesResponse');

const llmsTxt = fetchDefinition({
  id: 'llmsTxt',
  trigger: 'initialization',
  fetchConfig: {
    url: `${env.INKEEP_AGENTS_DOCS_URL}/api/docs/fragments`,
  },
  responseSchema: z.string(),
});

const fetchProjectInformation = fetchDefinition({
  id: 'fetchProjectInformation',
  trigger: 'initialization',
  fetchConfig: {
    url: `${env.INKEEP_AGENTS_MANAGE_API_URL}/tenants/${headersBuilder.toTemplate('x-target-tenant-id')}/project-full/${headersBuilder.toTemplate('x-target-project-id')}`,
    headers: {
      'x-forwarded-cookie': `${headersBuilder.toTemplate('x-forwarded-cookie')}`,
    },
  },
  responseSchema: z.any(),
});

const fetchConversationHistory = fetchDefinition({
  id: 'fetchConversationHistory',
  trigger: 'initialization',
  fetchConfig: {
    url: `${env.INKEEP_AGENTS_MANAGE_API_URL}/tenants/${headersBuilder.toTemplate('x-target-tenant-id')}/projects/${headersBuilder.toTemplate('x-target-project-id')}/conversations/${headersBuilder.toTemplate('x-inkeep-from-conversation-id')}`,
    method: 'GET',
    transform: 'data.formatted.llmContext',
    headers: {
      'x-forwarded-cookie': `${headersBuilder.toTemplate('x-forwarded-cookie')}`,
    },
  },
  responseSchema: z.any(),
  defaultValue: 'There is no specific conversation that triggered this session.',
});

export const contextBuilder = contextConfig({
  id: 'builder',
  headers: headersBuilder,
  contextVariables: {
    coreConcepts: llmsTxt,
    projectInformation: fetchProjectInformation,
    conversationHistory: fetchConversationHistory,
  },
});
