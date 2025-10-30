import { project } from '@inkeep/agents-sdk';
import { weatherAgent } from './agents/weather-agent';

export const myWeatherProject = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework using ',
  models: {
    base: { model: 'openai/gpt-4o-mini' }
  },
  agents: () => [weatherAgent],
});