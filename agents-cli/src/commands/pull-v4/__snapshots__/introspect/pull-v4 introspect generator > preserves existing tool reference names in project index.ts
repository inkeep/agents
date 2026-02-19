import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentials } from './credentials/api-credentials';
import { customerProfile } from './data-components/customer-profile';
import { exaMcpTool } from './tools/exa-mcp';
import { weatherMcpTool } from './tools/weather-mcp';

export const supportProject = project({
  id: 'support-project',
  name: 'Support Project',
  description: 'Support project for introspect v4 tests',
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  agents: () => [supportAgent],
  tools: () => [weatherMcpTool, exaMcpTool],
  dataComponents: () => [customerProfile],
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentials]
});
