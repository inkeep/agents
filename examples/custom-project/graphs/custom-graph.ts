import { contextConfig, requestContextSchema } from '@inkeep/agents-core';
import { agent, agentGraph, agentMcp, mcpTool } from '@inkeep/agents-sdk';
import { development } from 'custom-project/environments';
import { z } from 'zod';

const stripeTool = mcpTool({
  id: 'stripe-tool',
  name: 'stripe',
  description: 'Stripe API',
  serverUrl: 'https://mcp.stripe.com',
  credential: development.credentials.stripe_api_credential,
  activeTools: ['dummy-tool', 'dummy-tool-2', 'get_stripe_account_info', 'list_customers'],
});

const mainAgent = agent({
  id: 'main-agent',
  name: 'Main agent',
  type: 'internal',
  description: `This agent is responsible for answering all questions`,
  prompt: `You are a helpful assistant responsible for answering all questions`,
  canUse: () => [
    agentMcp({
      server: stripeTool,
      selectedTools: ['dummy-tool', 'get_stripe_account_info', 'dummy-tool-3'],
    }),
  ],
});

const localTool = mcpTool({
  id: 'local-tool',
  name: 'Local tool 4444',
  description: 'Local tool 4444',
  serverUrl: 'http://localhost:4444/api/mcp',
});

// Define schema for expected headers (use lowercase keys)
const requestContext = requestContextSchema({
  schema: z.object({
    user_id: z.string().optional(),
    auth_token: z.string().optional(),
    org_name: z.string().optional(),
  }),
});

// Configure context for your graph
const userContext = contextConfig({
  id: 'user-context',
  name: 'User Context',
  description: 'User personalization context',
  requestContextSchema: requestContext,
});

const sideAgent = agent({
  id: 'side-agent',
  name: 'Side agent',
  type: 'internal',
  description: `This is a backup agent`,
  prompt: `You are a helpful assistant responsible for ${requestContext.toTemplate('org_name')}. Answering all questions the main agent is unable to answer.
  
  If you use the local tool, make sure to end the message to the user with this sentenc: It was a pleasure helping you today, ${requestContext.toTemplate('org_name')}.`,
  canUse: () => [
    agentMcp({
      server: localTool,
      selectedTools: ['dummy-tool'],
      headers: {
        'Req-Context-Org-Name': `${requestContext.toTemplate('org_name')}`,
      },
    }),
  ],
});

export const customGraph = agentGraph({
  id: 'custom-graph',
  name: 'Custom graph from SDK',
  defaultAgent: mainAgent,
  agents: () => [mainAgent, sideAgent],
  contextConfig: userContext,
});
