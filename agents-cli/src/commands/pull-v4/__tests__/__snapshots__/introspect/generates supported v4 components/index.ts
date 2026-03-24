import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';
import { customerProfile } from './data-components/customer-profile';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentialsCredential } from './credentials/api-credentials';

export const supportProject = project({
  id: 'support-project',
  name: 'Support Project',
  description: 'Support project for introspect v4 tests',
  models: {
    base: {
      model: 'gpt-4o-mini',
    },
  },
  agents: () => [supportAgent],
  dataComponents: () => [customerProfile],
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentialsCredential],
});
