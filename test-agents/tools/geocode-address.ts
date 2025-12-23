import { mcpTool } from '@inkeep/agents-sdk';

export const geocodeAddressTool = mcpTool({
  id: 'geocode-address',
  name: `Geocode address`,
  serverUrl: `https://geocoder-mcp.vercel.app/mcp`,
  activeTools: ['geocode', 'fake_geocode_tool_does_not_exist'],
});
