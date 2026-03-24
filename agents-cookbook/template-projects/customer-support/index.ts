import { project } from '@inkeep/agents-sdk';
import { customerSupport } from './agents/customer-support';
import { knowledgeBaseMcpTool } from './tools/knowledge-base-mcp';
import { zendeskMcpTool } from './tools/zendesk-mcp';

export const myProject = project({
  id: 'customer-support',
  name: 'Customer Support',
  description: 'Customer support template',
  agents: () => [customerSupport],
  tools: () => [knowledgeBaseMcpTool, zendeskMcpTool],
  models: {
    base: { model: 'openai/gpt-4o-mini' },
  },
});
