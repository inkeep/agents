import { subAgent } from '@inkeep/agents-sdk';
import { inkeepRagMcp } from '../../tools/inkeep-rag-mcp';

export const docsAssistant = subAgent({
  id: 'docs-assistant',
  description: 'A agent that can answer questions about Inkeep documentation',
  prompt: `You are a helpful assistant that answers questions about the documentation.
    Use the Inkeep RAG MCP tool to find relevant information.`,
  name: 'Docs Assistant',
  canUse: () => [inkeepRagMcp],
});
