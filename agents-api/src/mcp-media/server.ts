import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImageTools } from './tools/image';

const SERVER_INSTRUCTIONS = `
Use these tools to inspect and manipulate images. All tools require a base64-encoded image as input.

## Tools
- **image_info** — get image dimensions, format, channels, and file size. Use this before resizing or cropping to know the source dimensions.
- **image_crop** — extract a rectangular region. Specify x, y (top-left corner), width, and height in pixels.
- **image_resize** — scale an image to target dimensions. Provide width, height, or both. Aspect ratio is preserved by default.

## Input format
All tools accept base64-encoded image data. If you have a URL, use curl from inkeep-http first, then pass the response body using \`{"$tool": "<_toolCallId>"}\`.

If you need to encode or decode base64, use base64_encode / base64_decode from inkeep-coreutils.

## Chaining example
1. curl({ "url": "https://example.com/photo.jpg" })
2. image_info({ "imageBase64": { "$tool": "<_toolCallId from step 1>" } }) — inspect dimensions
3. image_crop({ "imageBase64": { "$tool": "<_toolCallId from step 1>" }, "x": 0, "y": 0, "width": 200, "height": 200 })

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
