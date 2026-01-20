import { project } from '@inkeep/agents-sdk';
import { activitiesPlannerAgent } from './agents/activities-planner.js';
import { exaMcpTool } from './tools/exa-mcp.js';
import { weatherMcpTool } from './tools/weather-mcp.js';

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
