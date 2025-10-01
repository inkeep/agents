import { mcpTool } from '@inkeep/agents-sdk';

export const orderTrackingMcp = mcpTool({
  id: 'order-tracking-mcp',
  name: 'Order Tracking Service',
  description: 'Mock order tracking MCP server that provides comprehensive order tracking functionality including order lookup, delivery confirmation, order listing, and email-based order search. Supports 4 main tools: track_order, confirm_delivery, list_orders, and get_orders_by_email.',
  serverUrl: 'https://mock-order-tracking-mcp-alpha.preview.inkeep.com/mcp'
});
