import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core';
import { z } from 'zod';

const headersSchema = headers({
  schema: z.object({ "user_id": z.string().optional() })
});

const userInfo = fetchDefinition({
  id: 'user-info',
  name: 'User Information',
  trigger: 'initialization',
  fetchConfig: {
    url: `https://api.example.com/users/${headersSchema.toTemplate("user_id")}`,
    method: 'GET'
  },
  defaultValue: 'Unable to fetch user information',
  responseSchema: z.object({ "name": z.string().optional() })
});

const supportContext = contextConfig({
  id: 'support-context',
  headers: headersSchema,
  contextVariables: {
    userInfo: userInfo
  }
});
