import { activitiesPlannerAgent } from './agents/activities-planner.js';
import { project } from '@inkeep/agents-sdk';
import { exaMcpTool } from './tools/exa-mcp.js';
import { weatherMcpTool } from './tools/weather-mcp.js';

export const myProject = project({
  id: 'activities-planner',
  name: 'Activities planner',
  description: 'Activities planner project template',
  agents: () => [activitiesPlannerAgent],
  tools: () => [weatherMcpTool, exaMcpTool],
});