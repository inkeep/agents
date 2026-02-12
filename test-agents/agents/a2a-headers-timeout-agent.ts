import { agent, externalAgent, subAgent } from '@inkeep/agents-sdk';

const hangingExternalAgent = externalAgent({
  id: 'hanging-external-agent',
  name: 'Hanging External Agent',
  description: 'An external agent that never responds to requests, causing a headers timeout.',
  baseUrl: 'http://localhost:19876',
});

export const a2aHeadersTimeoutAgent = agent({
  id: 'a2a-headers-timeout-agent',
  name: 'A2A Headers Timeout Agent',
  description: 'Agent that delegates to an external agent which causes a headers timeout.',
  externalAgents: () => [hangingExternalAgent],
  defaultSubAgent: subAgent({
    id: 'a2a-headers-timeout-assistant',
    name: 'Timeout Assistant',
    description: 'Assistant that delegates to a hanging external agent.',
    prompt: `You are an assistant that delegates tasks. When asked anything, always delegate to the 'hanging-external-agent'.`,
    canDelegateTo: () => [hangingExternalAgent],
  }),
});
