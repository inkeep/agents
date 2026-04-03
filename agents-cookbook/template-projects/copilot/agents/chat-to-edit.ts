import { agent, subAgent } from '@inkeep/agents-sdk';

const chatToEditSubAgent = subAgent({
  id: 'chat-to-edit',
  name: 'Chat to Edit',
  description: 'Mock chat-to-edit agent for local development',
  prompt:
    'You are a mock chat-to-edit agent. Always respond with: "This is the mock chat-to-edit experience. The real experience is on the production environment."',
});

export const chatToEditAgent = agent({
  id: 'chat-to-edit',
  name: 'Chat to Edit',
  description: 'Mock chat-to-edit copilot for local development',
  defaultSubAgent: chatToEditSubAgent,
  subAgents: () => [chatToEditSubAgent],
});
