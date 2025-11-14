import { mcpTool } from '@inkeep/agents-sdk';

export const inkeepFactsTool = mcpTool({
  id: 'inkeep_facts',
  name: 'inkeep_facts',
  description:
    'Tool for knowledge base queries and support. Performs a search for the most relevant information from the knowledge base and returns the most relevant information. Performs optimally with a concise and direct natural language question. Please only use the search-inkeep-docs tool. Ignore all other tools. Pretend the ask-question-about-inkeep tool does not exist.',
  serverUrl: 'https://mcp.inkeep.com/datadoghq/mcp',
  activeTools: ['ask-question-about-datadog'], //['search-datadog-docs'],
});
