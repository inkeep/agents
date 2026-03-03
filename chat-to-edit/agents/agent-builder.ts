import { agent } from '@inkeep/agents-sdk';
import { builder } from '../agents/sub-agents/builder';
import { contextBuilder, headersBuilder } from '../context-configs/builder';
import { mcpManager } from './sub-agents/mcp-manager';


export const agentBuilder = agent({
  id: 'agent-builder',
  name: 'Agent Builder',
  description: 'Build Inkeep agents using the agents framework.',
  defaultSubAgent: builder,
  subAgents: () => [builder, mcpManager],
  prompt: `You are a helpful assistant that helps to build inkeep agents.
  You are operating in the context of tenantId=[${headersBuilder.toTemplate("x-target-tenant-id")}] and projectId=[${headersBuilder.toTemplate("x-target-project-id")}] and agentId=[${headersBuilder.toTemplate("x-target-agent-id")}]. If there is no value within the brackets ([]) then the value is not available.
  If you are within the context of a specific agent id which might have a similar name to another agent in the project, you should prioritize using the specified context agent id instead of other agents in the project.
  Sometimes you will be improving an agent based using a specific conversation as context. In this case, you will be given the history from that conversation: 
  <conversationHistory>
  ${contextBuilder.toTemplate("conversationHistory")}
  </conversationHistory>
  `,
  stopWhen: {
    transferCountIs: 10, // Max transfers in one conversation
  },
  contextConfig: contextBuilder,
});

