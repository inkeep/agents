import { project } from '@inkeep/agents-sdk';
import { deepResearchAgent } from './agents/deep-research';
import { firecrawlMcpTool } from './tools/firecrawl-mcp';
import { supportAgent } from './agents/support-agent';
import { customerProfile } from './data-components/customer-profile';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentials } from './credentials/api-credentials';

export const myProject = project({
  id: 'deep-research',
  name: 'Deep Research',
  description: 'Deep research project template',
  agents: () => [supportAgent],
  tools: () => [firecrawlMcpTool],
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  dataComponents: () => [customerProfile],
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentials]
});
