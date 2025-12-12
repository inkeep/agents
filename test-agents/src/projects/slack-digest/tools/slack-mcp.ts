import { mcpTool } from '@inkeep/agents-sdk';

export const slackMcpTool = mcpTool({
  id: 'slack-mcp',
  name: 'Slack',
  serverUrl: 'http://localhost:3006/slack/mcp',
});
