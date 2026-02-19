import path from 'node:path';
import { loadSkills, project } from '@inkeep/agents-sdk';
import { activitiesPlannerAdvancedAgent } from './agents/activities-planner-advanced';
import { citation } from './artifact-components/citation';
import { activities } from './data-components/activities';
import { exaMcpTool } from './tools/exa-mcp';
import { weatherMcpTool } from './tools/weather-mcp';

export const activitiesPlannerAdvanced = project({
  id: 'activities-planner-advanced',
  name: 'Activities planner advanced',
  description: 'Activities planner project template with advanced SDK features',
  agents: () => [activitiesPlannerAdvancedAgent],
  skills: () => loadSkills(path.join('activities-planner-advanced/skills')),
  models: {
    base: {
      model: 'openai/gpt-4o-mini',
    },
  },
  tools: () => [weatherMcpTool, exaMcpTool],
  dataComponents: () => [activities],
  artifactComponents: () => [citation],
});
