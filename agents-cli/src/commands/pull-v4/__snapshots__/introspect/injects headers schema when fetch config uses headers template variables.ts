import { headers, fetchDefinition, contextConfig } from '@inkeep/agents-core';
import { z } from 'zod';

const supportContextHeaders = headers({
  schema: z.object({ "tz": z.string() }).strict(),
});
const timeInfo = fetchDefinition({
  id: 'time-info',
  name: 'Time Information',
  trigger: 'invocation',
  fetchConfig: {
    url: `https://world-time-api3.p.rapidapi.com/timezone/${supportContextHeaders.toTemplate("tz")}`,
    method: 'GET',
  },
  defaultValue: 'Unable to fetch timezone information',
});
export const supportContext = contextConfig({
  id: 'support-context',
  headers: supportContextHeaders,
  contextVariables: {
    timeInfo,
  },
});
