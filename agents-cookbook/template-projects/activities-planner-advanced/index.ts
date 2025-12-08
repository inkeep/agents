import { project } from '@inkeep/agents-sdk';
import { activitiesPlannerAdvancedAgent } from './agents/activities-planner-advanced.js';
import { exaMcpTool } from './tools/exa-mcp.js';
import { weatherMcpTool } from './tools/weather-mcp.js';


export const myProject = project({
  id: 'activities-planner-advanced',
  name: 'Activities planner advanced',
  description: 'Activities planner project template',
  model: 'openai/gpt-4o-mini',
  agents: () => [activitiesPlannerAdvancedAgent],
  tools: () => [weatherMcpTool, exaMcpTool],
});
