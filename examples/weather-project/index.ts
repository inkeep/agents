import { project } from '@inkeep/agents-sdk';

import { dataWorkshopAgent } from './agent/data-workshop-agent';
import { weatherAgent } from './agent/weather-agent';
import { weatherForecast } from '../data-components/weather-forecast';
import { fdxgfv9HL7SXlfynPx8hf } from '../tools/fdxgfv9HL7SXlfynPx8hf';
import { fUI2riwrBVJ6MepT8rjx0 } from '../tools/fUI2riwrBVJ6MepT8rjx0';

export const myWeatherProject = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework using ',
  models: {
    base: {
      model: 'openai/gpt-4o-mini'
    }
  },
  agents: {
    'data-workshop-agent': dataWorkshopAgent,
    'weather-agent': weatherAgent
  },
  tools: {
    fdxgfv9HL7SXlfynPx8hf: fdxgfv9HL7SXlfynPx8hf,
    fUI2riwrBVJ6MepT8rjx0: fUI2riwrBVJ6MepT8rjx0
  },
  dataComponents: {
    'weather-forecast': weatherForecast
  },
  artifactComponents: {},
  credentialReferences: {}
});