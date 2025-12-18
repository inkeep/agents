import { mcpTool } from '@inkeep/agents-sdk';

export const workingGeocodeTool = mcpTool({
  id: 'working-geocode-tool',
  name: `Geocode Address`,
  serverUrl: `https://geocoder-mcp.vercel.app/mcp`,
  activeTools: ['geocode_address'],
});
