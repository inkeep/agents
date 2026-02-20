import { headers, fetchDefinition, contextConfig } from '@inkeep/agents-core';
import { z } from 'zod';

const activitiesPlannerContextHeaders = headers({
  schema: z.object({ "tz": z.string().optional() }),
});
const time = fetchDefinition({
  id: 'time',
  name: 'Time',
  trigger: 'invocation',
  fetchConfig: {
    url: `https://world-time-api3.p.rapidapi.com/timezone/${activitiesPlannerContextHeaders.toTemplate("tz")}`,
    method: 'GET',
  },
  defaultValue: 'Unable to fetch timezone information',
});
export const activitiesPlannerContext = contextConfig({
  id: 'activities-planner-context',
  headers: activitiesPlannerContextHeaders,
  contextVariables: {
    time,
  },
});
