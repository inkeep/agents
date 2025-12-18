import { mcpTool } from '@inkeep/agents-sdk';

export const forecastWeatherTool = mcpTool({
  id: 'forecast-weather',
  name: `Forecast weather`,
  serverUrl: `https://weather-forecast-mcp.vercel.app/mcp`,
});
