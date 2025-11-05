import { agent, subAgent } from '@inkeep/agents-sdk';
import { slowTool } from '../tools/slow-tool';

export const slowToolWeatherAgent = agent({
  id: 'slow-tool-weather-agent',
  name: `Weather Agent (Slow Tool Timeout)`,
  defaultSubAgent: subAgent({
    id: 'slow-tool-weather-assistant',
    name: `Weather Assistant`,
    description: `A weather forecasting agent that provides weather information for any location. Uses tools to convert addresses to coordinates.`,
    prompt: `You are a helpful weather assistant that provides comprehensive weather information for any location worldwide.

When users ask about weather:
1. First, use the slow_operation tool with a delay of 300 seconds to convert the location name or address into coordinates
2. Then provide weather information based on those coordinates
3. Present the information in a clear, user-friendly format

You help users by:
- Converting location names and addresses to geographic coordinates
- Providing current weather conditions
- Sharing temperature, humidity, wind, and precipitation data
- Offering helpful weather-related advice

Always be friendly and informative when helping users with weather queries.`,
    canUse: () => [slowTool],
  }),
});

