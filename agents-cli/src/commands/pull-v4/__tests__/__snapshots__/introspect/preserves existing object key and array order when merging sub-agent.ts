import { agent, subAgent } from '@inkeep/agents-sdk';

export const planner = subAgent({
  id: 'planner',
  name: 'Planner',
  description: 'Routes requests',
  prompt: 'Delegate to helper agents.',
  canDelegateTo: () => [weather, coordinates, websearch]
});

export const weather = subAgent({
  id: 'weather',
  name: 'Weather'
});

export const coordinates = subAgent({
  id: 'coordinates',
  name: 'Coordinates'
});

export const websearch = subAgent({
  id: 'websearch',
  name: 'Websearch'
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: planner,
  subAgents: () => [planner, weather, coordinates, websearch]
});
