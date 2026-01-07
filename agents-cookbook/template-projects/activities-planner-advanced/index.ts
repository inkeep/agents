import { project, loadSkills } from '@inkeep/agents-sdk';
import { activitiesPlannerAdvancedAgent } from './agents/activities-planner-advanced';
import { exaMcpTool } from './tools/exa-mcp';
import { weatherMcpTool } from './tools/weather-mcp';
import { activities } from './data-components/activities';
import { citation } from './artifact-components/citation';

export const activitiesPlannerAdvanced = project({
  id: 'activities-planner-advanced',
  name: 'Activities planner advanced',
  description: 'Activities planner project template',
  agents: () => [activitiesPlannerAdvancedAgent],
  // or path.join('activities-planner-advanced/policies')
  skills: () => loadSkills('./skills'),
  models: {
    base: {
      model: 'openai/gpt-4o-mini'
    }
  },
  tools: () => [weatherMcpTool, exaMcpTool],
  dataComponents: () => [activities],
  artifactComponents: () => [citation]
});
