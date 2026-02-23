import { project } from '@inkeep/agents-sdk';
import { docsAssistant as docsAssistantAgent } from './agents/docs-assistant';
import { inkeepRagMcp } from './tools/inkeep-rag-mcp';

export const docsAssistant = project({
  id: 'docs-assistant',
  name: 'Docs Assistant',
  description: 'Docs assistant template',
  models: {
    base: {
      model: 'openai/gpt-4o-mini',
    },
  },
  agents: () => [docsAssistantAgent],
  tools: () => [inkeepRagMcp],
});
