import { project } from '@inkeep/agents-sdk';
import { docsAssistantAgent } from './agents/docs-assistant';
import { inkeepRagMcpTool } from './tools/inkeep-rag-mcp';

export const myProject = project({
  id: 'docs-assistant',
  name: 'Docs Assistant',
  description: 'Docs assistant template',
  agents: () => [docsAssistantAgent],
  tools: () => [inkeepRagMcpTool],
  models: {
    'base': {
      'model': 'anthropic/claude-sonnet-4-5'
    },
    'structuredOutput': {
      'model': 'anthropic/claude-sonnet-4-5'
    },
    'summarizer': {
      'model': 'anthropic/claude-sonnet-4-5'
    }
  }
});
