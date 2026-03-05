import { project } from '@inkeep/agents-sdk';
import { activitiesPlannerAgent } from './agents/activities-planner';
import { exaMcpTool } from './tools/exa-mcp';
import { weatherMcpTool } from './tools/weather-mcp';

export const myProject = project({
  id: 'activities-planner',
  name: 'Activities planner',
  description: 'Activities planner project template',
  models: {
    base: { model: 'anthropic/claude-sonnet-4-5' },
  },
  agents: () => [activitiesPlannerAgent],
  tools: () => [weatherMcpTool, exaMcpTool],
});
