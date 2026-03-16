import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImageTools } from './tools/image';

const SERVER_INSTRUCTIONS = `
Use these tools to inspect and manipulate images.

## Tools
- **image_info** — get image dimensions, format, channels, and file size. Use this before resizing or cropping to know the source dimensions.
- **image_crop** — extract a rectangular region. Specify x, y (top-left corner), width, and height in pixels.
- **image_resize** — scale an image to target dimensions. Provide width, height, or both. Aspect ratio is preserved by default.

## Input format
All tools accept an image object with fields: data (base64-encoded bytes), encoding ("base64"), and mimeType (e.g. "image/png"). If you have a URL, fetch it and base64-encode the response body.

## Chaining example
Tools return the same image object format they accept, so you can chain them directly:
1. image_info({ "image": { "data": "<base64>", "encoding": "base64", "mimeType": "image/png" } }) — inspect dimensions
2. image_crop({ "image": <ref to step 1 result>, "x": 0, "y": 0, "width": 200, "height": 200 })
3. image_resize({ "image": <ref to step 2 result>, "width": 100 })

Image data is large — always chain via references, never copy inline.
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
    { name: 'inkeep-media', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerImageTools(server);

  return server;
}
