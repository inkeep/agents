import { project } from '@inkeep/agents-sdk';
import { weatherForecast } from './data-components/weather-forecast';
import { weatherGraph } from './graphs/weather-graph';
import { fdxgfv9HL7SXlfynPx8hf } from './tools/fdxgfv9HL7SXlfynPx8hf';
import { fUI2riwrBVJ6MepT8rjx0 } from './tools/fUI2riwrBVJ6MepT8rjx0';

export const myProject3 = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework using ',
  models: {
    base: { model: 'gpt-4o-mini' },
  },
  graphs: () => [weatherGraph],
  tools: () => [fUI2riwrBVJ6MepT8rjx0, fdxgfv9HL7SXlfynPx8hf],
  dataComponents: () => [weatherForecast],
});
