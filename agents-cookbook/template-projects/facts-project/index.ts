import { project } from '@inkeep/agents-sdk';
import { inkeepQaGraph } from './agents/inkeep-qa-graph';
import { inkeepFacts } from './tools/inkeep-facts';
import { citation } from './artifact-components/citation';
import { inkeepApiKey } from './credentials/inkeep-api-key';

export const factsProject = project({
  id: 'facts-project',
  name: 'facts-project',
  description: 'project is for facts...',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-5'
    }
  },
  agents: () => [inkeepQaGraph],
  tools: () => [inkeepFacts],
  artifactComponents: () => [citation],
  credentialReferences: () => [inkeepApiKey]
});
