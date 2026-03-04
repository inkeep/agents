import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';
import { weatherMcpTool } from './tools/weather-mcp';
import { exaMcpTool } from './tools/exa-mcp';
import { customerProfile } from './data-components/customer-profile';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentials } from './credentials/api-credentials';

export const supportProject = project({
  id: 'support-project',
  name: 'Support Project',
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  agents: () => [supportAgent],
  tools: () => [weatherMcpTool, exaMcpTool],
  description: 'Support project for introspect v4 tests',
  dataComponents: () => [customerProfile],
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentials]
});
