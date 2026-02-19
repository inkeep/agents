import { loadSkills, project } from '@inkeep/agents-sdk';
import path from 'node:path';
import { supportAgent } from './agents/support-agent';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentials } from './credentials/api-credentials';
import { customerProfile } from './data-components/customer-profile';

export const supportProject = project({
  id: 'support-project',
  name: 'Support Project',
  description: 'Support project for introspect v4 tests',
  agents: () => [supportAgent],
  skills: () => loadSkills(path.join('support-project', 'skills')),
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  dataComponents: () => [customerProfile],
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentials]
});
