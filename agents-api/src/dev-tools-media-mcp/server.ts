import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImageTools } from './tools/image';

const SERVER_INSTRUCTIONS = `
Use these tools for image processing operations. All tools accept base64-encoded image data.

## Tools
- **image_info**: Get image metadata (dimensions, format, channels, file size). Use this first to understand what you're working with.
- **image_crop**: Extract a rectangular region from an image. Specify x, y (top-left corner), width, and height in pixels.
- **image_resize**: Scale an image to new dimensions. Provide width, height, or both. Aspect ratio is maintained by default.

## Input format
All tools accept base64-encoded image data in the imageBase64 parameter. Data URI prefixes (e.g. "data:image/png;base64,") are handled automatically.

## Chaining with dev-tools encoding tools
- To convert a raw image buffer to base64 before passing here, use base64_encode from the dev-tools MCP.
- To decode a base64 result back to binary, use base64_decode from the dev-tools MCP.
- image_crop and image_resize return base64-encoded image data that can be passed directly to another image tool or decoded with base64_decode.

## Chaining tool results
Reference syntax:
  { "$tool": "<call_id>" }

Example:
1. image_info({ "imageBase64": "..." })  (call_id: "call_a")
2. image_crop({ "imageBase64": { "$tool": "call_a" }, "x": 0, "y": 0, "width": 100, "height": 100 })
`.trim();

export interface DevToolsMediaScope {
  tenantId: string;
  projectId: string;
}

export function createDevToolsMediaServer(
  _sessionId: string,
  _scope?: DevToolsMediaScope
): McpServer {
  const server = new McpServer(
    { name: 'inkeep-dev-tools-media', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerImageTools(server);

  return server;
}
