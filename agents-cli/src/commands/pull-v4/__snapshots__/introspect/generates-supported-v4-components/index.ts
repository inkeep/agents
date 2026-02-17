import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentials } from './credentials/api-credentials';

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
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentials]
});
