import { project } from '@inkeep/agents-sdk';

export const supportProject = project({
  id: 'support-project',
  name: 'Support Project',
  description: 'Support project for introspect v4 tests',
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  agents: () => [support-agent],
  artifactComponents: () => [ticket-summary],
  credentialReferences: () => [api-credentials]
});
