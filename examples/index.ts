import { project } from '@inkeep/agents-sdk';
import { basicGraph } from 'graphs/basic.graph';
import { weatherGraph } from 'graphs/weather-graph.graph';

export const myProject = project({
  id: 'my-project-3',
  name: 'My Project',
  description: 'My project',
  graphs: () => [basicGraph, weatherGraph],
});
