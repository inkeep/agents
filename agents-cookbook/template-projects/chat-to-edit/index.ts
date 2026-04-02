import { project } from '@inkeep/agents-sdk';
import { chatToEditAgent } from './agents/chat-to-edit';

export const chatToEditProject = project({
  id: 'chat-to-edit',
  name: 'Chat to Edit',
  description: 'Mock copilot project for local development',
  models: {
    base: { model: 'anthropic/claude-sonnet-4-5' },
  },
  agents: () => [chatToEditAgent],
});
