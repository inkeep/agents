import { project } from '@inkeep/agents-sdk';
import { weatherForecast } from './data-components/weather-forecast';
import { weatherAgent } from './agents/weather-agent';
import { fdxgfv9HL7SXlfynPx8hf } from './tools/fdxgfv9HL7SXlfynPx8hf';
import { fUI2riwrBVJ6MepT8rjx0 } from './tools/fUI2riwrBVJ6MepT8rjx0';
import { dataWorkshopAgent } from './agents/data-workshop.agent';

export const myProject3 = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework using ',
  models: {
    base: { model: 'openai/gpt-4o-mini' },
  },
  agents: () => [weatherAgent, dataWorkshopAgent],
  tools: () => [fUI2riwrBVJ6MepT8rjx0, fdxgfv9HL7SXlfynPx8hf],
  dataComponents: () => [weatherForecast],
  sandboxConfig: {
    provider: 'local',
    runtime: 'node22',
    timeout: 30000,
    vcpus: 1,
  },
});
