import type { McpTool, ToolSelect } from '../types/entities';

export const DEV_TOOLS_MCP = {
  id: 'dev-tools',
  name: 'inkeep-dev-tools',
  version: '1.0.0',
  description: 'Core dev tools: text, encoding, JSON, HTML, and utility',
  urlPath: '/dev-tools/mcp',
  tools: [
    'text_search',
    'text_replace',
    'text_extract',
    'text_truncate',
    'text_diff',
    'patch_apply',
    'regex_match',
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
    'calculate',
    'uuid',
    'timestamp',
  ],
} as const;

export const DEV_TOOLS_HTTP_MCP = {
  id: 'dev-tools-http',
  name: 'inkeep-dev-tools-http',
  version: '1.0.0',
  description: 'Outbound HTTP request tools',
  urlPath: '/dev-tools-http/mcp',
  tools: ['fetch_url'],
} as const;

export const DEV_TOOLS_MEDIA_MCP = {
  id: 'dev-tools-media',
  name: 'inkeep-dev-tools-media',
  version: '1.0.0',
  description: 'Image processing tools powered by Sharp',
  urlPath: '/dev-tools-media/mcp',
  tools: ['image_info', 'image_crop', 'image_resize'],
} as const;

export const DEV_TOOLS_SEARCH_MCP = {
  id: 'dev-tools-search',
  name: 'inkeep-dev-tools-search',
  version: '1.0.0',
  description: 'Web search tools powered by Exa (requires EXA_API_KEY)',
  urlPath: '/dev-tools-search/mcp',
  tools: ['web_search', 'find_similar'],
} as const;

export type BuiltInMcpId =
  | (typeof DEV_TOOLS_MCP)['id']
  | (typeof DEV_TOOLS_HTTP_MCP)['id']
  | (typeof DEV_TOOLS_MEDIA_MCP)['id']
  | (typeof DEV_TOOLS_SEARCH_MCP)['id'];

export const isDevToolsMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.includes(DEV_TOOLS_MCP.urlPath);

export const isDevToolsHttpMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.includes(DEV_TOOLS_HTTP_MCP.urlPath);

export const isDevToolsMediaMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.includes(DEV_TOOLS_MEDIA_MCP.urlPath);

export const isDevToolsSearchMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.includes(DEV_TOOLS_SEARCH_MCP.urlPath);
