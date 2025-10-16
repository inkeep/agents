import { agent, subAgent } from '@inkeep/agents-sdk';
import { weatherForecast } from '../data-components/weather-forecast';
import { forecastWeather } from '../tools/forecast-weather';
import { geocodeAddress } from '../tools/geocode-address';

const geocoderAgent = subAgent({
  id: `geocoder-agent`,
  name: `Geocoder agent`,
  description: `Specialized agent for converting addresses and location names into geographic coordinates. This agent handles all location-related queries and provides accurate latitude/longitude data for weather lookups.`,
  prompt: `You are a geocoding specialist that converts addresses, place names, and location descriptions
into precise geographic coordinates. You help users find the exact location they're asking about
and provide the coordinates needed for weather forecasting.

When users provide:
- Street addresses
- City names
- Landmarks
- Postal codes
- General location descriptions

You should use your geocoding tools to find the most accurate coordinates and provide clear
information about the location found.`,
  canUse: () => [geocodeAddress],
  canTransferTo: () => [],
  canDelegateTo: () => [],
  dataComponents: () => [],
  artifactComponents: () => [],
});

const weatherForecaster = subAgent({
  id: `weather-forecaster`,
  name: `Weather forecaster`,
  description: `Specialized agent for retrieving detailed weather forecasts and current conditions. This agent focuses on providing accurate, up-to-date weather information using geographic coordinates.`,
  prompt: `You are a weather forecasting specialist that provides detailed weather information
including current conditions, forecasts, and weather-related insights.

You work with precise geographic coordinates to deliver:
- Current weather conditions
- Short-term and long-term forecasts
- Temperature, humidity, wind, and precipitation data
- Weather alerts and advisories
- Seasonal and climate information

Always provide clear, actionable weather information that helps users plan their activities.`,
  canUse: () => [forecastWeather],
  canTransferTo: () => [],
  canDelegateTo: () => [],
  dataComponents: () => [],
  artifactComponents: () => [],
});

const weatherAssistant = subAgent({
  id: `weather-assistant`,
  name: `Weather assistant`,
  description: `Main weather assistant that coordinates between geocoding and forecasting services to provide comprehensive weather information. This assistant handles user queries and delegates tasks to specialized sub-agents as needed.`,
  prompt: `You are a helpful weather assistant that provides comprehensive weather information
for any location worldwide. You coordinate with specialized agents to:

1. Convert location names/addresses to coordinates (via geocoder)
2. Retrieve detailed weather forecasts (via weather forecaster)
3. Present weather information in a clear, user-friendly format

When users ask about weather:
- If they provide a location name or address, delegate to the geocoder first
- Once you have coordinates, delegate to the weather forecaster
- Present the final weather information in an organized, easy-to-understand format
- Include relevant details like temperature, conditions, precipitation, wind, etc.
- Provide helpful context and recommendations when appropriate

You have access to weather forecast data components that can enhance your responses
with structured weather information.`,
  canUse: () => [],
  canTransferTo: () => [],
  canDelegateTo: () => [weatherForecaster, geocoderAgent],
  dataComponents: () => [weatherForecast],
  artifactComponents: () => [],
});

export const weatherAgent = agent({
  id: `weather-agent`,
  name: `Weather agent`,
  defaultSubAgent: weatherAssistant,
  subAgents: () => [geocoderAgent, weatherAssistant, weatherForecaster],
});