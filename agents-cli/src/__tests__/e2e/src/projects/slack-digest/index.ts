import { project } from '@inkeep/agents-sdk';
import { slackMcpTool } from './tools/slack-mcp.js';
import { slackDigestAgent } from './agents/slack-digest.js';

export const myProject = project({
  id: 'slack-digest',
  name: 'Slack Digest',
  description: 'Slack Digest project template',
  agents: () => [slackDigestAgent],
  tools: () => [slackMcpTool],
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
