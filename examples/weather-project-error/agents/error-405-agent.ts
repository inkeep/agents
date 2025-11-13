import { agent, subAgent } from '@inkeep/agents-sdk';
import { error405Tool } from '../tools/error-405-tool';

export const error405WeatherAgent = agent({
  id: 'error-405-weather-agent',
  name: `Weather Agent (405 Error)`,
  defaultSubAgent: subAgent({
    id: 'error-405-weather-assistant',
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
    canUse: () => [error405Tool],
  }),
});
