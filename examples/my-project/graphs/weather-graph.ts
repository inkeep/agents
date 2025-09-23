import { agent, agentGraph } from '@inkeep/agents-sdk';
import { weatherForecast } from '../data-components/weather-forecast';
import { fUI2riwrBVJ6MepT8rjx0 } from '../tools/fUI2riwrBVJ6MepT8rjx0';
import { fdxgfv9HL7SXlfynPx8hf } from '../tools/fdxgfv9HL7SXlfynPx8hf';

const geocoderAgent = agent({
  id: 'geocoder-agent',
  name: 'Geocoder agent',
  description: 'Responsible for converting location or address into coordinates',
  prompt: 'You are a helpful assistant responsible for converting location or address into coordinates using your geocode tool',
  canUse: () => [fdxgfv9HL7SXlfynPx8hf]
});

const weatherAssistant = agent({
  id: 'weather-assistant',
  name: 'Weather assistant',
  description: 'This component is used to render a group of times in a day along with the weather temperature (in Farenheit) and condition at give times.',
  prompt: 'You are a helpful assistant. When the user asks about the weather in a given location, first ask the geocoder agent for the coordinates, and then pass those coordinates to the weather forecast agent to get the weather forecast',
  canDelegateTo: () => [geocoderAgent, weatherForecaster],
  dataComponents: () => [weatherForecast]
});

const weatherForecaster = agent({
  id: 'weather-forecaster',
  name: 'Weather forecaster',
  description: 'This agent is responsible for taking in coordinates and returning the forecast for the weather at that location',
  prompt: 'You are a helpful assistant responsible for taking in coordinates and returning the forecast for that location using your forecasting tool',
  canUse: () => [fUI2riwrBVJ6MepT8rjx0]
});

export const weatherGraph = agentGraph({
  id: 'weather-graph',
  name: 'Weather graph',
  defaultAgent: weatherAssistant,
  agents: () => [geocoderAgent, weatherAssistant, weatherForecaster]
});