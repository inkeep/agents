import { agent } from '@inkeep/agents-sdk';
import { docsAssistant as docsAssistantSubAgent } from './sub-agents/docs-assistant';

export const docsAssistant = agent({
  id: 'docs-assistant',
  name: 'Docs Assistant',
  description: 'A agent that can answer questions about the documentation',
  defaultSubAgent: docsAssistantSubAgent,
  subAgents: () => [docsAssistantSubAgent],
});
