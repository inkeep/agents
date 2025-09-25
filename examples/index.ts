import { project } from '@inkeep/agents-sdk';
import { basicGraph } from 'graphs/basic.graph';
import { dataWorkshopGraph } from 'graphs/data-workshop.graph';
import { weatherGraph } from 'graphs/weather-graph.graph';

export const myProject = project({
  id: 'my-project',
  name: 'My Project',
  description: 'My project',
  graphs: () => [basicGraph, weatherGraph, dataWorkshopGraph],
  models: {
    base: { model: 'anthropic/claude-4-sonnet-20250514' },
    structuredOutput: { model: 'openai/gpt-4o-mini-2024-07-18' },
    summarizer: { model: 'openai/gpt-4o-mini-2024-07-18' },
  },
});
