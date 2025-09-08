import { agent, agentGraph } from './packages/agents-sdk/dist/index';

const basicAgent = agent({
  id: 'basic-agent',
  name: 'Basic Agent',
  prompt: 'You are a helpful assistant.',
});

export const graph = agentGraph({
  defaultAgent: basicAgent,
  agents: [basicAgent],
});
