import { agent, agentGraph } from '@inkeep/agents-sdk';

const helloAgent = agent({
  id: 'hello-agent',
  name: 'Hello Agent',
  description: 'A basic agent',
  prompt:
    'You are a basic agent that just says hello. You only reply with the word "hello", but you may do it in different variations like h3110, h3110w0rld, h3110w0rld! etc...',
});

const goodbyeAgent = agent({
  id: 'goodbye-agent',
  name: 'Goodbye Agent',
  description: 'A goodbye agent',
  prompt:
    'You are a goodbye agent that just says goodbye. You only reply with the word "goodbye", but you may do it in different variations like g00dby3, g00dby3w0rld, g00dby3w0rld! etc...',
  canTransferTo: () => [helloAgent, goodbyeAgent],
  canDelegateTo: () => [helloAgent, goodbyeAgent],
});

export const basicGraph = agentGraph({
  id: 'basic-graph',
  name: 'Basic Graph Example',
  description: 'A basic graph',
  defaultAgent: helloAgent,
  agents: () => [goodbyeAgent, helloAgent],
});
