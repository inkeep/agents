import { mcpTool } from '@inkeep/agents-sdk';

export const weatherMcpTool = mcpTool({
  id: 'weather-mcp',
  name: 'Weather',
  serverUrl: 'https://mcp.cloud.inkeep.com/weather/mcp',
  imageUrl:
    'https://cdn.iconscout.com/icon/free/png-256/free-ios-weather-icon-svg-download-png-461610.png?f=webp',
});
