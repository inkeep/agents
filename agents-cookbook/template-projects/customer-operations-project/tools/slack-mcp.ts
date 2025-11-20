import { mcpTool } from '@inkeep/agents-sdk';

export const slackMcp = mcpTool({
  id: 'slack-mcp',
  name: 'Slack',
  serverUrl: 'http://localhost:3006/slack/mcp'
});