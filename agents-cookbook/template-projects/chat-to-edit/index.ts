import { project } from '@inkeep/agents-sdk';
import { agentBuilder } from './agents/agent-builder';
import { inkeepManagementTools } from './tools/inkeepManagementTools';

export const myProject = project({
  id: 'chat-to-edit',
  name: 'Chat to edit',
  description: 'Chat to edit project',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  agents: () => [agentBuilder],
  tools: () => [inkeepManagementTools],
});
