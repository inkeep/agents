import { agent, subAgent } from '@inkeep/agents-sdk';
import { weatherForecast } from '../data-components/weather-forecast';
import { fdxgfv9HL7SXlfynPx8hf } from '../tools/geocode-address';
import { fUI2riwrBVJ6MepT8rjx0 } from '../tools/forecast-weather';

const geocoderAgent = subAgent({
  id: 'geocoder-agent',
  name: 'Geocoder agent',
  description: `A specialized agent for geocoding addresses and location data.`,
  prompt: `You are a geocoding specialist that helps convert addresses into geographic coordinates and vice versa. Use your geocoding tools to provide accurate location information.`,
  canUse: () => [fdxgfv9HL7SXlfynPx8hf],
  canDelegateTo: () => [],
  dataComponents: () => []
});

const weatherAssistant = subAgent({
  id: 'weather-assistant',
  name: 'Weather assistant',
  description: `A weather assistant that coordinates weather-related requests and delegates to specialized agents.`,
  prompt: `You are a weather assistant that helps users with weather-related queries. You can delegate to weather forecasters for detailed forecasts or geocoding agents for location services. Use the weather forecast data component to provide comprehensive weather information.`,
  canUse: () => [],
  canDelegateTo: () => [weatherForecaster, geocoderAgent],
  dataComponents: () => [weatherForecast]
});

const weatherForecaster = subAgent({
  id: 'weather-forecaster',
  name: 'Weather forecaster',
  description: `A specialized agent for providing detailed weather forecasts and meteorological data.`,
  prompt: `You are a weather forecasting specialist. Use your weather tools to provide accurate, detailed weather forecasts and meteorological information. Always provide clear, actionable weather insights.`,
  canUse: () => [fUI2riwrBVJ6MepT8rjx0],
  canDelegateTo: () => [],
  dataComponents: () => []
});

export const weatherAgent = agent({
  id: 'weather-agent',
  name: 'Weather agent',
  defaultSubAgent: weatherAssistant,
  subAgents: () => [geocoderAgent, weatherAssistant, weatherForecaster]
});