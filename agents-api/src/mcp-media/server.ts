import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImageTools } from './tools/image';

const SERVER_INSTRUCTIONS = `
Use these tools to inspect and manipulate images. All tools require a base64-encoded image as input.

## Tools
- **image_info** — get image dimensions, format, channels, and file size. Use this before resizing or cropping to know the source dimensions.
- **image_crop** — extract a rectangular region. Specify x, y (top-left corner), width, and height in pixels.
- **image_resize** — scale an image to target dimensions. Provide width, height, or both. Aspect ratio is preserved by default.

## Input format
All tools accept base64-encoded image data. If you have a URL, fetch it and base64-encode the response body before passing it to these tools.

## Chaining example
1. Fetch the image URL and base64-encode the response body.
2. image_info({ "imageBase64": "<base64>" }) — inspect dimensions
3. image_crop({ "imageBase64": "<base64>", "x": 0, "y": 0, "width": 200, "height": 200 })

Base64 image data is large — always chain via references, never copy inline.
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
