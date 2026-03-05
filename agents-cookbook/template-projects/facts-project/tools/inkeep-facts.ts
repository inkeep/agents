import { mcpTool } from '@inkeep/agents-sdk';

export const inkeepFacts = mcpTool({
  id: 'inkeep_facts',
  name: 'inkeep_facts',
  serverUrl: 'https://mcp.inkeep.com/inkeep/mcp',
  activeTools: ['search-inkeep-docs'],
});
