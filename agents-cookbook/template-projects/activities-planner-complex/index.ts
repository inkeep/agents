import path from 'node:path';
import { loadSkills, project } from '@inkeep/agents-sdk';
import { activitiesPlannerComplexAgent } from './agents/activities-planner-complex';
import { citation } from './artifact-components/citation';
import { activities } from './data-components/activities';
import { exaMcpTool } from './tools/exa-mcp';
import { weatherMcpTool } from './tools/weather-mcp';

export const activitiesPlannerComplex = project({
  id: 'activities-planner-complex',
  name: 'Activities planner complex',
  description: 'Activities planner project template with advanced SDK features',
  agents: () => [activitiesPlannerComplexAgent],
  skills: () => loadSkills(path.join('activities-planner-complex/skills')),
  models: {
    base: {
      model: 'openai/gpt-4o-mini',
    },
  },
  tools: () => [weatherMcpTool, exaMcpTool],
  dataComponents: () => [activities],
  artifactComponents: () => [citation],
});
