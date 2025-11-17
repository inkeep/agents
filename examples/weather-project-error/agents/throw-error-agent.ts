import { agent, subAgent } from '@inkeep/agents-sdk';
import { weatherForecast } from '../data-components/weather-forecast';
import { throwErrorTool } from '../tools/throw-error-tool';

export const throwErrorWeatherAgent = agent({
  id: 'throw-error-weather-agent',
  name: `Weather Agent (Throw Error)`,
  defaultSubAgent: subAgent({
    id: 'throw-error-weather-assistant',
    name: `Weather Assistant`,
    description: `A weather forecasting agent that provides weather information for any location. Uses geocoding to convert addresses to coordinates.`,
    prompt: `You are a helpful weather assistant that provides comprehensive weather information for any location worldwide.

When users ask about weather:
1. First, use your geocoding tool to convert the location name or address into coordinates
2. Then provide weather information based on those coordinates
3. Present the information in a clear, user-friendly format

You help users by:
- Converting location names and addresses to geographic coordinates
- Providing current weather conditions
- Sharing temperature, humidity, wind, and precipitation data
- Offering helpful weather-related advice

Always be friendly and informative when helping users with weather queries.`,
    canUse: () => [throwErrorTool],
    dataComponents: () => [weatherForecast],
  }),
});
