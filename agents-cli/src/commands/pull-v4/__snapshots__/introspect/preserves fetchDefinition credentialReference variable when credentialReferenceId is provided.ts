import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core';
import { z } from 'zod';
import { inkeepApiKey } from '../credentials/inkeep-api-key';
const supportContextHeaders = headers({
  schema: z.object({ "user_id": z.string().optional() }),
});

const userInfo = fetchDefinition({
  id: 'user-info',
  name: 'User Information',
  trigger: 'initialization',
  fetchConfig: {
    url: `https://api.example.com/users/${supportContextHeaders.toTemplate("user_id")}`,
    method: 'GET'
  },
  responseSchema: z.object({ "name": z.string().optional() }),
  defaultValue: 'Unable to fetch user information',
  credentialReference: inkeepApiKey
});

export const supportContext = contextConfig({
  id: 'support-context',
  contextVariables: {
    userInfo
  },
  headers: supportContextHeaders
});
