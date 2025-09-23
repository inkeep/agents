import { project } from '@inkeep/agents-sdk';
import { weatherForecast } from './data-components/weather-forecast';
import { basicGraph } from './graphs/basic-graph';
import { weatherGraph } from './graphs/weather-graph';
import { fUI2riwrBVJ6MepT8rjx0 } from './tools/fUI2riwrBVJ6MepT8rjx0';
import { fdxgfv9HL7SXlfynPx8hf } from './tools/fdxgfv9HL7SXlfynPx8hf';

export const myProject = project({
  id: 'my-project',
  name: 'My Project',
  description: 'My project',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-20250514',
      providerOptions: {}
    }
  },
  graphs: () => [basicGraph, weatherGraph],
  tools: () => [fUI2riwrBVJ6MepT8rjx0, fdxgfv9HL7SXlfynPx8hf],
  dataComponents: () => [weatherForecast]
});