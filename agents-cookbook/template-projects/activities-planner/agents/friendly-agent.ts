import { agent, subAgent } from '@inkeep/agents-sdk';

const friendlySubAgent = subAgent({
  id: 'friendly-agent',
  name: 'Friendly agent',
  description: 'A simple friendly agent that responds to messages',
  prompt: 'You are a helpful and friendly assistant. Respond to the user concisely.',
});

export const friendlyAgent = agent({
  id: 'friendly-agent',
  name: 'Friendly agent',
  description: 'A simple friendly agent for testing — no external tools required',
  defaultSubAgent: friendlySubAgent,
  subAgents: () => [friendlySubAgent],
});
