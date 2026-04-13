import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core';
import { z } from 'zod';
import { env } from '../env';

export const headersBuilder = headers({
  schema: z.object({
    'x-target-tenant-id': z.string(),
    'x-target-project-id': z.string(),
    'x-target-agent-id': z.string().optional(),
    'x-target-branch-name': z.string().optional(),
    'x-inkeep-from-conversation-id': z.string().optional(),
    'x-inkeep-from-message-id': z.string().optional(),
    'x-forwarded-cookie': z.string().optional(),
    authorization: z.string().optional(),
  }),
});

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
    url: `${env.INKEEP_AGENTS_MANAGE_API_URL}/manage/tenants/${headersBuilder.toTemplate('x-target-tenant-id')}/project-full/${headersBuilder.toTemplate('x-target-project-id')}?ref=${headersBuilder.toTemplate('x-target-branch-name')}`,
    headers: {
      authorization: `${headersBuilder.toTemplate('authorization')}`,
    },
  },
  responseSchema: z.any(),
});

export const contextBuilder = contextConfig({
  id: 'improvement',
  headers: headersBuilder,
  contextVariables: {
    coreConcepts: llmsTxt,
    projectInformation: fetchProjectInformation,
  },
});
