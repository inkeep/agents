import { project } from '@inkeep/agents-sdk';
import { dataWorkshopAgent } from './agents/data-workshop-agent';
import { weatherAgent } from './agents/weather-agent';
import { geocodeAddress } from './tools/geocode-address';
import { forecastWeather } from './tools/forecast-weather';
import { weatherForecast } from './data-components/weather-forecast';

export const myWeatherProject = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework using ',
  models: {
    base: { model: 'openai/gpt-4o-mini' }
  },
  agents: () => [
    weatherAgent,
    dataWorkshopAgent
  ],
  tools: () => [
    forecastWeather,
    geocodeAddress
  ],
  dataComponents: () => [
    weatherForecast
  ]
});