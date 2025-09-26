import { project } from '@inkeep/agents-sdk';
import { customGraph } from './graphs/custom-graph';

export const myProject = project({
  id: 'custom-project',
  name: 'Custom Project',
  description: 'Project containing sample agent framework using SDK',
  graphs: () => [customGraph],
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-20250514',
    },
    structuredOutput: {
      model: 'anthropic/claude-3-5-haiku-20241022',
    },
    summarizer: {
      model: 'anthropic/claude-3-5-haiku-20241022',
    },
  },
});
