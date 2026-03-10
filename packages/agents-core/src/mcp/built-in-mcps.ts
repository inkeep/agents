import type { McpTool, ToolSelect } from '../types/entities';

export const DEV_TOOLS_MCP = {
  id: 'dev-tools',
  name: 'inkeep-dev-tools',
  version: '1.0.0',
  description: 'Core dev tools: text, encoding, JSON, HTML, images, HTTP, scratchpad',
  urlPath: '/dev-tools/mcp',
  tools: [
    'text_search',
    'text_replace',
    'text_extract',
    'text_truncate',
    'text_diff',
    'json_format',
    'json_query',
    'json_merge',
    'json_diff',
    'base64_encode',
    'base64_decode',
    'hash',
    'url_encode',
    'url_decode',
    'html_to_markdown',
    'image_resize',
    'image_metadata',
    'fetch_url',
    'http_request',
    'scratchpad_write',
    'scratchpad_read',
    'scratchpad_list',
    'get_current_time',
  ],
} as const;

export const DEV_TOOLS_SEARCH_MCP = {
  id: 'dev-tools-search',
  name: 'inkeep-dev-tools-search',
  version: '1.0.0',
  description: 'Web search tools powered by Exa (requires EXA_API_KEY)',
  urlPath: '/dev-tools-search/mcp',
  tools: ['web_search', 'find_similar'],
} as const;

export type BuiltInMcpId = (typeof DEV_TOOLS_MCP)['id'] | (typeof DEV_TOOLS_SEARCH_MCP)['id'];

export const isDevToolsMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.includes(DEV_TOOLS_MCP.urlPath);

export const isDevToolsSearchMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.includes(DEV_TOOLS_SEARCH_MCP.urlPath);
