import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';

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
  artifactComponents: () => [ticket-summary],
  credentialReferences: () => [api-credentials]
});
