import { project } from '@inkeep/agents-sdk';
import { inkeepAgent } from './agents/enhanced-maestro-agent';

export const inkeepFactsProject = project({
  id: 'inkeep-facts-project',
  name: 'Inkeep Facts Project',
  description:
    'An Inkeep documentation assistant that answers questions about Inkeep products, services, and technical support using the Inkeep facts tool.',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-5',
    },
    structuredOutput: {
      model: 'anthropic/claude-sonnet-4-5',
    },
    summarizer: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  agents: () => [inkeepAgent],
  tools: () => [],
});
