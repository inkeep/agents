import { project } from '@inkeep/agents-sdk';

export const myWeatherProject = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework using ',
  models: {
    base: { model: 'openai/gpt-4o-mini' }
  }
});