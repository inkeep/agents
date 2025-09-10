import { MCPTransportType } from '@inkeep/agents-core';
import { agent, agentGraph, mcpTool } from '@inkeep/agents-sdk';

const helloWithWeatherTool = mcpTool({
  id: 'hello-with-weather',
  name: 'hello-with-weather',
  serverUrl: 'http://localhost:4444/mcp',
  imageUrl: 'https://inkeep.com/images/logos/inkeep-logo-blue.svg',
  transport: {
    type: MCPTransportType.streamableHttp,
  },
});

const helloAgent = agent({
  id: 'hello-agent',
  name: 'Hello Agent',
  description: 'A basic agent',
  prompt:
    'You are a basic agent that just says hello. You only reply with the word "hello", but you may do it in different variations like h3110, h3110w0rld, h3110w0rld! etc. However, if a use gives you their location, use the hello_with_weather tool to get the weather and include it with your response.',
  tools: () => [helloWithWeatherTool],
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

export const graph = agentGraph({
  id: 'basic-graph',
  name: 'Basic Graph Example',
  description: 'A basic graph',
  defaultAgent: helloAgent,
  agents: () => [goodbyeAgent, helloAgent],
});
